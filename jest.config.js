/**
 * Три рівні Jest-тестів (див. doc/test-plan.md, розділ 4):
 *  - unit        — чисті функції lib/ без БД і HTTP, запускаються завжди;
 *  - integration — API + PostgreSQL, потрібні BASE_URL і DATABASE_URL;
 *  - api         — контракт REST API (коди, формат відповіді), потрібен BASE_URL.
 * UI e2e-тести запускає Playwright (playwright.config.ts).
 */
const common = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
};

/** @type {import('jest').Config} */
module.exports = {
	projects: [
		{ ...common, displayName: 'unit', testMatch: ['<rootDir>/tests/unit/**/*.test.ts'] },
		{ ...common, displayName: 'integration', testMatch: ['<rootDir>/tests/integration/**/*.test.ts'] },
		{ ...common, displayName: 'api', testMatch: ['<rootDir>/tests/api/**/*.test.ts'] },
	],
	// мережеві запити до розгорнутого застосунку повільніші за модульні тести
	testTimeout: 30000,
	// NFR-18: покриття функцій розрахунку сум і балансу — не менше 80 %
	collectCoverageFrom: ['lib/**/*.ts'],
	coverageThreshold: {
		'./lib/services/calculations.ts': { lines: 80, branches: 80, functions: 80, statements: 80 },
		'./lib/format/money.ts': { lines: 80, branches: 80, functions: 80, statements: 80 },
	},
};
