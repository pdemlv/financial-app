import { defineConfig, devices } from '@playwright/test';

/**
 * UI e2e-тести (tests/e2e). Адреса середовища — BASE_URL (за замовчуванням локальний dev-сервер).
 *   npm run test:e2e                         — усі сценарії, усі браузери
 *   npm run test:smoke                       — лише smoke-набір (@smoke)
 *   npx playwright test --project=mobile-360 — мобільна ширина 360 px (NFR-14)
 */
export default defineConfig({
	testDir: './tests/e2e',
	timeout: 30_000,
	expect: { timeout: 5_000 },
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
		locale: 'uk-UA',
		timezoneId: 'Europe/Kyiv',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } },
		{
			name: 'mobile-360',
			use: { ...devices['Galaxy S8'], viewport: { width: 360, height: 740 } },
		},
	],
});
