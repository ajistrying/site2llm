import { expect, test } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Full Stripe Payment E2E Tests
 *
 * These tests verify the complete payment flow by simulating Stripe webhooks.
 * Instead of going through real Stripe checkout, we:
 * 1. Generate an llms.txt run (creates a runId in the database)
 * 2. Call the webhook endpoint directly with a valid signature
 * 3. Verify the run is marked as paid and download works
 *
 * This approach is fast, reliable, and doesn't require Stripe CLI or test cards.
 *
 * HOW STRIPE WEBHOOKS WORK:
 * - Stripe sends POST requests to /api/stripe/webhook when events occur
 * - Each request includes a `stripe-signature` header with HMAC signature
 * - The signature is computed from: timestamp + payload + your webhook secret
 * - Our server verifies this signature before processing the event
 *
 * Setup: Ensure STRIPE_WEBHOOK_SECRET is set in .env.local
 */

/**
 * Reads the webhook secret from .env.local
 *
 * We need the same secret the server uses to generate valid signatures.
 * Falls back to environment variable or a test default.
 */
function getWebhookSecret(): string {
	try {
		const envPath = resolve(process.cwd(), '.env.local');
		const envContent = readFileSync(envPath, 'utf-8');
		const match = envContent.match(/STRIPE_WEBHOOK_SECRET=["']?([^"'\n]+)["']?/);
		if (match) return match[1];
	} catch {
		// Fall back to environment variable if .env.local not found
	}
	return process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';
}

/**
 * Creates a valid Stripe webhook signature
 *
 * Stripe signatures follow this format: t=timestamp,v1=signature
 * The signature is HMAC-SHA256 of "timestamp.payload" using the webhook secret
 *
 * This mimics exactly what Stripe does when sending webhook events.
 */
async function createStripeSignature(payload: string, secret: string): Promise<string> {
	// Stripe uses Unix timestamp in seconds
	const timestamp = Math.floor(Date.now() / 1000).toString();

	// The signed payload format is: "{timestamp}.{json_payload}"
	const signedPayload = `${timestamp}.${payload}`;

	// Use Web Crypto API to compute HMAC-SHA256
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));

	// Convert to hex string
	const digest = Array.from(new Uint8Array(signature))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');

	// Return in Stripe's signature header format
	return `t=${timestamp},v1=${digest}`;
}

/**
 * Helper: Fills all 3 steps of the survey form quickly
 * (Same as core-flow.test.ts helper)
 */
async function fillCompleteForm(page: import('@playwright/test').Page) {
	// Step 1: Project basics
	await page.locator('input[placeholder="Northwind Atlas"]').fill('Test Project');
	await page.locator('input[type="url"]').fill('https://testproject.com');
	await page
		.locator('textarea[placeholder*="Plain language summary"]')
		.fill('A comprehensive testing platform for developers to validate their code quality.');

	const nextButton1 = page.locator('.step-panel.open').getByRole('button', { name: 'Next' });
	await nextButton1.click();
	await page.waitForTimeout(500);

	// Step 2: Priority crawl
	const step2Panel = page.locator('.survey-step').nth(1).locator('.step-panel.open');
	await step2Panel
		.locator('textarea')
		.first()
		.fill(
			'https://testproject.com/pricing\nhttps://testproject.com/docs\nhttps://testproject.com/features'
		);
	await step2Panel.locator('textarea').nth(1).fill('none');
	await step2Panel.locator('textarea').nth(2).fill('pricing, features, integrations');

	const nextButton2 = step2Panel.getByRole('button', { name: 'Next' });
	await nextButton2.click();
	await page.waitForTimeout(500);

	// Step 3: Structure & exclusions
	const step3Panel = page.locator('.survey-step').nth(2).locator('.step-panel.open');
	await step3Panel.locator('input').first().fill('Product, Pricing, Docs');
	await step3Panel.locator('input').nth(1).fill('none');
	await page.getByRole('button', { name: 'SaaS' }).click();
}

test.describe('Full Stripe Payment Flow', () => {
	// Load webhook secret once for all tests
	const WEBHOOK_SECRET = getWebhookSecret();

	// Clear localStorage before each test to prevent cross-test pollution
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => {
			localStorage.clear();
		});
		await page.reload();
	});

	/**
	 * MAIN TEST: Complete end-to-end payment flow
	 *
	 * This test walks through the entire user journey:
	 * 1. Fill form → 2. Generate → 3. Verify unpaid → 4. Webhook → 5. Verify paid → 6. Download
	 *
	 * It uses Playwright's `request` fixture to make direct API calls
	 * alongside the `page` fixture for browser interactions.
	 */
	test('complete flow: generate -> checkout -> webhook -> download', async ({ page, request }) => {
		// === STEP 1: Generate an llms.txt preview ===
		await fillCompleteForm(page);
		await page.locator('button[type="submit"]').click();
		await expect(page.locator('.preview-text')).toBeVisible({ timeout: 30000 });

		// Extract the runId from the page (displayed below the preview)
		// The runId is a UUID that identifies this generation run in the database
		const runIdElement = await page.locator('text=Run ID:').textContent();
		const runIdMatch = runIdElement?.match(/Run ID:\s*([a-f0-9-]+)/i);
		expect(runIdMatch).toBeTruthy();
		const runId = runIdMatch![1];
		console.log('Generated runId:', runId);

		// === STEP 2: Verify the run exists but is NOT paid ===
		// GET /api/run returns the run's payment status
		const runStatusBefore = await request.get(`/api/run?runId=${runId}`);
		expect(runStatusBefore.ok()).toBeTruthy();
		const runDataBefore = await runStatusBefore.json();
		expect(runDataBefore.paid).toBe(false); // Should be unpaid initially

		// === STEP 3: Verify download is blocked before payment ===
		// GET /api/download should return 402 Payment Required
		const downloadBefore = await request.get(`/api/download?runId=${runId}`);
		expect(downloadBefore.status()).toBe(402);

		// === STEP 4: Simulate Stripe webhook ===
		// This is what Stripe sends when a checkout session completes
		const webhookPayload = JSON.stringify({
			id: 'evt_test_' + Date.now(), // Unique event ID
			type: 'checkout.session.completed', // Event type that triggers payment
			data: {
				object: {
					id: 'cs_test_' + Date.now(), // Checkout session ID
					payment_status: 'paid', // Payment was successful
					metadata: {
						run_id: runId // We store runId in metadata during checkout
					},
					client_reference_id: runId // Backup: also stored as client_reference_id
				}
			}
		});

		// Generate a valid signature using the same secret as the server
		const signature = await createStripeSignature(webhookPayload, WEBHOOK_SECRET);

		// POST to webhook endpoint with proper headers
		const webhookResponse = await request.post('/api/stripe/webhook', {
			data: webhookPayload,
			headers: {
				'Content-Type': 'application/json',
				'stripe-signature': signature // This is how Stripe authenticates webhooks
			}
		});

		// Server should acknowledge the webhook
		expect(webhookResponse.ok()).toBeTruthy();
		const webhookData = await webhookResponse.json();
		expect(webhookData.received).toBe(true);

		// === STEP 5: Verify the run is now marked as paid ===
		const runStatusAfter = await request.get(`/api/run?runId=${runId}`);
		expect(runStatusAfter.ok()).toBeTruthy();
		const runDataAfter = await runStatusAfter.json();
		expect(runDataAfter.paid).toBe(true); // Payment webhook updated the record

		// === STEP 6: Verify download now works ===
		const downloadAfter = await request.get(`/api/download?runId=${runId}`);
		expect(downloadAfter.ok()).toBeTruthy();
		expect(downloadAfter.headers()['content-type']).toContain('text/plain');

		// Verify the file contains our project data
		const fileContent = await downloadAfter.text();
		expect(fileContent).toContain('Test Project');

		// === STEP 7: Verify the success page works ===
		// After payment, users are redirected to /success?runId=xxx
		await page.goto(`/success?runId=${runId}`);

		// The success page should show the download button (payment already confirmed)
		await expect(page.getByRole('button', { name: 'Download llms.txt' })).toBeVisible({
			timeout: 10000
		});

		// Should also show the file content in a preview
		await expect(page.locator('pre')).toContainText('Test Project');

		// Copy to clipboard button should be available
		await expect(page.getByRole('button', { name: 'Copy to clipboard' })).toBeVisible();
	});

	/**
	 * SECURITY TEST: Webhook rejects invalid signatures
	 *
	 * An attacker could try to mark runs as paid by sending fake webhooks.
	 * The signature verification prevents this - only Stripe (with the secret) can sign.
	 */
	test('webhook rejects invalid signature', async ({ request }) => {
		const webhookPayload = JSON.stringify({
			id: 'evt_test_invalid',
			type: 'checkout.session.completed',
			data: {
				object: {
					payment_status: 'paid',
					metadata: { run_id: 'fake-run-id' }
				}
			}
		});

		// Send with a garbage signature
		const response = await request.post('/api/stripe/webhook', {
			data: webhookPayload,
			headers: {
				'Content-Type': 'application/json',
				'stripe-signature': 't=123,v1=invalidsignature' // Wrong signature
			}
		});

		// Should be rejected with 400 Bad Request
		expect(response.status()).toBe(400);
		const data = await response.json();
		expect(data.error).toContain('Invalid signature');
	});

	/**
	 * SECURITY TEST: Webhook rejects missing signature header
	 *
	 * All webhook requests must include the stripe-signature header.
	 * Requests without it are rejected immediately.
	 */
	test('webhook rejects missing signature', async ({ request }) => {
		const webhookPayload = JSON.stringify({
			id: 'evt_test_missing_sig',
			type: 'checkout.session.completed',
			data: {
				object: {
					payment_status: 'paid',
					metadata: { run_id: 'fake-run-id' }
				}
			}
		});

		// Send WITHOUT the stripe-signature header
		const response = await request.post('/api/stripe/webhook', {
			data: webhookPayload,
			headers: {
				'Content-Type': 'application/json'
				// Note: No stripe-signature header
			}
		});

		expect(response.status()).toBe(400);
		const data = await response.json();
		expect(data.error).toContain('Missing Stripe signature');
	});

	/**
	 * PAYMENT GATE TEST: Download returns 402 for unpaid runs
	 *
	 * This verifies the core business logic: users can't download
	 * without paying. The 402 status code means "Payment Required".
	 */
	test('download returns 402 for unpaid run', async ({ page, request }) => {
		// Generate a run (but don't pay for it)
		await fillCompleteForm(page);
		await page.locator('button[type="submit"]').click();
		await expect(page.locator('.preview-text')).toBeVisible({ timeout: 30000 });

		// Extract the runId
		const runIdElement = await page.locator('text=Run ID:').textContent();
		const runIdMatch = runIdElement?.match(/Run ID:\s*([a-f0-9-]+)/i);
		const runId = runIdMatch![1];

		// Try to download without paying - should fail
		const response = await request.get(`/api/download?runId=${runId}`);
		expect(response.status()).toBe(402); // Payment Required
	});

	/**
	 * IDEMPOTENCY TEST: Can't pay twice for the same run
	 *
	 * Once a run is paid, the checkout endpoint should reject
	 * new checkout attempts to prevent double-charging.
	 */
	test('checkout API returns error for already paid run', async ({ page, request }) => {
		// Generate a run
		await fillCompleteForm(page);
		await page.locator('button[type="submit"]').click();
		await expect(page.locator('.preview-text')).toBeVisible({ timeout: 30000 });

		const runIdElement = await page.locator('text=Run ID:').textContent();
		const runIdMatch = runIdElement?.match(/Run ID:\s*([a-f0-9-]+)/i);
		const runId = runIdMatch![1];

		// Mark it as paid via webhook
		const webhookPayload = JSON.stringify({
			id: 'evt_test_' + Date.now(),
			type: 'checkout.session.completed',
			data: {
				object: {
					payment_status: 'paid',
					metadata: { run_id: runId }
				}
			}
		});
		const signature = await createStripeSignature(webhookPayload, WEBHOOK_SECRET);
		await request.post('/api/stripe/webhook', {
			data: webhookPayload,
			headers: {
				'Content-Type': 'application/json',
				'stripe-signature': signature
			}
		});

		// Now try to start another checkout for the same run
		const checkoutResponse = await request.post('/api/checkout', {
			data: { runId },
			headers: { 'Content-Type': 'application/json' }
		});

		// Should return 409 Conflict - run is already paid
		expect(checkoutResponse.status()).toBe(409);
	});
});
