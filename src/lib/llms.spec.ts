import { buildTemplate, validateSurvey, type SurveyInput } from './llms';
import { describe, expect, it } from 'vitest';

describe('buildTemplate', () => {
	it('includes core sections and links', () => {
		const input: SurveyInput = {
			siteName: 'Northwind Atlas',
			siteUrl: 'https://example.com',
			summary: 'A logistics hub for teams that need faster, verified answers.',
			categories: 'Docs, Pricing',
			siteType: 'docs',
			priorityPages: 'https://example.com/pricing, /docs/getting-started, /docs/api',
			optionalPages: '/blog',
			questions: 'pricing, onboarding',
			excludes: '/login'
		};

		const output = buildTemplate(input);

		expect(output).toContain('# Northwind Atlas');
		expect(output).toContain('## Docs');
		expect(output).toContain('https://example.com/docs/getting-started');
	});
});

describe('validateSurvey', () => {
	it('flags missing required fields', () => {
		const input: SurveyInput = {
			siteName: '',
			siteUrl: '',
			summary: '',
			categories: '',
			siteType: 'marketing',
			priorityPages: '',
			optionalPages: '',
			questions: '',
			excludes: ''
		};

		const errors = validateSurvey(input);

		expect(errors.siteName).toBeTruthy();
		expect(errors.siteUrl).toBeTruthy();
		expect(errors.summary).toBeTruthy();
		expect(errors.categories).toBeTruthy();
		expect(errors.priorityPages).toBeTruthy();
		expect(errors.questions).toBeTruthy();
	});

	it('accepts a valid payload', () => {
		const input: SurveyInput = {
			siteName: 'Atlas',
			siteUrl: 'https://atlas.test',
			summary: 'A clear description that is longer than twenty characters.',
			categories: 'Docs',
			siteType: 'docs',
			priorityPages: '/pricing, /docs, /docs/getting-started',
			optionalPages: '/blog',
			questions: 'pricing, setup',
			excludes: '/login'
		};

		const errors = validateSurvey(input);

		expect(Object.keys(errors)).toHaveLength(0);
	});

	it('accepts blank optional pages and exclusions', () => {
		const input: SurveyInput = {
			siteName: 'Atlas',
			siteUrl: 'https://atlas.test',
			summary: 'A clear description that is longer than twenty characters.',
			categories: 'Docs',
			siteType: 'docs',
			priorityPages: '/pricing, /docs, /docs/getting-started',
			optionalPages: '',
			questions: 'pricing, setup',
			excludes: ''
		};

		const errors = validateSurvey(input);

		expect(Object.keys(errors)).toHaveLength(0);
	});
});
