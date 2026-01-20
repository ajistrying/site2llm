import { env } from '$env/dynamic/private';
import { normalizeUrl, slugify, type PageItem, type SurveyInput } from '$lib/llms';

type LlmPageUpdate = {
	url?: string;
	title?: string;
	description?: string;
};

type LlmResponse = {
	questions?: string[];
	pages?: LlmPageUpdate[];
};

type EnrichmentResult = {
	pages: PageItem[];
	questions: string;
	used: boolean;
};

// OpenAI request bounds keep enrichment predictable and cheap.
const OPENAI_BASE_URL = (env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
const OPENAI_CHAT_URL = OPENAI_BASE_URL.endsWith('/v1')
	? `${OPENAI_BASE_URL}/chat/completions`
	: `${OPENAI_BASE_URL}/v1/chat/completions`;
const OPENAI_MODEL = env.OPENAI_MODEL ?? 'gpt-5-mini';
const MAX_PAGES = 18;
const MAX_QUESTIONS = 4;
const MAX_DESC_CHARS = 160;
const MAX_TITLE_CHARS = 80;
const MAX_SOURCE_CHARS = 220;
const REQUEST_TIMEOUT_MS = 12000;

// Baseline relevance cues for ranking pages before sending to the model.
const staticKeywords = [
	'pricing',
	'plans',
	'billing',
	'docs',
	'documentation',
	'api',
	'support',
	'faq',
	'changelog',
	'security',
	'integrations',
	'getting-started',
	'guides',
	'tutorials',
	'status',
	'contact'
];

const isNoneValue = (value: string) => ['none', 'n/a', 'na'].includes(value.trim().toLowerCase());

const splitList = (value?: string) =>
	(value ?? '')
		.split(/[\n,]+/)
		.map((item) => item.trim())
		.filter((item) => item && !isNoneValue(item));

const normalizeForMatch = (value: string) => value.replace(/\/+$/, '').toLowerCase();

const trimTo = (value: string, max: number) => {
	const clean = value.replace(/\s+/g, ' ').trim();
	if (clean.length <= max) return clean;
	return `${clean.slice(0, Math.max(0, max - 1)).trim()}…`;
};

const resolveUrl = (baseUrl: string, value: string) => {
	try {
		return new URL(value, baseUrl).toString();
	} catch {
		return null;
	}
};

// Mix user intent + common doc/commerce signals into a single scoring set.
const buildKeywordSet = (input: SurveyInput) => {
	const keywords = new Set<string>();
	splitList(input.categories).forEach((category) => {
		keywords.add(category.toLowerCase());
		keywords.add(slugify(category));
	});
	splitList(input.questions).forEach((question) => {
		question
			.toLowerCase()
			.split(/[^a-z0-9]+/i)
			.filter((token) => token.length > 3)
			.forEach((token) => keywords.add(token));
	});
	staticKeywords.forEach((keyword) => keywords.add(keyword));
	return Array.from(keywords).slice(0, 32);
};

const buildUrlSet = (baseUrl: string, value: string) =>
	new Set(
		splitList(value)
			.map((entry) => resolveUrl(baseUrl, entry))
			.filter((entry): entry is string => Boolean(entry))
			.map(normalizeForMatch)
	);

// Higher scores surface the best candidates for LLM enrichment.
const scorePage = (
	page: PageItem,
	keywords: string[],
	prioritySet: Set<string>,
	optionalSet: Set<string>
) => {
	const key = normalizeForMatch(page.url);
	let score = 0;
	if (prioritySet.has(key)) score += 100;
	if (optionalSet.has(key)) score += 20;

	const haystack = `${page.title} ${page.description} ${page.url}`.toLowerCase();
	keywords.forEach((keyword) => {
		if (keyword && haystack.includes(keyword)) score += 4;
	});

	try {
		const depth = new URL(page.url).pathname.split('/').filter(Boolean).length;
		score += Math.max(0, 6 - depth);
	} catch {
		// Ignore URL parse errors for scoring depth.
	}

	return score;
};

// Pick a capped, high-signal subset to control token and cost usage.
const selectCandidatePages = (input: SurveyInput, pages: PageItem[]) => {
	const baseUrl = normalizeUrl(input.siteUrl);
	const keywords = buildKeywordSet(input);
	const prioritySet = buildUrlSet(baseUrl, input.priorityPages);
	const optionalSet = buildUrlSet(baseUrl, input.optionalPages);

	return pages
		.map((page, index) => ({
			page,
			index,
			score: scorePage(page, keywords, prioritySet, optionalSet)
		}))
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.slice(0, MAX_PAGES)
		.map((entry) => entry.page);
};

// Keep the prompt payload compact and deterministic.
const buildPromptPayload = (input: SurveyInput, pages: PageItem[]) => ({
	site: {
		name: input.siteName,
		url: input.siteUrl,
		summary: input.summary,
		categories: splitList(input.categories),
		siteType: input.siteType,
		questions: splitList(input.questions)
	},
	pages: pages.map((page) => ({
		url: page.url,
		title: trimTo(page.title, MAX_TITLE_CHARS),
		description: trimTo(page.description, MAX_SOURCE_CHARS)
	}))
});

// Accept strict JSON; fall back to best-effort extraction if needed.
const parseLlmResponse = (value: string): LlmResponse | null => {
	try {
		return JSON.parse(value) as LlmResponse;
	} catch {
		const start = value.indexOf('{');
		const end = value.lastIndexOf('}');
		if (start === -1 || end === -1) return null;
		try {
			return JSON.parse(value.slice(start, end + 1)) as LlmResponse;
		} catch {
			return null;
		}
	}
};

// Apply model edits while preserving original URLs and structure.
const mergePages = (pages: PageItem[], updates: LlmPageUpdate[]) => {
	const merged = pages.map((page) => ({ ...page }));
	const lookup = new Map(merged.map((page) => [normalizeForMatch(page.url), page] as const));

	updates.forEach((update) => {
		if (!update.url) return;
		const target = lookup.get(normalizeForMatch(update.url));
		if (!target) return;
		if (typeof update.title === 'string' && update.title.trim()) {
			target.title = trimTo(update.title, MAX_TITLE_CHARS);
		}
		if (typeof update.description === 'string' && update.description.trim()) {
			target.description = trimTo(update.description, MAX_DESC_CHARS);
		}
	});

	return merged;
};

// De-duplicate questions and cap the final list.
const mergeQuestions = (existing: string, extra: string[]) => {
	const existingList = splitList(existing);
	const normalized = new Set(
		existingList.map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ''))
	);

	const additions = extra
		.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
		.map((value) => value.trim())
		.filter((value) => {
			const key = value.toLowerCase().replace(/[^a-z0-9]+/g, '');
			if (!key || normalized.has(key)) return false;
			normalized.add(key);
			return true;
		});

	return [...existingList, ...additions].slice(0, 8).join('\n');
};

// Single low-temp call; abort quickly on slow responses.
const callOpenAi = async (payload: string) => {
	if (!env.OPENAI_API_KEY) return null;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const response = await fetch(OPENAI_CHAT_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.OPENAI_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: OPENAI_MODEL,
				temperature: 0.2,
				max_tokens: 900,
				response_format: { type: 'json_object' },
				messages: [
					{
						role: 'system',
						content:
							'You refine llms.txt inputs. Return JSON only. Provide up to 4 concise user questions and improved titles/descriptions for the provided URLs. Descriptions must be factual, <= 160 characters, and avoid marketing fluff.'
					},
					{
						role: 'user',
						content: payload
					}
				]
			}),
			signal: controller.signal
		});

		if (!response.ok) return null;
		const data = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		return data.choices?.[0]?.message?.content ?? null;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
};

// Enrich page titles/descriptions + top questions, or fall back cleanly.
export const enrichPagesAndQuestions = async (
	input: SurveyInput,
	pages: PageItem[]
): Promise<EnrichmentResult> => {
	if (!env.OPENAI_API_KEY || pages.length === 0) {
		return { pages, questions: input.questions, used: false };
	}

	const candidates = selectCandidatePages(input, pages);
	const payload = buildPromptPayload(input, candidates);
	const response = await callOpenAi(JSON.stringify(payload, null, 2));
	if (!response) {
		return { pages, questions: input.questions, used: false };
	}

	const parsed = parseLlmResponse(response);
	if (!parsed) {
		return { pages, questions: input.questions, used: false };
	}

	const questions = Array.isArray(parsed.questions)
		? parsed.questions.slice(0, MAX_QUESTIONS)
		: [];
	const updates = Array.isArray(parsed.pages) ? parsed.pages : [];

	return {
		pages: updates.length ? mergePages(pages, updates) : pages,
		questions: mergeQuestions(input.questions, questions),
		used: true
	};
};
