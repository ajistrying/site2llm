import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getRun } = vi.hoisted(() => ({ getRun: vi.fn() }));

vi.mock('$lib/server/run-store', () => ({ getRun }));

import { GET } from './run/+server';

describe('GET /api/run', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 400 when runId is missing', async () => {
		const response = await GET({ url: new URL('http://localhost/api/run') } as any);
		expect(response.status).toBe(400);
	});

	it('returns 404 when run does not exist', async () => {
		getRun.mockResolvedValueOnce(null);
		const response = await GET({ url: new URL('http://localhost/api/run?runId=run_1') } as any);
		expect(response.status).toBe(404);
	});

	it('returns paid false when run is unpaid', async () => {
		getRun.mockResolvedValueOnce({ paidAt: null });
		const response = await GET({ url: new URL('http://localhost/api/run?runId=run_1') } as any);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.paid).toBe(false);
	});

	it('returns paid true when run is paid', async () => {
		getRun.mockResolvedValueOnce({ paidAt: new Date() });
		const response = await GET({ url: new URL('http://localhost/api/run?runId=run_1') } as any);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.paid).toBe(true);
	});
});
