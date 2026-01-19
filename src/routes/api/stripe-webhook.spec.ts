import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { markRunPaid, env } = vi.hoisted(() => ({
	markRunPaid: vi.fn(),
	env: { STRIPE_WEBHOOK_SECRET: 'whsec_test' }
}));

vi.mock('$lib/server/run-store', () => ({ markRunPaid }));
vi.mock('$env/dynamic/private', () => ({ env }));

import { POST } from './stripe/webhook/+server';

const cryptoImpl = globalThis.crypto ?? webcrypto;

const signPayload = async (payload: string, secret: string, timestamp: number) => {
	const encoder = new TextEncoder();
	const key = await cryptoImpl.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await cryptoImpl.subtle.sign(
		'HMAC',
		key,
		encoder.encode(`${timestamp}.${payload}`)
	);
	return Array.from(new Uint8Array(signature))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
};

describe('POST /api/stripe/webhook', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
	});

	it('returns 500 when webhook secret is missing', async () => {
		env.STRIPE_WEBHOOK_SECRET = '';
		const request = new Request('http://localhost/api/stripe/webhook', { method: 'POST' });
		const response = await POST({ request } as any);
		expect(response.status).toBe(500);
	});

	it('returns 400 when signature is missing', async () => {
		const request = new Request('http://localhost/api/stripe/webhook', { method: 'POST' });
		const response = await POST({ request } as any);
		expect(response.status).toBe(400);
	});

	it('returns 400 when signature is invalid', async () => {
		const payload = JSON.stringify({ type: 'checkout.session.completed' });
		const request = new Request('http://localhost/api/stripe/webhook', {
			method: 'POST',
			headers: { 'stripe-signature': 't=1,v1=deadbeef' },
			body: payload
		});
		const response = await POST({ request } as any);
		expect(response.status).toBe(400);
	});

	it('does not mark paid when payment is not settled', async () => {
		const payload = JSON.stringify({
			type: 'checkout.session.completed',
			data: { object: { payment_status: 'unpaid', metadata: { run_id: 'run_1' } } }
		});
		const timestamp = Math.floor(Date.now() / 1000);
		const signature = await signPayload(payload, env.STRIPE_WEBHOOK_SECRET, timestamp);
		const request = new Request('http://localhost/api/stripe/webhook', {
			method: 'POST',
			headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
			body: payload
		});

		const response = await POST({ request } as any);
		expect(response.status).toBe(200);
		expect(markRunPaid).not.toHaveBeenCalled();
	});

	it('marks run as paid for settled payment', async () => {
		const payload = JSON.stringify({
			type: 'checkout.session.completed',
			data: { object: { payment_status: 'paid', metadata: { run_id: 'run_1' } } }
		});
		const timestamp = Math.floor(Date.now() / 1000);
		const signature = await signPayload(payload, env.STRIPE_WEBHOOK_SECRET, timestamp);
		const request = new Request('http://localhost/api/stripe/webhook', {
			method: 'POST',
			headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
			body: payload
		});

		const response = await POST({ request } as any);
		expect(response.status).toBe(200);
		expect(markRunPaid).toHaveBeenCalledWith('run_1');
	});
});
