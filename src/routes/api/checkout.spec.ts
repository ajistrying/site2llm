import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getRun, env } = vi.hoisted(() => ({
	getRun: vi.fn(),
	env: { STRIPE_SECRET_KEY: 'sk_test', STRIPE_PRICE_ID: 'price_test' }
}));

vi.mock('$lib/server/run-store', () => ({ getRun }));
vi.mock('$env/dynamic/private', () => ({ env }));

import { POST } from './checkout/+server';

const makeRequest = (body: unknown) =>
	new Request('http://localhost/api/checkout', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

const mockRun = {
	id: 'run_123',
	content: 'content',
	createdAt: new Date(),
	expiresAt: new Date(Date.now() + 1000 * 60),
	paidAt: null
};

describe('POST /api/checkout', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		env.STRIPE_SECRET_KEY = 'sk_test';
		env.STRIPE_PRICE_ID = 'price_test';
		vi.unstubAllGlobals();
	});

	it('returns 400 on missing runId', async () => {
		const response = await POST({ request: makeRequest({}) } as any);
		expect(response.status).toBe(400);
	});

	it('returns 500 when Stripe is not configured', async () => {
		env.STRIPE_SECRET_KEY = '';
		env.STRIPE_PRICE_ID = '';

		const response = await POST({ request: makeRequest({ runId: 'run_123' }) } as any);
		expect(response.status).toBe(500);
	});

	it('returns 404 when run is missing', async () => {
		getRun.mockResolvedValueOnce(null);

		const response = await POST({ request: makeRequest({ runId: 'run_123' }) } as any);
		expect(response.status).toBe(404);
	});

	it('returns 409 when run is already paid', async () => {
		getRun.mockResolvedValueOnce({ ...mockRun, paidAt: new Date() });

		const response = await POST({ request: makeRequest({ runId: 'run_123' }) } as any);
		expect(response.status).toBe(409);
	});

	it('returns checkout url on success', async () => {
		getRun.mockResolvedValueOnce(mockRun);
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValueOnce(
				new Response(JSON.stringify({ url: 'https://checkout.test' }), { status: 200 })
			)
		);

		const response = await POST({ request: makeRequest({ runId: 'run_123' }) } as any);
		const data = (await response.json()) as { url?: string };

		expect(response.status).toBe(200);
		expect(data.url).toBe('https://checkout.test');
	});

	it('returns 502 when Stripe fails', async () => {
		getRun.mockResolvedValueOnce(mockRun);
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValueOnce(
				new Response(JSON.stringify({ error: { message: 'bad' } }), { status: 500 })
			)
		);

		const response = await POST({ request: makeRequest({ runId: 'run_123' }) } as any);
		expect(response.status).toBe(502);
	});
});
