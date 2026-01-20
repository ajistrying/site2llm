<script lang="ts">
	import { onMount } from "svelte";
	import { PRICE_USD, validateSurvey, type SiteType, type SurveyInput } from "$lib/llms";

	const valueProps = [
		{
			title: "Fix AI misreads",
			description:
				"Give models a trusted map so they stop guessing your pricing, features, and docs.",
		},
		{
			title: "Show up in AI search",
			description: "A clean llms.txt makes your site easier to surface and answer from.",
		},
		{
			title: "One-time payment",
			description: `Generate first, then pay $${PRICE_USD} to unlock downloads.`,
		},
	];

	const steps = [
		{
			title: "Tell us what AI should get right",
			description: "Share your homepage, key pages, and questions so we prioritize the answers.",
		},
		{
			title: "We crawl only the pages you pick",
			description:
				"Send 3-8 priority URLs plus optional pages as full links or /paths, separated by commas or new lines.",
		},
		{
			title: "Preview first, pay once, then publish",
			description: "Review the preview, unlock the file with one payment, and upload in minutes.",
		},
	];

	const integrationSteps = [
		"Save the file as llms.txt",
		"Upload to your public root (for example: /public or public_html)",
		"Confirm https://yourdomain.com/llms.txt loads as text",
	];

	const SURVEY_STORAGE_KEY = "site2llm-survey";
	const RUN_STORAGE_KEY = "site2llm-run";

	type StoredRun = {
		runId: string;
		preview?: string;
		lockedPreview?: string;
		mode?: "stub" | "live" | "";
		paymentProvider?: string;
		updatedAt: number;
		paid?: boolean;
	};

	const siteTypeOptions: Array<{ value: SiteType; label: string }> = [
		{ value: "docs", label: "Documentation" },
		{ value: "marketing", label: "Marketing" },
		{ value: "saas", label: "SaaS" },
		{ value: "ecommerce", label: "E-commerce" },
		{ value: "marketplace", label: "Marketplace" },
		{ value: "services", label: "Services" },
		{ value: "education", label: "Education" },
		{ value: "media", label: "Blog/Media" },
	];

	const surveySteps = [
		{
			id: 1,
			title: "Project basics",
			description: "Name, URL, and summary.",
		},
		{
			id: 2,
			title: "Priority crawl",
			description: "Pages and questions to rank.",
		},
		{
			id: 3,
			title: "Structure & exclusions",
			description: "Sections and crawl limits.",
		},
	];

	let siteName = $state("");
	let siteUrl = $state("");
	let summary = $state("");
	let priorityPages = $state("");
	let optionalPages = $state("");
	let questions = $state("");
	let categories = $state("");
	let excludes = $state("");
	let siteType: SiteType = $state("docs");

	let status: "idle" | "generating" | "ready" | "error" = $state("idle");
	let formErrors: Record<string, string> = $state({});
	let statusMessage = $state("");
	let llmsPreview = $state("");
	let llmsLocked = $state("");
	let runId: string | null = $state(null);
	let crawlMode: "stub" | "live" | "" = $state("");
	let paymentProvider = $state("Stripe Checkout");
	let paymentStatus: "locked" | "processing" | "paid" | "error" = $state("locked");
	let preferredStep = $state(1);
	let storageReady = $state(false);
	let storedRun: StoredRun | null = $state(null);
	let runIdLookupOpen = $state(false);
	let runIdLookupValue = $state("");
	let runIdLookupError = $state("");

	const RUN_RETENTION_DAYS = 30;

	const safeStorage = {
		get(key: string) {
			if (typeof localStorage === "undefined") return null;
			try {
				return localStorage.getItem(key);
			} catch {
				return null;
			}
		},
		set(key: string, value: string) {
			if (typeof localStorage === "undefined") return false;
			try {
				localStorage.setItem(key, value);
				return true;
			} catch {
				return false;
			}
		},
		remove(key: string) {
			if (typeof localStorage === "undefined") return false;
			try {
				localStorage.removeItem(key);
				return true;
			} catch {
				return false;
			}
		},
	};

	const scrollToSurvey = () => {
		const target = document.getElementById("survey");
		if (target) {
			target.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	};

	const openRunIdLookup = () => {
		runIdLookupOpen = true;
		runIdLookupValue = "";
		runIdLookupError = "";
	};

	const closeRunIdLookup = () => {
		runIdLookupOpen = false;
		runIdLookupError = "";
	};

	const submitRunIdLookup = (event?: SubmitEvent) => {
		event?.preventDefault();
		const trimmed = runIdLookupValue.trim();
		if (!trimmed) {
			runIdLookupError = "Enter a Run ID to continue.";
			return;
		}
		runIdLookupError = "";
		window.location.href = `/success?runId=${encodeURIComponent(trimmed)}`;
	};

	const handleLookupKeydown = (event: KeyboardEvent) => {
		if (event.key === "Escape") {
			closeRunIdLookup();
		}
	};

	const stopModalClick = (event: Event) => {
		event.stopPropagation();
	};

	const startNewRun = () => {
		storedRun = null;
		if (storageReady) {
			safeStorage.remove(RUN_STORAGE_KEY);
		}
		status = "idle";
		statusMessage = "";
		llmsPreview = "";
		llmsLocked = "";
		runId = null;
		crawlMode = "";
		paymentStatus = "locked";
		preferredStep = 1;
		scrollToSurvey();
	};

	const buildPayload = (): SurveyInput => ({
		siteName,
		siteUrl: normalizeSiteUrl(siteUrl),
		summary,
		categories,
		siteType,
		excludes,
		priorityPages,
		optionalPages,
		questions,
	});

	const isNoneValue = (value: string) =>
		["none", "n/a", "na"].includes(value.trim().toLowerCase());

	const splitList = (value: string) =>
		value
			.split(/[\n,]+/)
			.map((item) => item.trim())
			.filter((item) => item && !isNoneValue(item));

	const parseCrawlMode = (value: unknown): "stub" | "live" | "" =>
		value === "stub" || value === "live" ? value : "";

	const normalizeSiteUrl = (value: string) => {
		const trimmed = value.trim();
		if (!trimmed) return "";
		if (/^https?:\/\//i.test(trimmed)) return trimmed;
		if (/^[\w.-]+\.\w{2,}(\/.*)?$/i.test(trimmed)) {
			return `https://${trimmed}`;
		}
		return trimmed;
	};

	const isValidUrl = (value: string) => {
		const trimmed = normalizeSiteUrl(value);
		if (!trimmed) return false;
		try {
			const parsed = new URL(trimmed);
			return ["http:", "https:"].includes(parsed.protocol);
		} catch {
			return false;
		}
	};

	const step1Complete = $derived(
		Boolean(siteName.trim()) && isValidUrl(siteUrl) && summary.trim().length >= 20,
	);
	const optionalProvided = $derived(
		splitList(optionalPages).length > 0 ||
			isNoneValue(optionalPages) ||
			optionalPages.trim().length === 0,
	);
	const excludesProvided = $derived(
		splitList(excludes).length > 0 || isNoneValue(excludes) || excludes.trim().length === 0,
	);
	const step2Complete = $derived(
		splitList(priorityPages).length >= 3 &&
			splitList(priorityPages).length <= 8 &&
			optionalProvided &&
			splitList(questions).length > 0,
	);
	const step3Complete = $derived(
		splitList(categories).length > 0 && excludesProvided && Boolean(siteType),
	);
	const step2Locked = $derived(!step1Complete);
	const step3Locked = $derived(!step2Complete);
	const formComplete = $derived(step1Complete && step2Complete && step3Complete);
	const currentStep = $derived.by(() => {
		// 0 means all collapsed (after generation)
		if (preferredStep === 0) {
			return 0;
		}

		if (preferredStep === 3 && step3Locked) {
			return step2Locked ? 1 : 2;
		}

		if (preferredStep === 2 && step2Locked) {
			return 1;
		}

		return preferredStep;
	});

	const goToStep = (step: number) => {
		if (step === 1) {
			preferredStep = 1;
			return;
		}

		if (step === 2 && !step2Locked) {
			preferredStep = 2;
			return;
		}

		if (step === 3 && !step3Locked) {
			preferredStep = 3;
		}
	};
	const persistSurvey = () => {
		if (!storageReady) return;
		safeStorage.set(SURVEY_STORAGE_KEY, JSON.stringify(buildPayload()));
	};

	const persistRun = (run: StoredRun | null) => {
		storedRun = run;
		if (!storageReady) return;
		if (!run) {
			safeStorage.remove(RUN_STORAGE_KEY);
			return;
		}
		safeStorage.set(RUN_STORAGE_KEY, JSON.stringify(run));
	};

	const hydrateRun = (run: StoredRun, message?: string) => {
		runId = run.runId;
		llmsPreview = run.preview ?? "";
		llmsLocked = run.lockedPreview ?? "";
		crawlMode = parseCrawlMode(run.mode);
		paymentProvider = run.paymentProvider ?? "Stripe Checkout";
		status = "ready";
		if (message) {
			statusMessage = message;
		}
	};

	const syncPaymentStatus = async (targetRunId: string) => {
		try {
			const response = await fetch(`/api/run?runId=${targetRunId}`);
			if (!response.ok) return;
			const data = (await response.json()) as { paid?: boolean };
			if (data.paid) {
				paymentStatus = "paid";
				statusMessage = "Payment received. Download your llms.txt below.";
				if (runId) {
					persistRun({
						runId,
						preview: llmsPreview,
						lockedPreview: llmsLocked,
						mode: crawlMode,
						paymentProvider,
						updatedAt: Date.now(),
						paid: true,
					});
				}
			} else {
				paymentStatus = "locked";
			}
		} catch {
			// Ignore network errors
		}
	};

	const restoreStoredRun = () => {
		if (!storedRun) return;
		statusMessage = "";
		paymentStatus = storedRun.paid ? "paid" : "locked";
		hydrateRun(storedRun, "Recovered your last run.");
		if (!storedRun.paid) {
			void syncPaymentStatus(storedRun.runId);
		}
	};

	onMount(() => {
		const raw = safeStorage.get(SURVEY_STORAGE_KEY);
		if (raw) {
			try {
				const saved = JSON.parse(raw) as Partial<SurveyInput>;
				if (typeof saved.siteName === "string") siteName = saved.siteName;
				if (typeof saved.siteUrl === "string") siteUrl = saved.siteUrl;
				if (typeof saved.summary === "string") summary = saved.summary;
				if (typeof saved.priorityPages === "string") priorityPages = saved.priorityPages;
				if (typeof saved.optionalPages === "string") optionalPages = saved.optionalPages;
				if (typeof saved.questions === "string") questions = saved.questions;
				if (typeof saved.categories === "string") categories = saved.categories;
				if (typeof saved.excludes === "string") excludes = saved.excludes;
				if (
					saved.siteType &&
					siteTypeOptions.some((option) => option.value === saved.siteType)
				) {
					siteType = saved.siteType;
				}
			} catch {
				// Ignore malformed storage.
			}
		}

		const stored = safeStorage.get(RUN_STORAGE_KEY);
		if (stored) {
			try {
				const parsed = JSON.parse(stored) as Partial<StoredRun>;
				if (typeof parsed.runId === "string" && parsed.runId) {
					storedRun = {
						runId: parsed.runId,
						preview: typeof parsed.preview === "string" ? parsed.preview : "",
						lockedPreview:
							typeof parsed.lockedPreview === "string" ? parsed.lockedPreview : "",
						mode: parseCrawlMode(parsed.mode),
						paymentProvider:
							typeof parsed.paymentProvider === "string"
								? parsed.paymentProvider
								: "Stripe Checkout",
						updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
						paid: Boolean(parsed.paid),
					};
				}
			} catch {
				// Ignore malformed storage.
			}
		}

		preferredStep = step2Complete ? 3 : step1Complete ? 2 : 1;
		storageReady = true;

		if (typeof window !== "undefined") {
			const url = new URL(window.location.href);
			const checkout = url.searchParams.get("checkout");
			const checkoutRunId = url.searchParams.get("runId");

			// Handle checkout cancel (user returned from Stripe without paying)
			if (checkout === "cancel" && checkoutRunId) {
				const existingRun: StoredRun =
					storedRun && storedRun.runId === checkoutRunId
						? storedRun
						: {
								runId: checkoutRunId,
								preview: "",
								lockedPreview: "",
								mode: "",
								paymentProvider: "Stripe Checkout",
								updatedAt: Date.now(),
								paid: false,
							};

				paymentStatus = "locked";
				hydrateRun(existingRun);
				persistRun(existingRun);
				statusMessage = "Checkout canceled. You can try again anytime.";

				url.searchParams.delete("checkout");
				url.searchParams.delete("runId");
				window.history.replaceState({}, "", `${url.pathname}${url.search}`);
			} else if (storedRun && status === "idle") {
				restoreStoredRun();
			}
		}
	});

	const handleGenerate = async (event: SubmitEvent) => {
		event.preventDefault();
		formErrors = {};
		statusMessage = "";
		paymentStatus = "locked";
		crawlMode = "";
		llmsPreview = "";
		llmsLocked = "";
		runId = null;

		const payload = buildPayload();
		const errors = validateSurvey(payload);
		if (Object.keys(errors).length > 0) {
			formErrors = errors as Record<string, string>;
			statusMessage = "Fix the highlighted fields to generate your llms.txt.";
			status = "error";
			return;
		}

		status = "generating";

		try {
			const response = await fetch("/api/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			const data = (await response.json().catch(() => null)) as
				| {
						errors?: Record<string, string>;
						preview?: string;
						lockedPreview?: string;
						runId?: string;
						mode?: string;
						payment?: { provider?: string };
						error?: string;
				  }
				| null;
			if (!response.ok) {
				formErrors = (data?.errors ?? {}) as Record<string, string>;
				if (Object.keys(formErrors).length > 0) {
					statusMessage = "Fix the highlighted fields to generate your llms.txt.";
				} else {
					statusMessage = data?.error ?? "Generation failed. Try again in a moment.";
				}
				status = "error";
				return;
			}

			llmsPreview = data?.preview ?? "";
			llmsLocked = data?.lockedPreview ?? "";
			runId = data?.runId ?? null;
			crawlMode = parseCrawlMode(data?.mode);
			paymentProvider = data?.payment?.provider ?? "Stripe Checkout";
			status = "ready";
			if (runId) {
				persistRun({
					runId,
					preview: llmsPreview,
					lockedPreview: llmsLocked,
					mode: crawlMode,
					paymentProvider,
					updatedAt: Date.now(),
					paid: false,
				});
			}

			// Collapse form and scroll to preview section
			preferredStep = 0;
			setTimeout(() => {
				const previewSection = document.getElementById("preview-section");
				if (previewSection) {
					previewSection.scrollIntoView({ behavior: "smooth", block: "start" });
				}
			}, 100);
		} catch (error) {
			statusMessage = "Generation failed. Try again in a moment.";
			status = "error";
		}
	};

	const handleCheckout = async () => {
		if (paymentStatus === "processing") return;
		if (!runId) {
			paymentStatus = "error";
			statusMessage = "Generate a preview before unlocking the download.";
			return;
		}

		paymentStatus = "processing";

		try {
			const response = await fetch("/api/checkout", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ runId }),
			});
			const data = (await response.json().catch(() => null)) as { url?: string } | null;
			if (data?.url) {
				window.location.href = data.url;
				return;
			}

			paymentStatus = "error";
		} catch (error) {
			paymentStatus = "error";
		}
	};

	const downloadPreview = async () => {
		if (!runId) return;
		try {
			const response = await fetch(`/api/download?runId=${runId}`);
			if (!response.ok) {
				statusMessage = "Download failed. Try again in a moment.";
				return;
			}

			const content = await response.text();
			const blob = new Blob([content], { type: "text/plain" });
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = "llms.txt";
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch (error) {
			statusMessage = "Download failed. Try again in a moment.";
		}
	};
</script>

<svelte:head>
	<title>site2llm - llms.txt for AI search</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;700&family=Space+Grotesk:wght@400;500;600&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<main class="relative overflow-x-hidden bg-[var(--paper)] text-[color:var(--ink)]">
	<div class="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-4">
		<header class="reveal flex flex-col gap-6" style="--delay: 0ms">
			<div
				class="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.32em] text-[color:var(--muted)]"
			>
				<span class="rounded-full bg-white/70 px-3 py-1 shadow-sm">site2llm</span>
				<span>AI search visibility</span>
			</div>
			<h1
				class="display text-4xl leading-tight text-[color:var(--ink)] sm:text-5xl lg:text-6xl"
			>
				Make AI search read your site correctly.
			</h1>
			<p class="text-lg text-[color:var(--muted)] sm:text-xl">
				AI already crawls your pages. Without llms.txt it guesses your docs, pricing, and
				product truth without a clear focus. Answer a few questions, we do the rest of the work for you, providing a clean llms.txt you can publish in minutes.
			</p>
			<div class="flex flex-wrap items-center gap-4">
				<button class="btn primary" type="button" onclick={scrollToSurvey}>
					Generate llms.txt
				</button>
				<button
					class="btn ghost"
					type="button"
					title="Use this if you already have a Run ID. It’s the code from a previous run that lets you re-download."
					onclick={openRunIdLookup}
				>
					Re-download with Run ID
				</button>
				<div class="text-lg text-[color:var(--muted)]">
					One-time ${PRICE_USD}. Pay after generation via {paymentProvider}.
				</div>
			</div>
		</header>

		<section class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
			{#each valueProps as prop, index (prop.title)}
				<div class="reveal card" style={`--delay: ${120 + index * 120}ms`}>
					<h3 class="text-lg font-semibold">{prop.title}</h3>
					<p class="text-[color:var(--muted)]">{prop.description}</p>
				</div>
			{/each}
		</section>

		<section class="grid gap-8 lg:grid-cols-[0.9fr,1.1fr]">
			<div class="reveal" style="--delay: 120ms">
				<p class="eyebrow">How it works</p>
				<h2 class="display text-3xl">Preview before you pay, publish in minutes.</h2>
			</div>
			<div class="grid gap-4">
				{#each steps as step, index (step.title)}
					<div class="reveal flex gap-4" style={`--delay: ${160 + index * 120}ms`}>
						<div class="step">{index + 1}</div>
						<div>
							<h3 class="text-lg font-semibold">{step.title}</h3>
							<p class="text-[color:var(--muted)]">{step.description}</p>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<section id="survey" class="grid gap-10 lg:grid-cols-[1fr,1fr]">
			<div class="reveal card" style="--delay: 140ms">
				<div class="flex items-center justify-between">
					<h2 class="display text-3xl">Crucial questions</h2>
					<span class="pill">3-5 min questionnaire</span>
				</div>
				<p class="mt-4 text-[color:var(--muted)]">
					We only ask for what a crawler cannot infer.
				</p>
				<form class="mt-6 grid gap-6" onsubmit={handleGenerate} oninput={persistSurvey}>
					<ol class="survey-steps">
						<li
							class={`survey-step ${currentStep === 1 ? "active" : ""} ${
								step1Complete ? "complete" : ""
							}`}
						>
							<button
								class="step-header"
								type="button"
								aria-expanded={currentStep === 1}
								onclick={() => goToStep(1)}
							>
								<span class="step-index">1</span>
								<span class="step-meta">
									<span class="step-title">{surveySteps[0].title}</span>
									<span class="step-desc">{surveySteps[0].description}</span>
								</span>
								<span class={`step-status ${step1Complete ? "done" : "pending"}`}>
									{step1Complete ? "Complete" : "In progress"}
								</span>
							</button>
							<div class={`step-panel ${currentStep === 1 ? "open" : ""}`}>
								<label class="field">
									<div class="field-label">
										<span>Project or website name</span>
									</div>
									<input
										class:invalid={Boolean(formErrors.siteName)}
										bind:value={siteName}
										type="text"
										placeholder="Northwind Atlas"
									/>
									{#if formErrors.siteName}
										<span class="error">{formErrors.siteName}</span>
									{/if}
									<span class="hint">Use the official brand or product name.</span>
								</label>
								<label class="field">
									<div class="field-label">
										<span>Homepage URL</span>
									</div>
									<input
										class:invalid={Boolean(formErrors.siteUrl)}
										bind:value={siteUrl}
										type="url"
										onblur={() => {
											siteUrl = normalizeSiteUrl(siteUrl);
										}}
										placeholder="https://example.com"
									/>
									{#if formErrors.siteUrl}
										<span class="error">{formErrors.siteUrl}</span>
									{/if}
									<span class="hint">We start crawling here (https:// assumed).</span>
								</label>
								<label class="field">
									<div class="field-label">
										<span>One sentence description</span>
									</div>
									<textarea
										class:invalid={Boolean(formErrors.summary)}
										bind:value={summary}
										rows="3"
										placeholder="Plain language summary of who this helps and what it does."
									></textarea>
									{#if formErrors.summary}
										<span class="error">{formErrors.summary}</span>
									{/if}
									<span class="hint">One factual sentence (20+ characters).</span>
								</label>
								<div class="step-actions">
									<span class="step-note">Step 1 of 3</span>
									<button
										class="btn ghost"
										type="button"
										disabled={!step1Complete}
										onclick={() => goToStep(2)}
									>
										Next
									</button>
								</div>
							</div>
						</li>
						<li
							class={`survey-step ${currentStep === 2 ? "active" : ""} ${
								step2Complete ? "complete" : ""
							}`}
						>
							<button
								class="step-header"
								type="button"
								aria-expanded={currentStep === 2}
								aria-disabled={step2Locked}
								disabled={step2Locked}
								onclick={() => goToStep(2)}
							>
								<span class="step-index">2</span>
								<span class="step-meta">
									<span class="step-title">{surveySteps[1].title}</span>
									<span class="step-desc">{surveySteps[1].description}</span>
								</span>
								<span
									class={`step-status ${
										step2Locked ? "locked" : step2Complete ? "done" : "pending"
									}`}
								>
									{step2Locked ? "Locked" : step2Complete ? "Complete" : "In progress"}
								</span>
							</button>
							<div class={`step-panel ${currentStep === 2 ? "open" : ""}`}>
								<label class="field">
									<div class="field-label">
										<span>Priority pages (3-8 URLs)</span>
										<button
											class="tooltip"
											type="button"
											data-tip="We crawl these first and keep them at the top."
											aria-label="We crawl these first and keep them at the top."
										>
											?
										</button>
									</div>
									<textarea
										class:invalid={Boolean(formErrors.priorityPages)}
										bind:value={priorityPages}
										rows="2"
										placeholder="https://example.com/pricing, /docs/getting-started"
									></textarea>
									{#if formErrors.priorityPages}
										<span class="error">{formErrors.priorityPages}</span>
									{/if}
									<span class="hint">Use commas or new lines.</span>
								</label>
								<label class="field">
									<div class="field-label">
										<span>Optional pages (nice-to-have)</span>
										<button
											class="tooltip"
											type="button"
											data-tip="Placed under Optional so they can be skipped if context is tight."
											aria-label="Placed under Optional so they can be skipped if context is tight."
										>
											?
										</button>
									</div>
									<textarea
										class:invalid={Boolean(formErrors.optionalPages)}
										bind:value={optionalPages}
										rows="2"
										placeholder="/blog, /case-studies"
									></textarea>
									{#if formErrors.optionalPages}
										<span class="error">{formErrors.optionalPages}</span>
									{/if}
									<span class="hint">Nice-to-have context. Leave blank if none.</span>
								</label>
								<label class="field">
									<div class="field-label">
										<span>Main questions people ask about your site</span>
										<button
											class="tooltip"
											type="button"
											data-tip="Helps us prioritize pages and craft clearer summaries."
											aria-label="Helps us prioritize pages and craft clearer summaries."
										>
											?
										</button>
									</div>
									<textarea
										class:invalid={Boolean(formErrors.questions)}
										bind:value={questions}
										rows="2"
										placeholder="pricing, integrations, setup time"
									></textarea>
									{#if formErrors.questions}
										<span class="error">{formErrors.questions}</span>
									{/if}
									<span class="hint">Short phrases are perfect.</span>
								</label>
								<div class="step-actions">
									<button class="btn ghost" type="button" onclick={() => goToStep(1)}>
										Back
									</button>
									<span class="step-note">Step 2 of 3</span>
									<button
										class="btn ghost"
										type="button"
										disabled={!step2Complete}
										onclick={() => goToStep(3)}
									>
										Next
									</button>
								</div>
							</div>
						</li>
						<li
							class={`survey-step ${currentStep === 3 ? "active" : ""} ${
								step3Complete ? "complete" : ""
							}`}
						>
							<button
								class="step-header"
								type="button"
								aria-expanded={currentStep === 3}
								aria-disabled={step3Locked}
								disabled={step3Locked}
								onclick={() => goToStep(3)}
							>
								<span class="step-index">3</span>
								<span class="step-meta">
									<span class="step-title">{surveySteps[2].title}</span>
									<span class="step-desc">{surveySteps[2].description}</span>
								</span>
								<span
									class={`step-status ${
										step3Locked ? "locked" : step3Complete ? "done" : "pending"
									}`}
								>
									{step3Locked ? "Locked" : step3Complete ? "Complete" : "In progress"}
								</span>
							</button>
							<div class={`step-panel ${currentStep === 3 ? "open" : ""}`}>
								<label class="field">
									<div class="field-label">
										<span>Primary sections for llms.txt</span>
										<button
											class="tooltip"
											type="button"
											data-tip="These are the buckets AI will use when reading your site. Think of them as the main chapters."
											aria-label="These are the buckets AI will use when reading your site. Think of them as the main chapters."
										>
											?
										</button>
									</div>
									<input
										class:invalid={Boolean(formErrors.categories)}
										bind:value={categories}
										type="text"
										placeholder="Product, Pricing, Docs, Support"
									/>
									{#if formErrors.categories}
										<span class="error">{formErrors.categories}</span>
									{/if}
									<span class="hint">Use short labels, separated by commas.</span>
								</label>
								<label class="field">
									<div class="field-label">
										<span>Exclude URLs or paths</span>
										<button
											class="tooltip"
											type="button"
											data-tip="Tell us what to skip (login pages, carts, admin tools) so the crawl stays focused."
											aria-label="Tell us what to skip (login pages, carts, admin tools) so the crawl stays focused."
										>
											?
										</button>
									</div>
									<input
										class:invalid={Boolean(formErrors.excludes)}
										bind:value={excludes}
										type="text"
										placeholder="/login, /admin"
									/>
									{#if formErrors.excludes}
										<span class="error">{formErrors.excludes}</span>
									{/if}
									<span class="hint">Leave blank if you do not want to exclude anything.</span>
								</label>
								<div class="field">
									<div class="field-label">
										<span>Site type</span>
										<button
											class="tooltip"
											type="button"
											data-tip="We use this to choose the right example structure and wording when your crawl is limited."
											aria-label="We use this to choose the right example structure and wording when your crawl is limited."
										>
											?
										</button>
									</div>
									<div class="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
										{#each siteTypeOptions as option (option.value)}
											<button
												class={`toggle ${siteType === option.value ? "active" : ""}`}
												type="button"
												onclick={() => {
													siteType = option.value;
													persistSurvey();
												}}
											>
												{option.label}
											</button>
										{/each}
									</div>
									<span class="hint">Helps us pick the best fallback examples.</span>
								</div>
								<div class="step-actions">
									<button class="btn ghost" type="button" onclick={() => goToStep(2)}>
										Back
									</button>
									<span class="step-note">Step 3 of 3</span>
								</div>
							</div>
						</li>
					</ol>
					<div class="survey-footer">
						<button
							class="btn primary w-full sm:w-auto"
							type="submit"
							disabled={!formComplete || status === "generating"}
						>
							{status === "generating" ? "Generating..." : "Generate llms.txt file"}
						</button>
						{#if !formComplete}
							<p class="text-xs text-[color:var(--muted)]">
								Complete each step to unlock generation.
							</p>
						{/if}
						{#if statusMessage}
							<p class="text-xs text-[color:var(--muted)]">{statusMessage}</p>
						{/if}
					</div>
				</form>
			</div>

			<div id="preview-section" class="reveal preview" style="--delay: 180ms">
				<div class="flex items-center justify-between">
					<p class="eyebrow">llms.txt preview</p>
				</div>
				{#if status === "idle"}
					<p class="mt-4 text-[color:var(--muted)]">
						Fill the survey to generate your preview.
					</p>
					{#if storedRun}
						<div class="resume-card mt-4">
							<p class="text-sm font-semibold">Resume your last run</p>
							<p class="text-xs text-[color:var(--muted)]">
								Last saved {new Date(storedRun.updatedAt).toLocaleString()} · Run ID:
								{storedRun.runId}
							</p>
							<div class="mt-3 flex flex-wrap gap-2">
								<button class="btn ghost" type="button" onclick={restoreStoredRun}>
									Restore
								</button>
							</div>
						</div>
					{/if}
				{:else if status === "generating"}
					<p class="mt-4 text-[color:var(--muted)]">Generating your llms.txt...</p>
				{:else if status === "error"}
					<p class="mt-4 text-[color:var(--muted)]">
						{statusMessage || "We could not generate yet. Please try again shortly."}
					</p>
				{:else}
					{#if !llmsPreview}
						<p class="mt-4 text-[color:var(--muted)]">
							Your run is ready. Download the full llms.txt below.
						</p>
					{:else}
						<div class="preview-shell mt-4">
							<pre class="preview-text"><code>{llmsPreview}</code>{#if llmsLocked}<code class="preview-locked" aria-hidden="true">{llmsLocked}</code>{/if}</pre>
							{#if paymentStatus !== "paid" && llmsLocked}
								<div class="preview-fade"></div>
								<div class="preview-cta">
									<div class="overlay-card">
										<p class="overlay-title">Unlock the full llms.txt</p>
										<p class="overlay-copy">
											One-time ${PRICE_USD}. Pay via {paymentProvider} to download.
										</p>
										<button
											class="btn primary"
											type="button"
											disabled={paymentStatus === "processing"}
											onclick={handleCheckout}
										>
											{paymentStatus === "processing"
												? "Opening checkout..."
												: "Pay to unlock"}
										</button>
									</div>
								</div>
							{/if}
						</div>
					{/if}
					<div class="mt-6 grid gap-3">
						{#if paymentStatus === "paid"}
							<button class="btn primary" type="button" onclick={downloadPreview}>
								Download llms.txt
							</button>
						{:else}
							<p class="text-sm text-[color:var(--muted)]">
								Unlock the full file with a one-time ${PRICE_USD} payment via
								{paymentProvider}.
							</p>
							{#if !llmsLocked}
								<button
									class="btn primary"
									type="button"
									disabled={paymentStatus === "processing"}
									onclick={handleCheckout}
								>
									{paymentStatus === "processing"
										? "Opening checkout..."
										: "Pay to unlock"}
								</button>
							{/if}
							{#if paymentStatus === "error"}
								<p class="text-xs text-[color:var(--muted)]">
									Checkout failed. Try again shortly.
								</p>
							{/if}
						{/if}
						{#if storedRun}
							<button class="btn ghost" type="button" onclick={startNewRun}>
								Start a new run
							</button>
						{/if}
					</div>
				{/if}
			</div>
		</section>

		<section class="grid gap-8 lg:grid-cols-[1.1fr,0.9fr]">
			<div class="reveal" style="--delay: 120ms">
				<p class="eyebrow">Publish steps</p>
				<h2 class="display text-3xl">Make it live in three steps.</h2>
				<ol class="mt-6 grid gap-3 text-[color:var(--muted)]">
					{#each integrationSteps as step, index (step)}
						<li class="flex gap-3">
							<span class="step small">{index + 1}</span>
							<span>{step}</span>
						</li>
					{/each}
				</ol>
			</div>
			<div class="reveal card" style="--delay: 180ms">
				<p class="eyebrow">Ready to publish</p>
				<h2 class="display text-2xl">Your llms.txt ships with clear steps.</h2>
				<p class="mt-4 text-[color:var(--muted)]">
					After payment, download the file and follow the checklist to publish at
					/llms.txt.
				</p>
				<button class="btn ghost mt-6" type="button" onclick={scrollToSurvey}>
					Generate now
				</button>
			</div>
		</section>
		<footer class="footer reveal" style="--delay: 200ms">
			<div class="footer-brand">site2llm</div>
			<div class="footer-note">Made by Wellington Johnson.</div>
		</footer>
	</div>
	{#if runIdLookupOpen}
		<div
			class="modal-backdrop"
			role="presentation"
			onpointerdown={closeRunIdLookup}
			onkeydown={handleLookupKeydown}
		>
			<div
				class="modal-panel card"
				role="dialog"
				aria-modal="true"
				aria-labelledby="run-id-title"
				tabindex="-1"
				onpointerdown={stopModalClick}
			>
				<div class="modal-header">
					<h2 id="run-id-title" class="display text-2xl">Re-download your llms.txt</h2>
					<button class="modal-close" type="button" onclick={closeRunIdLookup} aria-label="Close">
						×
					</button>
				</div>
				<p class="modal-copy">
					Enter the Run ID from your receipt or success page. We keep paid runs for
					{RUN_RETENTION_DAYS} days.
				</p>
				<form class="modal-form grid gap-4" onsubmit={submitRunIdLookup}>
					<label class="field">
						<div class="field-label">
							<span>Run ID</span>
						</div>
						<input
							bind:value={runIdLookupValue}
							type="text"
							placeholder="run_1234..."
							autocomplete="off"
							oninput={() => (runIdLookupError = "")}
						/>
						{#if runIdLookupError}
							<span class="error">{runIdLookupError}</span>
						{/if}
					</label>
					<div class="modal-actions">
						<button class="btn ghost" type="button" onclick={closeRunIdLookup}>
							Cancel
						</button>
						<button class="btn primary" type="submit">Open download</button>
					</div>
				</form>
			</div>
		</div>
	{/if}
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
		font-family: "Space Grotesk", "Trebuchet MS", "Verdana", sans-serif;
		background: var(--paper);
		color: var(--ink);
	}

	.display {
		font-family: "Fraunces", "Georgia", serif;
		letter-spacing: -0.01em;
	}

	.eyebrow {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.28em;
		color: var(--muted);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		border-radius: 999px;
		padding: 0.75rem 1.5rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease,
			background 0.2s ease,
			border-color 0.2s ease;
	}

	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn.primary {
		background: var(--accent);
		color: #fffaf3;
		box-shadow: var(--shadow);
	}

	.btn.primary:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 22px 60px rgba(15, 118, 110, 0.3);
	}

	.btn.ghost {
		border: 1px solid rgba(79, 70, 60, 0.3);
		background: #fffaf3;
		color: var(--ink);
	}

	.btn.ghost:not(:disabled) {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent-dark);
	}

	.btn.ghost:hover:not(:disabled) {
		background: var(--accent);
		color: #fffaf3;
		transform: translateY(-1px);
	}

	.card {
		border-radius: 24px;
		border: 1px solid rgba(79, 70, 60, 0.12);
		background: rgba(255, 250, 243, 0.75);
		padding: 1.75rem;
		box-shadow: 0 14px 35px rgba(28, 27, 23, 0.08);
		backdrop-filter: blur(8px);
	}

	.step {
		height: 2.5rem;
		width: 2.5rem;
		border-radius: 999px;
		background: var(--accent-soft);
		color: var(--accent-dark);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		flex-shrink: 0;
	}

	.step.small {
		height: 2rem;
		width: 2rem;
		font-size: 0.85rem;
	}

	.pill {
		border-radius: 999px;
		padding: 0.35rem 0.9rem;
		background: rgba(15, 118, 110, 0.12);
		color: var(--accent-dark);
		font-size: 0.75rem;
		font-weight: 600;
	}

	.survey-steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 1rem;
	}

	.survey-step {
		border-radius: 18px;
		border: 1px solid rgba(79, 70, 60, 0.12);
		background: rgba(255, 255, 255, 0.6);
		overflow: hidden;
		transition: border-color 0.2s ease, box-shadow 0.2s ease;
	}

	.survey-step.complete {
		border-color: rgba(15, 118, 110, 0.4);
		box-shadow: 0 10px 24px rgba(15, 118, 110, 0.08);
	}

	.step-header {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 1rem;
		border: none;
		background: transparent;
		padding: 1rem 1.2rem;
		text-align: left;
		font-family: inherit;
		cursor: pointer;
	}

	.step-header:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.step-index {
		height: 2.1rem;
		width: 2.1rem;
		border-radius: 999px;
		background: var(--accent-soft);
		color: var(--accent-dark);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		flex-shrink: 0;
	}

	.step-meta {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.step-title {
		font-weight: 600;
	}

	.step-desc {
		font-size: 0.8rem;
		color: var(--muted);
	}

	.step-status {
		margin-left: auto;
		font-size: 0.7rem;
		font-weight: 600;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		background: rgba(79, 70, 60, 0.12);
		color: var(--muted);
		white-space: nowrap;
	}

	.step-status.done {
		background: rgba(15, 118, 110, 0.18);
		color: var(--accent-dark);
	}

	.step-status.locked {
		background: rgba(79, 70, 60, 0.1);
		color: rgba(79, 70, 60, 0.6);
	}

	.step-panel {
		display: grid;
		gap: 0.9rem;
		padding: 0 1.2rem;
		max-height: 0;
		opacity: 0;
		overflow: hidden;
		transition: max-height 0.4s ease, opacity 0.3s ease;
	}

	.step-panel.open {
		padding-top: 0.2rem;
		padding-bottom: 1.2rem;
		max-height: 1200px;
		opacity: 1;
	}

	.survey-footer {
		display: grid;
		gap: 0.5rem;
	}

	.step-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-top: 0.2rem;
	}

	.step-note {
		font-size: 0.75rem;
		color: var(--muted);
	}

	.field {
		display: grid;
		gap: 0.4rem;
		font-size: 0.9rem;
	}

	.field-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		font-weight: 600;
	}

	.hint {
		font-size: 0.75rem;
		color: var(--muted);
	}

	.tooltip {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 1.3rem;
		width: 1.3rem;
		border: none;
		padding: 0;
		border-radius: 999px;
		background: rgba(15, 118, 110, 0.12);
		color: var(--accent-dark);
		font-size: 0.75rem;
		font-weight: 700;
		font-family: inherit;
		cursor: help;
	}

	.tooltip::after {
		content: attr(data-tip);
		position: absolute;
		right: 0;
		top: 135%;
		min-width: 220px;
		max-width: 260px;
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

	.field input,
	.field textarea {
		border-radius: 14px;
		border: 1px solid rgba(79, 70, 60, 0.2);
		padding: 0.75rem 0.9rem;
		background: #fffaf3;
	}

	.field input.invalid,
	.field textarea.invalid {
		border-color: rgba(180, 35, 24, 0.6);
		background: rgba(255, 242, 242, 0.8);
	}

	.field input:focus,
	.field textarea:focus {
		outline: 2px solid rgba(15, 118, 110, 0.3);
		outline-offset: 2px;
	}

	.error {
		font-size: 0.75rem;
		color: #b42318;
	}

	.toggle {
		border-radius: 999px;
		border: 1px solid rgba(79, 70, 60, 0.2);
		padding: 0.6rem 0.8rem;
		background: #fffaf3;
		font-weight: 600;
		transition: all 0.2s ease;
	}

	.toggle.active {
		background: var(--accent);
		color: #fffaf3;
		border-color: transparent;
	}

	.preview {
		border-radius: 24px;
		border: 1px solid rgba(79, 70, 60, 0.12);
		background: rgba(255, 255, 255, 0.75);
		padding: 1.75rem;
		box-shadow: 0 16px 40px rgba(28, 27, 23, 0.12);
		backdrop-filter: blur(10px);
	}

	.resume-card {
		border-radius: 16px;
		border: 1px dashed rgba(79, 70, 60, 0.3);
		background: rgba(255, 250, 243, 0.7);
		padding: 1rem;
		display: grid;
		gap: 0.4rem;
	}

	.meta-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
	}

	.preview-shell {
		position: relative;
	}

	.preview-text {
		position: relative;
		z-index: 1;
	}

	.preview-locked {
		display: block;
		filter: blur(6px);
	}

	.preview-fade {
		position: absolute;
		inset: 0;
		border-radius: 18px;
		background: linear-gradient(
			180deg,
			rgba(17, 16, 14, 0) 40%,
			rgba(17, 16, 14, 0.65) 70%,
			rgba(17, 16, 14, 0.9) 100%
		);
		z-index: 2;
		pointer-events: none;
	}

	.preview-cta {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		z-index: 3;
		pointer-events: none;
	}

	.overlay-card {
		pointer-events: auto;
		margin: 1.25rem;
		border-radius: 18px;
		background: #fffaf3;
		color: var(--ink);
		padding: 1.25rem;
		box-shadow: 0 18px 40px rgba(17, 16, 14, 0.25);
		width: min(100%, 22rem);
		display: grid;
		gap: 0.6rem;
	}

	.overlay-title {
		font-weight: 600;
	}

	.overlay-copy {
		font-size: 0.85rem;
		color: var(--muted);
	}

	.overlay-card .btn {
		width: 100%;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(17, 16, 14, 0.45);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		z-index: 50;
	}

	.modal-panel {
		width: min(100%, 30rem);
		display: grid;
		gap: 1rem;
	}

	.modal-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.modal-copy {
		color: var(--muted);
		font-size: 0.9rem;
	}

	.modal-close {
		border: none;
		background: transparent;
		color: var(--muted);
		font-size: 1.5rem;
		line-height: 1;
		cursor: pointer;
	}

	.modal-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		justify-content: flex-end;
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

	.footer {
		margin-top: 0.5rem;
		border-top: 1px solid rgba(79, 70, 60, 0.12);
		padding-top: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
		color: var(--muted);
		font-size: 0.85rem;
	}

	.footer-brand {
		border-radius: 999px;
		background: rgba(15, 118, 110, 0.12);
		color: var(--accent-dark);
		padding: 0.35rem 0.9rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.2em;
		font-size: 0.7rem;
	}

	.footer-note {
		letter-spacing: 0.02em;
	}

	.reveal {
		animation: rise 0.8s ease both;
		animation-delay: var(--delay, 0ms);
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.reveal {
			animation: none;
		}

		.btn.primary:hover {
			transform: none;
			box-shadow: var(--shadow);
		}
	}

	@media (max-width: 640px) {
		.card,
		.preview {
			padding: 1.25rem;
		}

		.step-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.step-status {
			margin-left: 0;
		}

		.step-actions {
			flex-direction: column;
			align-items: stretch;
		}

		.field-label {
			flex-wrap: wrap;
		}

		.tooltip::after {
			left: 0;
			right: auto;
		}

		.btn,
		.toggle {
			width: 100%;
		}

		pre {
			font-size: 0.75rem;
		}
	}
</style>
