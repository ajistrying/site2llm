import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getRun } = vi.hoisted(() => ({ getRun: vi.fn() }));

vi.mock('$lib/server/run-store', () => ({ getRun }));

import { GET } from './download/+server';

describe('GET /api/download', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 400 when runId is missing', async () => {
		const response = await GET({ url: new URL('http://localhost/api/download') } as any);
		expect(response.status).toBe(400);
	});

	it('returns 404 when run does not exist', async () => {
		getRun.mockResolvedValueOnce(null);
		const response = await GET({ url: new URL('http://localhost/api/download?runId=run_1') } as any);
		expect(response.status).toBe(404);
	});

	it('returns 402 when run is unpaid', async () => {
		getRun.mockResolvedValueOnce({ paidAt: null });
		const response = await GET({ url: new URL('http://localhost/api/download?runId=run_1') } as any);
		expect(response.status).toBe(402);
	});

	it('returns file when run is paid', async () => {
		getRun.mockResolvedValueOnce({ paidAt: new Date(), content: 'file body' });
		const response = await GET({ url: new URL('http://localhost/api/download?runId=run_1') } as any);
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toContain('text/plain');
		expect(response.headers.get('Content-Disposition')).toContain('llms.txt');
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(body).toBe('file body');
	});
});
