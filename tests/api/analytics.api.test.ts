import { resolvePeriod } from '@/lib/services/calculations';
import { daysAgo, describeIfServer, registerUser, todayIso, type ApiSession } from '../helpers/api';

const monthsAgo = (n: number) => {
	const d = new Date();
	d.setUTCDate(15);
	d.setUTCMonth(d.getUTCMonth() - n);
	return d.toISOString().slice(0, 10);
};

describeIfServer('GET /api/analytics/* — FR-18…FR-22', () => {
	let user: ApiSession;
	const month = resolvePeriod('current-month', todayIso());

	beforeAll(async () => {
		user = await registerUser();
		// Поточний місяць: дохід 32 500,00, витрати 18 940,25. Дві давні операції впливають лише на баланс.
		await user.createTransaction({ type: 'INCOME', amount: 3250000, occurredAt: month.from });
		await user.createTransaction({ amount: 1000000, categoryName: 'Продукти', occurredAt: month.from });
		await user.createTransaction({ amount: 600000, categoryName: 'Житло', occurredAt: month.from });
		await user.createTransaction({ amount: 254025, categoryName: 'Транспорт', occurredAt: month.from });
		await user.createTransaction({ amount: 40000, categoryName: 'Одяг', occurredAt: month.from }); // 2,1 %
		await user.createTransaction({ type: 'INCOME', amount: 100000, occurredAt: monthsAgo(3) });
		await user.createTransaction({ amount: 30000, occurredAt: monthsAgo(3) });
	});

	it('summary: баланс за весь час і підсумки за період (AC5)', async () => {
		const res = await user.get('/api/analytics/summary').query(month);
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({
			balance: 3250000 + 100000 - 1894025 - 30000,
			income: 3250000,
			expense: 1894025,
			diff: 1355975,
		});
	});

	it('by-category: суми, відсотки і сегмент «Інше» для часток < 3 % (AC7)', async () => {
		const res = await user.get('/api/analytics/by-category').query(month);
		expect(res.status).toBe(200);
		expect(res.body.total).toBe(1894025);

		const items: { name: string; amount: number; percent: number }[] = res.body.items;
		expect(items.map((i) => i.name)).toEqual(['Продукти', 'Житло', 'Транспорт', 'Інше']);
		expect(items.find((i) => i.name === 'Інше')!.amount).toBe(40000);
		expect(items.reduce((sum, i) => sum + i.percent, 0)).toBe(100);
	});

	it('timeline: по ряду на кожен місяць періоду, порожні місяці — нулі (AC8)', async () => {
		const from = `${monthsAgo(3).slice(0, 7)}-01`;
		const res = await user.get('/api/analytics/timeline').query({ from, to: month.to });
		expect(res.status).toBe(200);

		const items: { month: string; income: number; expense: number; balance: number }[] = res.body.items;
		expect(items).toHaveLength(4);
		expect(items[0]).toMatchObject({ income: 100000, expense: 30000, balance: 70000 });
		expect(items[1]).toMatchObject({ income: 0, expense: 0, balance: 0 });
		expect(items[3]).toMatchObject({ income: 3250000, expense: 1894025, balance: 1355975 });
	});

	it('порожній період: summary з нулями, by-category і timeline без падінь (FR-22)', async () => {
		const empty = { from: '2001-01-01', to: '2001-01-31' };
		expect((await user.get('/api/analytics/summary').query(empty)).body).toMatchObject({ income: 0, expense: 0, diff: 0 });
		expect((await user.get('/api/analytics/by-category').query(empty)).body.items).toEqual([]);
		expect((await user.get('/api/analytics/timeline').query(empty)).body.items).toEqual([
			{ month: '2001-01', income: 0, expense: 0, balance: 0 },
		]);
	});

	it('редагування і видалення операції одразу відображаються в аналітиці (AC3)', async () => {
		const other = await registerUser();
		const tx = await other.createTransaction({ amount: 10000, occurredAt: daysAgo(0) });
		await other.patch(`/api/transactions/${tx.id}`, { amount: 30000 });
		expect((await other.get('/api/analytics/summary')).body.balance).toBe(-30000);
		await other.delete(`/api/transactions/${tx.id}`);
		expect((await other.get('/api/analytics/summary')).body.balance).toBe(0);
	});
});
