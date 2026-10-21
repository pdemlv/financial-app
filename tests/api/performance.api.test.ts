import { resolvePeriod } from '@/lib/services/calculations';
import { BASE_URL, daysAgo, registerUser, todayIso, type ApiSession } from '../helpers/api';

/**
 * NFR-2, NFR-3: 95 % запитів до API — менше 500 мс на обліковому записі з 1000 операцій.
 * Тест повільний (створює 1000 операцій), тому вмикається явно: RUN_PERF=1 npm run test:api.
 * Результат залежить від середовища — офіційний замір виконується на staging (doc/test-plan.md, NFT-01).
 */
const describePerf = BASE_URL && process.env.RUN_PERF ? describe : describe.skip;

function p95(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

describePerf('Продуктивність API на 1000 операцій — NFR-2', () => {
	let user: ApiSession;

	beforeAll(async () => {
		user = await registerUser();
		const foodId = await user.categoryId('Продукти', 'EXPENSE');
		const salaryId = await user.categoryId('Зарплата', 'INCOME');
		for (let batch = 0; batch < 100; batch++) {
			await Promise.all(
				Array.from({ length: 10 }, (_, i) => {
					const n = batch * 10 + i;
					return user.createTransaction({
						type: n % 5 === 0 ? 'INCOME' : 'EXPENSE',
						categoryId: n % 5 === 0 ? salaryId : foodId,
						amount: 1000 + n,
						occurredAt: daysAgo(n % 365),
					});
				}),
			);
		}
	}, 10 * 60 * 1000);

	const month = resolvePeriod('current-month', todayIso());
	const year = resolvePeriod('year', todayIso());
	const endpoints = [
		['/api/transactions', {}],
		['/api/transactions', { ...month, type: 'EXPENSE' }],
		['/api/analytics/summary', month],
		['/api/analytics/by-category', year],
		['/api/analytics/timeline', year],
		['/api/categories', {}],
	] as const;

	it.each(endpoints)('%s %j: p95 < 500 мс на 40 запитах', async (path, query) => {
		await user.get(path).query(query); // прогрів
		const timings: number[] = [];
		for (let i = 0; i < 40; i++) {
			const started = performance.now();
			const res = await user.get(path).query(query);
			timings.push(performance.now() - started);
			expect(res.status).toBe(200);
		}
		expect(p95(timings)).toBeLessThan(500);
	});
});
