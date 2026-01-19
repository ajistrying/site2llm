import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { markRunPaid } from '$lib/server/run-store';

const encoder = new TextEncoder();

const bytesToHex = (bytes: Uint8Array) =>
	Array.from(bytes)
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');

const parseStripeSignature = (header: string) => {
	const parts = header.split(',');
	const timestampPart = parts.find((part) => part.startsWith('t='));
	const signatureParts = parts.filter((part) => part.startsWith('v1='));

	if (!timestampPart || signatureParts.length === 0) return null;
	const timestamp = timestampPart.split('=')[1];
	const signatures = signatureParts.map((part) => part.split('=')[1]);

	if (!timestamp) return null;
	return { timestamp, signatures };
};

const verifyStripeSignature = async (payload: string, header: string, secret: string) => {
	const parsed = parseStripeSignature(header);
	if (!parsed) return false;

	const { timestamp, signatures } = parsed;
	const signedPayload = `${timestamp}.${payload}`;

	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
	const digest = bytesToHex(new Uint8Array(signature));

	const timestampNum = Number(timestamp);
	const toleranceSeconds = 300;
	if (!Number.isFinite(timestampNum)) return false;
	const age = Math.abs(Date.now() / 1000 - timestampNum);
	if (age > toleranceSeconds) return false;

	return signatures.some((sig) => sig === digest);
};

export const POST = async ({ request }) => {
	if (!env.STRIPE_WEBHOOK_SECRET) {
		return json({ error: 'Stripe webhook secret not configured.' }, { status: 500 });
	}

	const signature = request.headers.get('stripe-signature');
	if (!signature) {
		return json({ error: 'Missing Stripe signature.' }, { status: 400 });
	}

	const payload = await request.text();
	const isValid = await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET);
	if (!isValid) {
		return json({ error: 'Invalid signature.' }, { status: 400 });
	}

	const event = JSON.parse(payload) as {
		type?: string;
		data?: {
			object?: {
				metadata?: Record<string, string>;
				client_reference_id?: string;
				payment_status?: string;
			};
		};
	};

	if (
		event.type === 'checkout.session.completed' ||
		event.type === 'checkout.session.async_payment_succeeded'
	) {
		const session = event.data?.object;
		const paymentStatus = session?.payment_status;
		if (paymentStatus && paymentStatus !== 'paid') {
			return json({ received: true });
		}
		const runId = session?.metadata?.run_id ?? session?.client_reference_id;
		if (runId) {
			await markRunPaid(runId);
		}
	}

	return json({ received: true });
};
