import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateLlms, createRun, buildPreviewSlices } = vi.hoisted(() => ({
	generateLlms: vi.fn(),
	createRun: vi.fn(),
	buildPreviewSlices: vi.fn()
}));

vi.mock('$lib/server/firecrawl', () => ({ generateLlms }));
vi.mock('$lib/server/run-store', () => ({ createRun }));
vi.mock('$lib/server/preview', () => ({ buildPreviewSlices }));

import { POST } from './generate/+server';

const validPayload = {
	siteName: 'Atlas',
	siteUrl: 'https://atlas.test',
	summary: 'A clear description that is longer than twenty characters.',
	categories: 'Docs',
	siteType: 'docs',
	priorityPages: '/pricing, /docs, /docs/getting-started',
	optionalPages: '',
	questions: 'pricing, setup',
	excludes: ''
};

const makeRequest = (body: unknown) =>
	new Request('http://localhost/api/generate', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

const mockRun = {
	id: 'run_123',
	content: 'full content',
	createdAt: new Date(),
	expiresAt: new Date(Date.now() + 1000 * 60),
	paidAt: null
};

describe('POST /api/generate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns preview and run data', async () => {
		generateLlms.mockResolvedValueOnce({ preview: 'full content', mode: 'stub' });
		buildPreviewSlices.mockReturnValueOnce({ visible: 'preview', locked: 'locked' });
		createRun.mockResolvedValueOnce(mockRun);

		const response = await POST({ request: makeRequest(validPayload) } as any);
		const data = (await response.json()) as {
			runId?: string;
			preview?: string;
			lockedPreview?: string;
			error?: string;
		};

		expect(response.status).toBe(200);
		expect(data.runId).toBe('run_123');
		expect(data.preview).toBe('preview');
		expect(data.lockedPreview).toBe('locked');
	});

	it('returns 500 when persistence fails', async () => {
		generateLlms.mockResolvedValueOnce({ preview: 'full content', mode: 'stub' });
		buildPreviewSlices.mockReturnValueOnce({ visible: 'preview', locked: 'locked' });
		createRun.mockResolvedValueOnce(null);

		const response = await POST({ request: makeRequest(validPayload) } as any);
		const data = (await response.json()) as { error?: string };

		expect(response.status).toBe(500);
		expect(data.error).toBe('Failed to persist run.');
	});

	it('returns 500 when generation fails', async () => {
		generateLlms.mockRejectedValueOnce(new Error('boom'));

		const response = await POST({ request: makeRequest(validPayload) } as any);
		const data = (await response.json()) as { error?: string };

		expect(response.status).toBe(500);
		expect(data.error).toBe('Failed to generate llms.txt.');
	});
});
