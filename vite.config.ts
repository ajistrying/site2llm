import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig(() => {
	const browserEnabled = Boolean(process.env.VITEST_BROWSER);
	const projects = [];

	if (browserEnabled) {
		projects.push({
			extends: './vite.config.ts',

			test: {
				name: 'client',

				browser: {
					enabled: true,
					provider: playwright(),
					instances: [{ browser: 'chromium' as const, headless: true }]
				},

				include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
				exclude: ['src/lib/server/**']
			}
		});
	}

	projects.push({
		extends: './vite.config.ts',

		test: {
			name: 'server',
			environment: 'node',
			include: ['src/**/*.{test,spec}.{js,ts}'],
			exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
		}
	});

	return {
		plugins: [tailwindcss(), sveltekit(), devtoolsJson()],

		test: {
			expect: { requireAssertions: true },
			projects
		}
	};
});
