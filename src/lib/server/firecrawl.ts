import { buildStubPages, buildTemplate, parseCategories, slugify, type PageItem, type SurveyInput } from '$lib/llms';

type FirecrawlResponse = {
	success?: boolean;
	data?: Array<{
		url?: string;
		markdown?: string;
		metadata?: {
			title?: string;
			description?: string;
		};
	}>;
};

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const USE_STUB = process.env.FIRECRAWL_USE_STUB !== 'false';

const toSentence = (value: string) => value.replace(/\s+/g, ' ').trim();

const extractDescription = (markdown?: string, fallback?: string) => {
	const cleanFallback = toSentence(fallback ?? '');
	if (cleanFallback) return cleanFallback;
	if (!markdown) return 'Summary not available.';
	const lines = markdown.split('\n').map((line) => line.trim());
	const candidate = lines.find(
		(line) => line && !line.startsWith('#') && !line.startsWith('```') && line.length > 20
	);
	return candidate ? toSentence(candidate).slice(0, 160) : 'Summary not available.';
};

const isNoneValue = (value: string) => ['none', 'n/a', 'na'].includes(value.trim().toLowerCase());

const splitList = (value?: string) =>
	(value ?? '')
		.split(/[\n,]+/)
		.map((item) => item.trim())
		.filter((item) => item && !isNoneValue(item));

const parseExcludes = (value?: string) => splitList(value);

const guessSection = (url: string, categories: string[]) => {
	const match = categories.find((category) => url.includes(slugify(category)));
	return match ?? categories[0] ?? 'Core documentation';
};

const crawlWithFirecrawl = async (input: SurveyInput, apiKey: string): Promise<PageItem[]> => {
	const response = await fetch('https://api.firecrawl.dev/v1/crawl', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			url: input.siteUrl,
			limit: 40,
			scrapeOptions: {
				formats: ['markdown'],
				onlyMainContent: true
			}
		})
	});

	if (!response.ok) {
		throw new Error('Firecrawl request failed.');
	}

	const payload = (await response.json()) as FirecrawlResponse;
	const categories = parseCategories(input.categories);
	const excludes = parseExcludes(input.excludes);

	return (payload.data ?? [])
		.map((entry) => {
			const url = entry.url ?? '';
			if (!url) return null;
			if (excludes.some((exclude) => url.includes(exclude))) return null;
			return {
				section: guessSection(url, categories),
				title: toSentence(entry.metadata?.title ?? url),
				url,
				description: extractDescription(entry.markdown, entry.metadata?.description)
			};
		})
		.filter((entry): entry is PageItem => Boolean(entry));
};

export const generateLlms = async (input: SurveyInput) => {
	if (!FIRECRAWL_API_KEY || USE_STUB) {
		const pages = buildStubPages(input);
		return {
			preview: buildTemplate(input, pages),
			pages,
			mode: 'stub' as const
		};
	}

	let pages: PageItem[] = [];
	try {
		pages = await crawlWithFirecrawl(input, FIRECRAWL_API_KEY);
	} catch (error) {
		pages = buildStubPages(input);
		return {
			preview: buildTemplate(input, pages),
			pages,
			mode: 'stub' as const
		};
	}

	return {
		preview: buildTemplate(input, pages),
		pages,
		mode: 'live' as const
	};
};
