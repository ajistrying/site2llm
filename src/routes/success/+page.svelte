<script lang="ts">
	import { onMount } from 'svelte';
	import { PRICE_USD } from '$lib/llms';

	let { data } = $props();

	let paidOverride = $state<boolean | null>(null);
	let contentOverride = $state<string | null>(null);
	let statusOverride = $state<string | null>(null);
	let pollAttempt = $state(0);
	let pollFailed = $state(false);
	let copyState = $state<'idle' | 'copied' | 'error'>('idle');
	let siteOrigin = $state('');
	let pageOrigin = $state('');
	let copyResetTimeout: ReturnType<typeof setTimeout> | null = null;

	const maxAttempts = 20; // 60 seconds total
	const pollInterval = 3000;
	const SURVEY_STORAGE_KEY = 'site2llm-survey';
	const RUN_RETENTION_DAYS = 30;
	const supportEmail = 'wjohnson@eleudev.com';
	const llmsUrl = $derived(siteOrigin ? `${siteOrigin}/llms.txt` : 'https://yourdomain.com/llms.txt');
	const runIdUrl = $derived(
		pageOrigin
			? `${pageOrigin}/success?runId=${encodeURIComponent(data.runId)}`
			: `/success?runId=${encodeURIComponent(data.runId)}`,
	);

	const paid = $derived(paidOverride ?? data.paid ?? false);
	const content = $derived(contentOverride ?? data.content ?? '');
	const statusMessage = $derived(
		statusOverride ?? (paid ? 'Payment confirmed!' : 'Confirming payment...'),
	);

	onMount(() => {
		loadSurveyOrigin();
		pageOrigin = window.location.origin;
		if (!paid) {
			pollPaymentStatus();
		}
	});

	const pollPaymentStatus = async () => {
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			pollAttempt = attempt + 1;

			try {
				const response = await fetch(`/api/run?runId=${data.runId}`);
				if (!response.ok) {
					statusOverride = 'Error checking payment status.';
					pollFailed = true;
					return;
				}

				const result = (await response.json()) as { paid?: boolean };

				if (result.paid) {
					// Payment confirmed - fetch the content
					const downloadResponse = await fetch(`/api/download?runId=${data.runId}`);
					if (downloadResponse.ok) {
						contentOverride = await downloadResponse.text();
						paidOverride = true;
						statusOverride = 'Payment confirmed!';
						return;
					}
				}

				// Not paid yet, continue polling
				statusOverride = `Confirming payment... (${attempt + 1}/${maxAttempts})`;
				await new Promise((resolve) => setTimeout(resolve, pollInterval));
			} catch {
				// Network error, continue polling
				await new Promise((resolve) => setTimeout(resolve, pollInterval));
			}
		}

		// Polling exhausted
		pollFailed = true;
		statusOverride = 'Payment confirmation timed out. Please refresh the page.';
	};

	const downloadFile = () => {
		if (!content) return;

		const blob = new Blob([content], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'llms.txt';
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	};

	const copyToClipboard = async () => {
		if (!content) return;

		try {
			await navigator.clipboard.writeText(content);
			setCopyState('copied');
		} catch {
			setCopyState('error');
		}
	};

	const refreshStatus = () => {
		pollFailed = false;
		pollAttempt = 0;
		statusOverride = 'Checking payment status...';
		pollPaymentStatus();
	};

	const loadSurveyOrigin = () => {
		if (typeof localStorage === 'undefined') return;
		const raw = localStorage.getItem(SURVEY_STORAGE_KEY);
		if (!raw) return;

		try {
			const stored = JSON.parse(raw) as { siteUrl?: string };
			if (typeof stored.siteUrl === 'string' && stored.siteUrl.trim()) {
				const normalized = /^https?:\/\//i.test(stored.siteUrl.trim())
					? stored.siteUrl.trim()
					: `https://${stored.siteUrl.trim()}`;
				siteOrigin = new URL(normalized).origin;
			}
		} catch {
			// Ignore malformed storage or invalid URLs.
		}
	};

	const setCopyState = (nextState: 'idle' | 'copied' | 'error') => {
		copyState = nextState;
		if (copyResetTimeout) {
			clearTimeout(copyResetTimeout);
			copyResetTimeout = null;
		}
		if (nextState !== 'idle') {
			copyResetTimeout = setTimeout(() => {
				copyState = 'idle';
				copyResetTimeout = null;
			}, 2000);
		}
	};
</script>

<svelte:head>
	<title>Download your llms.txt - site2llm</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;700&family=Space+Grotesk:wght@400;500;600&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<main class="min-h-fit bg-[var(--paper)] text-[color:var(--ink)]">
	<div class="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-4">
		<header class="text-center">
			<div
				class="mx-auto mb-4 inline-block rounded-full bg-white/70 px-3 py-1 text-xs uppercase tracking-[0.32em] text-[color:var(--muted)] shadow-sm"
			>
				<a href="/" class="text-sm text-[color:var(--accent-dark)] hover:underline">
				← Back to generation page
			</a>
			</div>

			{#if paid}
				<h1 class="text-lg">
					Thank you for your purchase! Download your file below.
				</h1>
			{:else if pollFailed}
				<div class="mb-4 text-5xl">⏳</div>
				<h1 class="display text-3xl text-[color:var(--ink)] sm:text-4xl">
					Payment pending
				</h1>
				<p class="mt-3 text-[color:var(--muted)]">
					We're still confirming your payment. This usually takes a few seconds.
				</p>
			{:else}
				<div class="mb-4 text-5xl animate-pulse">⏳</div>
				<h1 class="display text-3xl text-[color:var(--ink)] sm:text-4xl">
					Confirming payment...
				</h1>
				<p class="mt-3 text-[color:var(--muted)]">
					Please wait while we verify your payment with Stripe.
				</p>
			{/if}
		</header>

		<div class="card">
			{#if paid && content}
				<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
					<span class="pill">Ready to download</span>
					<span class="run-id text-sm text-[color:var(--muted)]">
						<span>Run ID: {data.runId}</span>
						<button
							class="tooltip"
							type="button"
							data-tip={`Save this Run ID. You can revisit ${runIdUrl} for ${RUN_RETENTION_DAYS} days to re-download.`}
							aria-label="What's this?"
						>
							What's this?
						</button>
					</span>
				</div>

				<div class="preview-shell mb-6">
					<pre class="preview-text"><code>{content}</code></pre>
				</div>

				<div class="flex flex-wrap gap-3">
					<button class="btn primary" type="button" onclick={downloadFile}>
						Download llms.txt
					</button>
					<button
						class={`btn ghost ${copyState === 'copied' ? 'is-copied' : ''} ${
							copyState === 'error' ? 'is-error' : ''
						}`}
						type="button"
						onclick={copyToClipboard}
					>
						{copyState === 'copied'
							? 'Copied!'
							: copyState === 'error'
								? 'Copy failed'
								: 'Copy to clipboard'}
					</button>
				</div>
				<p class="mt-2 text-sm text-[color:var(--muted)]" aria-live="polite">
					{copyState === 'copied'
						? 'Copied to clipboard.'
						: copyState === 'error'
							? 'Copy failed. Please download instead.'
							: 'Tap copy to keep the file in your clipboard.'}
				</p>

				<div class="mt-6 rounded-xl bg-[var(--accent-soft)] p-4">
					<p class="text-sm font-semibold text-[color:var(--accent-dark)]">Next steps:</p>
					<ol class="mt-2 list-inside list-decimal text-sm text-[color:var(--accent-dark)]">
						<li>Save the file as <code class="rounded bg-white/50 px-1">llms.txt</code></li>
						<li>Upload to your website's root directory</li>
						<li>
							Verify it's accessible at
							<code class="rounded bg-white/50 px-1">{llmsUrl}</code>
						</li>
					</ol>
					<p class="mt-3 text-sm text-[color:var(--accent-dark)]">
						Need a hand with adding this file to your site? Email me and I'll try to help.
						<a class="underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>
					</p>
				</div>
			{:else}
				<div class="flex flex-col items-center gap-4 py-4 text-center">
					<p class="text-[color:var(--muted)]">{statusMessage}</p>

					{#if !paid && !pollFailed}
						<div class="h-2 w-48 overflow-hidden rounded-full bg-gray-200">
							<div
								class="h-full bg-[var(--accent)] transition-all duration-300"
								style="width: {(pollAttempt / maxAttempts) * 100}%"
							></div>
						</div>
					{/if}

					{#if pollFailed}
						<button class="btn primary" type="button" onclick={refreshStatus}>
							Check again
						</button>
						<p class="text-xs text-[color:var(--muted)]">
							If the problem persists, email {supportEmail} with Run ID: {data.runId}
						</p>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</main>

<style>
	:global(:root) {
		--paper: #f8f2e7;
		--ink: #1c1b17;
		--muted: #4f463c;
		--accent: #0f766e;
		--accent-dark: #0b4d4f;
		--accent-soft: #d7efe9;
		--shadow: 0 20px 50px rgba(15, 118, 110, 0.15);
	}

	:global(body) {
		font-family: 'Space Grotesk', 'Trebuchet MS', 'Verdana', sans-serif;
		background: var(--paper);
		color: var(--ink);
	}

	.display {
		font-family: 'Fraunces', 'Georgia', serif;
		letter-spacing: -0.01em;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		border-radius: 999px;
		padding: 0.75rem 1.5rem;
		font-weight: 600;
		transition:
			background-color 0.2s ease,
			border-color 0.2s ease,
			color 0.2s ease,
			transform 0.2s ease,
			box-shadow 0.2s ease;
	}

	.btn.primary {
		background: var(--accent);
		color: #fffaf3;
		box-shadow: var(--shadow);
	}

	.btn.primary:hover {
		transform: translateY(-2px);
		box-shadow: 0 22px 60px rgba(15, 118, 110, 0.3);
	}

	.btn.ghost {
		border: 1px solid rgba(79, 70, 60, 0.2);
		background: #fffaf3;
		color: var(--ink);
	}

	.btn.ghost.is-copied {
		border-color: transparent;
		background: var(--accent);
		color: #fffaf3;
		box-shadow: var(--shadow);
	}

	.btn.ghost.is-error {
		border-color: rgba(146, 42, 36, 0.2);
		background: #f8e1dc;
		color: #8f2c1e;
	}

	.card {
		border-radius: 24px;
		border: 1px solid rgba(79, 70, 60, 0.12);
		background: rgba(255, 250, 243, 0.75);
		padding: 1.75rem;
		box-shadow: 0 14px 35px rgba(28, 27, 23, 0.08);
		backdrop-filter: blur(8px);
	}

	.pill {
		border-radius: 999px;
		padding: 0.35rem 0.9rem;
		background: rgba(15, 118, 110, 0.12);
		color: var(--accent-dark);
		font-size: 0.75rem;
		font-weight: 600;
	}

	.run-id {
		display: inline-flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.tooltip {
		position: relative;
		border: none;
		padding: 0;
		background: transparent;
		color: var(--accent-dark);
		font-size: 0.75rem;
		font-weight: 600;
		font-family: inherit;
		cursor: help;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.tooltip::after {
		content: attr(data-tip);
		position: absolute;
		right: 0;
		top: 140%;
		min-width: 220px;
		max-width: 280px;
		padding: 0.6rem 0.7rem;
		border-radius: 12px;
		background: #11100e;
		color: #fffaf3;
		font-size: 0.7rem;
		line-height: 1.4;
		box-shadow: 0 12px 24px rgba(17, 16, 14, 0.28);
		opacity: 0;
		transform: translateY(6px);
		pointer-events: none;
		transition: opacity 0.2s ease, transform 0.2s ease;
		z-index: 10;
	}

	.tooltip:hover::after,
	.tooltip:focus::after,
	.tooltip:focus-visible::after {
		opacity: 1;
		transform: translateY(0);
	}

	.preview-shell {
		max-height: 400px;
		overflow: auto;
	}

	pre {
		white-space: pre-wrap;
		background: #11100e;
		color: #f8f2e7;
		padding: 1.25rem;
		border-radius: 18px;
		font-size: 0.85rem;
		line-height: 1.5;
		overflow: auto;
	}

	code {
		font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
	}
</style>
