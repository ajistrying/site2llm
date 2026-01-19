import { describe, expect, it } from 'vitest';
import { POST as generate } from './generate/+server';
import { POST as checkout } from './checkout/+server';
import { GET as download } from './download/+server';
import { GET as runStatus } from './run/+server';

describe('api endpoints input validation', () => {
	it('generate returns 400 on invalid JSON', async () => {
		const request = new Request('http://localhost/api/generate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{bad json'
		});

		const response = await generate({ request } as any);
		expect(response.status).toBe(400);
	});

	it('checkout returns 400 on invalid JSON', async () => {
		const request = new Request('http://localhost/api/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{bad json'
		});

		const response = await checkout({ request } as any);
		expect(response.status).toBe(400);
	});

	it('checkout returns 400 on missing runId', async () => {
		const request = new Request('http://localhost/api/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});

		const response = await checkout({ request } as any);
		expect(response.status).toBe(400);
	});

	it('run returns 400 on missing runId', async () => {
		const response = await runStatus({ url: new URL('http://localhost/api/run') } as any);
		expect(response.status).toBe(400);
	});

	it('download returns 400 on missing runId', async () => {
		const response = await download({ url: new URL('http://localhost/api/download') } as any);
		expect(response.status).toBe(400);
	});
});
