import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getRun } from '$lib/server/run-store';

export const POST = async ({ request }) => {
	let payload: { runId?: string };
	try {
		payload = (await request.json()) as { runId?: string };
	} catch {
		return json({ error: 'Invalid JSON payload.' }, { status: 400 });
	}
	if (!payload.runId) {
		return json({ error: 'Missing runId.' }, { status: 400 });
	}

	if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
		return json({ error: 'Stripe is not configured.' }, { status: 500 });
	}

	const run = await getRun(payload.runId);
	if (!run) {
		return json({ error: 'Run not found.' }, { status: 404 });
	}
	if (run.paidAt) {
		return json({ error: 'Run is already paid.' }, { status: 409 });
	}

	const origin = new URL(request.url).origin;
	const params = new URLSearchParams();
	params.set('mode', 'payment');
	params.set('success_url', `${origin}/success?runId=${payload.runId}`);
	params.set('cancel_url', `${origin}/?checkout=cancel&runId=${payload.runId}`);
	params.set('line_items[0][price]', env.STRIPE_PRICE_ID);
	params.set('line_items[0][quantity]', '1');
	params.set('client_reference_id', payload.runId);
	params.set('metadata[run_id]', payload.runId);

	const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
			'Content-Type': 'application/x-www-form-urlencoded',
			'Idempotency-Key': `checkout-${payload.runId}`
		},
		body: params.toString()
	});

	if (!response.ok) {
		const raw = await response.text();
		let details = raw;
		try {
			const parsed = JSON.parse(raw) as { error?: { message?: string } };
			details = parsed.error?.message ?? raw;
		} catch {
			// Ignore JSON parse failures.
		}
		console.error('Stripe checkout error:', details);
		return json({ error: 'Stripe checkout failed.', details }, { status: 502 });
	}

	const data = (await response.json()) as { url?: string };
	if (!data.url) {
		return json({ error: 'Stripe checkout failed.' }, { status: 502 });
	}

	return json({ url: data.url });
};
