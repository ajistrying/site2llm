import { expect, test } from '@playwright/test';

/**
 * Core Flow E2E Tests
 *
 * These tests cover the main user journey through the site2llm app:
 * 1. Landing page renders correctly
 * 2. Multi-step survey form works (3 steps with validation)
 * 3. llms.txt generation produces a preview
 * 4. Form data persists in localStorage across reloads
 *
 * Note: Stripe payment flow is tested separately in stripe-flow.test.ts
 */
test.describe('Core Flow: Generate -> Checkout -> Download', () => {
	// Before each test, clear localStorage to ensure a fresh state
	// This prevents test pollution from previous runs
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => {
			localStorage.clear();
		});
		await page.reload();
	});

	/**
	 * Smoke test: Verify the landing page renders with key elements
	 * This catches basic rendering issues early
	 */
	test('homepage loads with main elements', async ({ page }) => {
		await page.goto('/');

		// Main headline should be visible
		await expect(page.locator('h1')).toContainText('Make AI search read your site correctly');

		// All three value proposition cards should render
		await expect(page.getByText('Fix AI misreads')).toBeVisible();
		await expect(page.getByText('Show up in AI search')).toBeVisible();
		await expect(page.getByText('One-time payment')).toBeVisible();

		// Primary CTA button should be present
		await expect(page.getByRole('button', { name: 'Generate llms.txt file' }).first()).toBeVisible();
	});

	/**
	 * Main happy path: Complete the 3-step survey and generate llms.txt
	 *
	 * Step 1: Project basics (name, URL, summary)
	 * Step 2: Priority crawl (pages to crawl, questions users ask)
	 * Step 3: Structure (categories, exclusions, site type)
	 *
	 * After completing all steps, clicking "Generate" calls /api/generate
	 * which creates a run and returns a preview (partially blurred until paid)
	 */
	test('3-step survey form navigation and generation', async ({ page }) => {
		await page.goto('/');

		// Click CTA to scroll to survey section
		await page.getByRole('button', { name: 'Generate llms.txt file' }).first().click();

		// Verify Step 1 is active (accordion-style UI)
		await expect(page.locator('.survey-step').first()).toHaveClass(/active/);

		// === STEP 1: Project Basics ===
		// Fill required fields: project name, homepage URL, and summary (20+ chars)
		await page.locator('input[placeholder="Northwind Atlas"]').fill('Test Project');
		await page.locator('input[type="url"]').fill('https://testproject.com');
		await page
			.locator('textarea[placeholder*="Plain language summary"]')
			.fill('A comprehensive testing platform for developers to validate their code.');

		// Advance to Step 2 (button only enabled when Step 1 is complete)
		const nextButton1 = page.locator('.step-panel.open').getByRole('button', { name: 'Next' });
		await nextButton1.click();

		// Wait for CSS animation to complete before interacting with Step 2
		await page.waitForTimeout(500);
		await expect(page.locator('.survey-step').nth(1)).toHaveClass(/active/);

		// === STEP 2: Priority Crawl ===
		// Scope selectors to the open panel to avoid ambiguity
		const step2Panel = page.locator('.survey-step').nth(1).locator('.step-panel.open');

		// Priority pages: 3-8 URLs that will be crawled first
		await step2Panel
			.locator('textarea')
			.first()
			.fill(
				'https://testproject.com/pricing\nhttps://testproject.com/docs\nhttps://testproject.com/features'
			);
		// Optional pages: "none" is accepted to skip this field
		await step2Panel.locator('textarea').nth(1).fill('none');
		// Questions users commonly ask (helps prioritize content)
		await step2Panel.locator('textarea').nth(2).fill('pricing, features, integrations');

		// Advance to Step 3
		const nextButton2 = step2Panel.getByRole('button', { name: 'Next' });
		await nextButton2.click();
		await page.waitForTimeout(500);
		await expect(page.locator('.survey-step').nth(2)).toHaveClass(/active/);

		// === STEP 3: Structure & Exclusions ===
		const step3Panel = page.locator('.survey-step').nth(2).locator('.step-panel.open');

		// Categories for organizing the llms.txt sections
		await step3Panel.locator('input').first().fill('Product, Pricing, Docs');
		// URLs to exclude from crawling
		await step3Panel.locator('input').nth(1).fill('none');
		// Site type selector (affects fallback examples if crawl fails)
		await page.getByRole('button', { name: 'SaaS' }).click();

		// === GENERATE ===
		// Submit button should now be enabled (all 3 steps complete)
		const generateButton = page.locator('button[type="submit"]');
		await expect(generateButton).toBeEnabled();
		await generateButton.click();

		// Button text changes to show loading state
		await expect(page.getByRole('button', { name: 'Generating...' })).toBeVisible();

		// Wait for API response and preview to render
		// In test mode, this uses stub data so it's fast
		await expect(page.locator('.preview-text')).toBeVisible({ timeout: 30000 });

		// Verify crawl mode indicator appears (shows "Stub crawl" or "Firecrawl live")
		await expect(page.locator('.pill').filter({ hasText: /crawl/i })).toBeVisible();

		// Preview should contain our project name
		const previewText = await page.locator('.preview-text').textContent();
		expect(previewText).toBeTruthy();
		expect(previewText).toContain('Test Project');

		// Bottom portion is blurred with unlock CTA (requires payment)
		await expect(page.getByText('Unlock the full llms.txt')).toBeVisible();
	});

	/**
	 * Test that clicking "Pay to unlock" triggers the checkout API
	 *
	 * This test verifies:
	 * 1. After generation, the pay button appears
	 * 2. Clicking it calls POST /api/checkout with the runId
	 * 3. API returns 200 with a Stripe checkout URL
	 *
	 * Note: We don't follow the Stripe redirect in this test.
	 * Full payment flow is tested in stripe-flow.test.ts
	 */
	test('checkout flow starts correctly', async ({ page }) => {
		await page.goto('/');

		// Use helper to quickly fill all form fields
		await fillCompleteForm(page);
		await page.locator('button[type="submit"]').click();

		// Wait for generation to complete
		await expect(page.locator('.preview-text')).toBeVisible({ timeout: 30000 });

		// Pay button should appear in the locked preview overlay
		const payButton = page.getByRole('button', { name: 'Pay to unlock' }).first();
		await expect(payButton).toBeVisible();

		// Intercept the checkout API call to verify it's triggered
		// Promise.all ensures we catch the response even if click is fast
		const [response] = await Promise.all([
			page.waitForResponse((resp) => resp.url().includes('/api/checkout')),
			payButton.click()
		]);

		// Checkout API should return success with Stripe URL
		expect(response.status()).toBe(200);
	});

	/**
	 * Test form validation prevents incomplete submissions
	 *
	 * Step 1 requires:
	 * - Project name (any non-empty string)
	 * - Valid URL (must parse as http/https)
	 * - Summary with 20+ characters
	 *
	 * This test uses invalid data and verifies the Next button stays disabled
	 */
	test('form validation - step 1 incomplete blocks progress', async ({ page }) => {
		await page.goto('/');

		// Enter invalid data that fails validation
		await page.locator('input[placeholder="Northwind Atlas"]').fill('Test');
		await page.locator('input[type="url"]').fill('invalid-url'); // Not a valid URL
		await page.locator('textarea[placeholder*="Plain language summary"]').fill('Too short'); // < 20 chars

		// Step 1 should NOT have the "complete" class
		await expect(page.locator('.survey-step').first()).not.toHaveClass(/complete/);

		// Next button should be disabled, preventing navigation to Step 2
		const nextButton = page.locator('.step-panel.open').getByRole('button', { name: 'Next' });
		await expect(nextButton).toBeDisabled();
	});

	/**
	 * Test that form data persists in localStorage
	 *
	 * The app autosaves survey data to localStorage on every input change.
	 * This allows users to:
	 * - Leave and come back without losing progress
	 * - Refresh the page accidentally without data loss
	 */
	test('localStorage persistence works', async ({ page }) => {
		await page.goto('/');

		// Fill some fields (partial form completion)
		await page.locator('input[placeholder="Northwind Atlas"]').fill('Persisted Project');
		await page.locator('input[type="url"]').fill('https://persisted.com');

		// Small delay to ensure autosave triggered (saves on input event)
		await page.waitForTimeout(100);

		// Simulate user leaving and returning (page reload)
		await page.reload();

		// Data should be restored from localStorage
		await expect(page.locator('input[placeholder="Northwind Atlas"]')).toHaveValue(
			'Persisted Project'
		);
		await expect(page.locator('input[type="url"]')).toHaveValue('https://persisted.com');
	});
});

/**
 * Helper function: Fills all 3 steps of the survey form
 *
 * Used by multiple tests to quickly get to a generated state.
 * Enters valid test data for each field and navigates through all steps.
 */
async function fillCompleteForm(page: import('@playwright/test').Page) {
	// === Step 1: Project Basics ===
	await page.locator('input[placeholder="Northwind Atlas"]').fill('Test Project');
	await page.locator('input[type="url"]').fill('https://testproject.com');
	await page
		.locator('textarea[placeholder*="Plain language summary"]')
		.fill('A comprehensive testing platform for developers to validate their code quality.');

	// Click Next and wait for step 2 animation
	const nextButton1 = page.locator('.step-panel.open').getByRole('button', { name: 'Next' });
	await nextButton1.click();
	await page.waitForTimeout(500);

	// === Step 2: Priority Crawl ===
	const step2Panel = page.locator('.survey-step').nth(1).locator('.step-panel.open');
	await step2Panel
		.locator('textarea')
		.first()
		.fill(
			'https://testproject.com/pricing\nhttps://testproject.com/docs\nhttps://testproject.com/features'
		);
	await step2Panel.locator('textarea').nth(1).fill('none');
	await step2Panel.locator('textarea').nth(2).fill('pricing, features, integrations');

	// Click Next and wait for step 3 animation
	const nextButton2 = step2Panel.getByRole('button', { name: 'Next' });
	await nextButton2.click();
	await page.waitForTimeout(500);

	// === Step 3: Structure & Exclusions ===
	const step3Panel = page.locator('.survey-step').nth(2).locator('.step-panel.open');
	await step3Panel.locator('input').first().fill('Product, Pricing, Docs');
	await step3Panel.locator('input').nth(1).fill('none');
	await page.getByRole('button', { name: 'SaaS' }).click();
}
