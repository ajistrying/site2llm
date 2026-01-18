import { json } from '@sveltejs/kit';
import { getRun } from '$lib/server/run-store';

export const GET = async ({ url }) => {
	const runId = url.searchParams.get('runId');
	if (!runId) {
		return json({ error: 'Missing runId.' }, { status: 400 });
	}

	const run = await getRun(runId);
	if (!run) {
		return json({ error: 'Run not found.' }, { status: 404 });
	}

	return json({ runId, paid: Boolean(run.paidAt) });
};
