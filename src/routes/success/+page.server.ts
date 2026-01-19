import { error, redirect } from '@sveltejs/kit';
import { getRun } from '$lib/server/run-store';

export const load = async ({ url }) => {
	const runId = url.searchParams.get('runId');

	if (!runId) {
		throw redirect(302, '/');
	}

	const run = await getRun(runId);

	if (!run) {
		throw error(404, 'Run not found. It may have expired.');
	}

	// Return run info - payment status will be checked client-side with polling
	return {
		runId,
		paid: Boolean(run.paidAt),
		content: run.paidAt ? run.content : null // Only return content if paid
	};
};
