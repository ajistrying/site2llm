import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { deleteExpiredRuns } from '$lib/server/run-store';

const resolveToken = (authHeader: string | null, tokenParam: string | null) => {
	if (!env.CLEANUP_TOKEN) return false;
	if (authHeader) {
		const [scheme, token] = authHeader.split(' ');
		if (scheme === 'Bearer' && token) {
			return token === env.CLEANUP_TOKEN;
		}
	}
	if (tokenParam) return tokenParam === env.CLEANUP_TOKEN;
	return false;
};

export const POST = async ({ request }) => {
	if (!resolveToken(request.headers.get('authorization'), null)) {
		return json({ error: 'Unauthorized.' }, { status: 401 });
	}

	const deleted = await deleteExpiredRuns();

	return json({ deleted });
};

export const GET = async ({ request, url }) => {
	if (!resolveToken(request.headers.get('authorization'), url.searchParams.get('token'))) {
		return json({ error: 'Unauthorized.' }, { status: 401 });
	}

	const deleted = await deleteExpiredRuns();

	return json({ deleted });
};
