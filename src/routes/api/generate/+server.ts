import { json } from '@sveltejs/kit';
import { generateLlms } from '$lib/server/firecrawl';
import { buildPreviewSlices } from '$lib/server/preview';
import { createRun } from '$lib/server/run-store';
import { PRICE_USD, validateSurvey, type SurveyInput } from '$lib/llms';

export const POST = async ({ request }) => {
	let payload: Partial<SurveyInput>;
	try {
		payload = (await request.json()) as Partial<SurveyInput>;
	} catch {
		return json({ error: 'Invalid JSON payload.' }, { status: 400 });
	}
	const input: SurveyInput = {
		siteName: payload.siteName ?? '',
		siteUrl: payload.siteUrl ?? '',
		summary: payload.summary ?? '',
		categories: payload.categories ?? '',
		siteType: payload.siteType ?? 'docs',
		excludes: payload.excludes ?? '',
		priorityPages: payload.priorityPages ?? '',
		optionalPages: payload.optionalPages ?? '',
		questions: payload.questions ?? ''
	};

	const errors = validateSurvey(input);
	if (Object.keys(errors).length > 0) {
		return json({ errors }, { status: 400 });
	}

	try {
		const result = await generateLlms(input);
		const run = await createRun(result.preview);
		const preview = buildPreviewSlices(result.preview);

		if (!run) {
			return json({ error: 'Failed to persist run.' }, { status: 500 });
		}

		return json({
			runId: run.id,
			preview: preview.visible,
			lockedPreview: preview.locked,
			mode: result.mode,
			payment: {
				provider: 'Stripe Checkout',
				priceUsd: PRICE_USD,
				billing: 'one-time',
				payAfter: true
			}
		});
	} catch (error) {
		console.error('Generate error:', error);
		return json({ error: 'Failed to generate llms.txt.' }, { status: 500 });
	}
};
