export type SiteType =
	| 'docs'
	| 'marketing'
	| 'saas'
	| 'ecommerce'
	| 'marketplace'
	| 'services'
	| 'education'
	| 'media';

export type SurveyInput = {
	siteName: string;
	siteUrl: string;
	summary: string;
	categories: string;
	siteType: SiteType;
	excludes: string;
	priorityPages: string;
	optionalPages: string;
	questions: string;
};

export type PageItem = {
	section: string;
	title: string;
	url: string;
	description: string;
};

export type ValidationErrors = Partial<Record<keyof SurveyInput, string>>;

export const PRICE_USD = 8;

type ExampleLink = {
	suffix: string;
	title: string;
	description: string;
};

const docsExamples: ExampleLink[] = [
	{
		suffix: 'getting-started',
		title: 'Getting started',
		description: 'Install, configure, and ship your first project.'
	},
	{
		suffix: 'guides',
		title: 'Guides',
		description: 'Step-by-step workflows and best practices.'
	},
	{
		suffix: 'api',
		title: 'API reference',
		description: 'Endpoints, parameters, and response shapes.'
	}
];

const marketingExamples: ExampleLink[] = [
	{
		suffix: 'features',
		title: 'Product capabilities',
		description: 'What the product does and how it works.'
	},
	{
		suffix: 'pricing',
		title: 'Pricing',
		description: 'Plans, limits, and billing details.'
	},
	{
		suffix: 'case-studies',
		title: 'Case studies',
		description: 'Real outcomes and customer proof.'
	}
];

const saasExamples: ExampleLink[] = [
	{
		suffix: 'product',
		title: 'Product overview',
		description: 'Core capabilities and workflows.'
	},
	{
		suffix: 'pricing',
		title: 'Pricing',
		description: 'Plans, limits, and billing details.'
	},
	{
		suffix: 'security',
		title: 'Security',
		description: 'Compliance, data handling, and trust.'
	}
];

const ecommerceExamples: ExampleLink[] = [
	{
		suffix: 'collections',
		title: 'Collections',
		description: 'Top categories and product groups.'
	},
	{
		suffix: 'shipping-returns',
		title: 'Shipping & returns',
		description: 'Delivery times, costs, and policies.'
	},
	{
		suffix: 'support',
		title: 'Customer support',
		description: 'Help center and contact options.'
	}
];

const marketplaceExamples: ExampleLink[] = [
	{
		suffix: 'browse',
		title: 'Browse listings',
		description: 'How buyers discover offerings.'
	},
	{
		suffix: 'seller-guidelines',
		title: 'Seller guidelines',
		description: 'Requirements and onboarding rules.'
	},
	{
		suffix: 'fees',
		title: 'Fees',
		description: 'Marketplace pricing and payouts.'
	}
];

const servicesExamples: ExampleLink[] = [
	{
		suffix: 'services',
		title: 'Service menu',
		description: 'What you offer and scope.'
	},
	{
		suffix: 'pricing',
		title: 'Pricing',
		description: 'Packages and estimates.'
	},
	{
		suffix: 'contact',
		title: 'Contact',
		description: 'How to book or request a quote.'
	}
];

const educationExamples: ExampleLink[] = [
	{
		suffix: 'programs',
		title: 'Programs',
		description: 'Courses, tracks, and outcomes.'
	},
	{
		suffix: 'admissions',
		title: 'Admissions',
		description: 'Requirements, deadlines, and steps.'
	},
	{
		suffix: 'tuition',
		title: 'Tuition & aid',
		description: 'Costs, scholarships, and payment options.'
	}
];

const mediaExamples: ExampleLink[] = [
	{
		suffix: 'news',
		title: 'Newsroom',
		description: 'Latest announcements and updates.'
	},
	{
		suffix: 'press',
		title: 'Press kit',
		description: 'Brand assets and media contacts.'
	},
	{
		suffix: 'newsletter',
		title: 'Newsletter',
		description: 'Subscribe and past issues.'
	}
];

const siteTypeExamples: Record<SiteType, ExampleLink[]> = {
	docs: docsExamples,
	marketing: marketingExamples,
	saas: saasExamples,
	ecommerce: ecommerceExamples,
	marketplace: marketplaceExamples,
	services: servicesExamples,
	education: educationExamples,
	media: mediaExamples
};

const fallbackSections = ['Core documentation', 'API reference', 'Guides'];
const defaultSummary =
	'A factual, one sentence description of who this site helps and what it provides.';

const selectExamples = (siteType: SiteType, index: number) => {
	const options = siteTypeExamples[siteType] ?? marketingExamples;
	return [options[index % options.length], options[(index + 1) % options.length]];
};

const ensureSentence = (value: string) => value.replace(/\s+/g, ' ').trim();

const isNoneValue = (value: string) => ['none', 'n/a', 'na'].includes(value.trim().toLowerCase());

const splitList = (value?: string) =>
	(value ?? '')
		.split(/[\n,]+/)
		.map((item) => item.trim())
		.filter((item) => item && !isNoneValue(item));

const uniqueBy = <T>(items: T[], getKey: (item: T) => string) => {
	const seen = new Set<string>();
	return items.filter((item) => {
		const key = getKey(item);
		if (!key || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

export const parseCategories = (value: string) => splitList(value);

export const slugify = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');

export const normalizeUrl = (value: string) => {
	const trimmed = value.trim();
	if (!trimmed) return 'https://example.com';
	return trimmed.replace(/\/+$/, '');
};

const joinUrl = (base: string, ...parts: string[]) => {
	const cleaned = [base.replace(/\/+$/, ''), ...parts]
		.map((part) => part.replace(/^\/+|\/+$/g, ''))
		.filter(Boolean);
	return cleaned.join('/');
};

const normalizeForMatch = (value: string) => value.replace(/\/+$/, '').toLowerCase();

const resolveUrl = (baseUrl: string, value: string) => {
	const trimmed = value.trim();
	if (!trimmed) return '';
	try {
		const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
		return new URL(trimmed, base).toString().replace(/\/+$/, '');
	} catch {
		return trimmed;
	}
};

const parseUrlList = (value: string | undefined, baseUrl: string) =>
	uniqueBy(
		splitList(value).map((entry) => resolveUrl(baseUrl, entry)).filter(Boolean),
		(entry) => normalizeForMatch(entry)
	);

const titleFromUrl = (value: string) => {
	try {
		const parsed = new URL(value);
		const path = parsed.pathname.replace(/\/+$/, '');
		const segment = path.split('/').filter(Boolean).pop();
		if (!segment) return parsed.hostname;
		const decoded = decodeURIComponent(segment);
		const spaced = decoded.replace(/[-_]+/g, ' ');
		return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : parsed.hostname;
	} catch {
		return value;
	}
};

const guessSectionFromUrl = (url: string, sections: string[]) => {
	const match = sections.find((section) => url.toLowerCase().includes(slugify(section)));
	return match ?? sections[0] ?? 'Core documentation';
};

export const validateSurvey = (input: SurveyInput): ValidationErrors => {
	const errors: ValidationErrors = {};

	if (!ensureSentence(input.siteName)) {
		errors.siteName = 'Enter a project or brand name.';
	}

	const normalizedUrl = ensureSentence(input.siteUrl);
	if (!normalizedUrl) {
		errors.siteUrl = 'Enter your homepage URL.';
	} else {
		try {
			const parsed = new URL(normalizedUrl);
			if (!['http:', 'https:'].includes(parsed.protocol)) {
				errors.siteUrl = 'Use an http or https URL.';
			}
		} catch {
			errors.siteUrl = 'Enter a valid URL starting with http or https.';
		}
	}

	if (ensureSentence(input.summary).length < 20) {
		errors.summary = 'Provide a short, factual sentence (20+ characters).';
	}

	if (parseCategories(input.categories).length === 0) {
		errors.categories = 'Add at least one section.';
	}

	const priorityCount = splitList(input.priorityPages).length;
	if (priorityCount < 3 || priorityCount > 8) {
		errors.priorityPages = 'Add 3-8 priority URLs.';
	}

	if (
		ensureSentence(input.optionalPages) &&
		splitList(input.optionalPages).length === 0 &&
		!isNoneValue(input.optionalPages)
	) {
		errors.optionalPages = 'Add at least one optional URL or leave it blank.';
	}

	if (splitList(input.questions).length === 0) {
		errors.questions = 'Add at least one question.';
	}

	if (
		ensureSentence(input.excludes) &&
		splitList(input.excludes).length === 0 &&
		!isNoneValue(input.excludes)
	) {
		errors.excludes = 'Add at least one exclusion or leave it blank.';
	}

	return errors;
};

const mapPagesToSections = (pages: PageItem[], sections: string[]) => {
	const grouped = new Map<string, PageItem[]>();
	sections.forEach((section) => grouped.set(section, []));

	pages.forEach((page) => {
		const matched =
			sections.find((section) => page.section === section) ||
			sections.find((section) => page.url.includes(slugify(section))) ||
			sections[0];
		if (!matched) return;
		grouped.get(matched)?.push(page);
	});

	return grouped;
};

export const buildTemplate = (input: SurveyInput, pages: PageItem[] = []) => {
	const title = ensureSentence(input.siteName) || 'Your Project';
	const line = ensureSentence(input.summary) || defaultSummary;
	const baseUrl = normalizeUrl(input.siteUrl);
	const sectionList = parseCategories(input.categories);
	const sections = sectionList.length ? sectionList : fallbackSections;
	const priorityUrls = parseUrlList(input.priorityPages, baseUrl);
	const prioritySet = new Set(priorityUrls.map(normalizeForMatch));
	const optionalUrls = parseUrlList(input.optionalPages, baseUrl).filter(
		(url) => !prioritySet.has(normalizeForMatch(url))
	);
	const optionalSet = new Set(optionalUrls.map(normalizeForMatch));
	const questionList = splitList(input.questions);
	const pagesByUrl = new Map(
		pages.map((page) => [normalizeForMatch(page.url), page] as const)
	);
	const priorityItems = priorityUrls.map((url) => {
		const match = pagesByUrl.get(normalizeForMatch(url));
		return (
			match ?? {
				section: guessSectionFromUrl(url, sections),
				title: titleFromUrl(url),
				url,
				description: 'User-prioritized page for AI answers.'
			}
		);
	});
	const optionalItems = optionalUrls.map((url) => {
		const match = pagesByUrl.get(normalizeForMatch(url));
		return (
			match ?? {
				section: guessSectionFromUrl(url, sections),
				title: titleFromUrl(url),
				url,
				description: 'Nice-to-have context that can be skipped.'
			}
		);
	});

	const lines: string[] = [`# ${title}`, '', `> ${line}`, ''];

	if (questionList.length) {
		lines.push('Key questions this site should answer:');
		questionList.slice(0, 6).forEach((question) => {
			const clean = ensureSentence(question);
			lines.push(`- ${clean.endsWith('?') ? clean : `${clean}?`}`);
		});
		lines.push('');
	}

	if (pages.length || priorityItems.length) {
		const grouped = mapPagesToSections([...pages, ...priorityItems], sections);
		sections.forEach((section) => {
			lines.push(`## ${section}`);
			const sectionPages = grouped.get(section) ?? [];
			const sectionPageByUrl = new Map(
				sectionPages.map((page) => [normalizeForMatch(page.url), page] as const)
			);
			const priorityForSection = priorityUrls
				.map((url) => sectionPageByUrl.get(normalizeForMatch(url)))
				.filter((page): page is PageItem => Boolean(page));
			const normalPages = sectionPages.filter((page) => {
				const key = normalizeForMatch(page.url);
				return !prioritySet.has(key) && !optionalSet.has(key);
			});
			const orderedPages = [...priorityForSection, ...normalPages].slice(0, 6);
			orderedPages.forEach((page) => {
				lines.push(`- [${page.title}](${page.url}): ${page.description}`);
			});
			lines.push('');
		});
	} else {
		sections.forEach((section, index) => {
			const sectionSlug = slugify(section);
			const examples = selectExamples(input.siteType, index);
			lines.push(`## ${section}`);
			examples.forEach((example) => {
				const url = joinUrl(baseUrl, sectionSlug, example.suffix);
				lines.push(`- [${example.title}](${url}): ${example.description}`);
			});
			lines.push('');
		});
	}

	if (optionalItems.length) {
		lines.push('## Optional');
		optionalItems.slice(0, 6).forEach((page) => {
			lines.push(`- [${page.title}](${page.url}): ${page.description}`);
		});
		lines.push('');
	}

	return lines.join('\n');
};

export const buildStubPages = (input: SurveyInput): PageItem[] => {
	const baseUrl = normalizeUrl(input.siteUrl);
	const sections = parseCategories(input.categories);
	const sectionList = sections.length ? sections : fallbackSections;

	return sectionList.flatMap((section, index) => {
		const sectionSlug = slugify(section);
		const examples = selectExamples(input.siteType, index);
		return examples.map((example) => ({
			section,
			title: example.title,
			url: joinUrl(baseUrl, sectionSlug, example.suffix),
			description: example.description
		}));
	});
};
