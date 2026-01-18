import { getRun } from '$lib/server/run-store';

export const GET = async ({ url }) => {
	const runId = url.searchParams.get('runId');
	if (!runId) {
		return new Response('Missing runId.', { status: 400 });
	}

	const run = await getRun(runId);
	if (!run) {
		return new Response('Run not found.', { status: 404 });
	}

	if (!run.paidAt) {
		return new Response('Payment required.', { status: 402 });
	}

	return new Response(run.content, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Content-Disposition': 'attachment; filename="llms.txt"',
			'Cache-Control': 'no-store'
		}
	});
};
