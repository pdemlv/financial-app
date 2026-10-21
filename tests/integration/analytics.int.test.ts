import {
	buildTimeline,
	calcBalance,
	calcSummary,
	expensesByCategory,
	resolvePeriod,
} from '@/lib/services/calculations';
import type { TxLike } from '@/lib/types';
import { anonymous, registerUser, todayIso, type ApiSession } from '../helpers/api';
import { db, describeIfDb, disconnectDb, userByEmail } from '../helpers/db';

afterAll(disconnectDb);

/**
 * Агрегації виконуються в SQL (architecture.md, розділ 10), а еталонні формули — у lib/services/calculations.
 * Тест наповнює БД напряму 1000 операціями і перевіряє, що SQL-агрегації API збігаються з еталоном.
 */
describeIfDb('Аналітика: SQL-агрегації збігаються з еталонними розрахунками — FR-18…FR-21', () => {
	let session: ApiSession;
	let txs: TxLike[];
	let categories: { id: string; name: string; color: string }[];

	beforeAll(async () => {
		session = await registerUser();
		const user = await userByEmail(session.email);
		const all = await db().category.findMany({ where: { userId: user.id } });
		const expenseCats = all.filter((c) => c.type === 'EXPENSE');
		const incomeCats = all.filter((c) => c.type === 'INCOME');
		categories = all.map(({ id, name, color }) => ({ id, name, color }));

		// Детермінований псевдовипадковий набір: різні суми, категорії, 400 днів історії, частина без категорії
		let seed = 42;
		const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
		txs = Array.from({ length: 1000 }, () => {
			const isIncome = rand() < 0.15;
			const pool = isIncome ? incomeCats : expenseCats;
			const d = new Date();
			d.setUTCDate(d.getUTCDate() - Math.floor(rand() * 400));
			return {
				type: isIncome ? 'INCOME' : 'EXPENSE',
				amount: 1 + Math.floor(rand() * (isIncome ? 5_000_000 : 300_000)),
				occurredAt: d.toISOString().slice(0, 10),
				categoryId: rand() < 0.05 ? null : pool[Math.floor(rand() * pool.length)].id,
			} satisfies TxLike;
		});

		await db().transaction.createMany({
			data: txs.map((t) => ({ ...t, userId: user.id, amount: BigInt(t.amount), occurredAt: new Date(t.occurredAt) })),
		});
	});

	const year = () => resolvePeriod('year', todayIso());
	const month = () => resolvePeriod('current-month', todayIso());

	it('баланс за весь час і підсумки за місяць', async () => {
		const res = await session.get('/api/analytics/summary').query(month());
		expect(res.body).toMatchObject({ balance: calcBalance(txs), ...calcSummary(txs, month()) });
	});

	it('структура витрат за рік', async () => {
		const expected = expensesByCategory(txs, year(), categories);
		const res = await session.get('/api/analytics/by-category').query(year());
		expect(res.body.items.map((i: { amount: number }) => i.amount)).toEqual(expected.map((s) => s.amount));
		expect(res.body.items.map((i: { percent: number }) => i.percent)).toEqual(expected.map((s) => s.percent));
	});

	it('динаміка по місяцях за рік', async () => {
		const res = await session.get('/api/analytics/timeline').query(year());
		expect(res.body.items).toEqual(buildTimeline(txs, year()));
	});

	it('пагінація проходить усі 1000 записів без дублікатів (NFR-3)', async () => {
		const seen = new Set<string>();
		let cursor: string | null = null;
		do {
			const res = await session.get('/api/transactions').query(cursor ? { cursor } : {});
			expect(res.body.items.length).toBeLessThanOrEqual(20);
			res.body.items.forEach((t: { id: string }) => seen.add(t.id));
			cursor = res.body.nextCursor;
		} while (cursor);
		expect(seen.size).toBe(1000);
	}, 120000);
});

describeIfDb('Health-check з реальною БД — FR-23', () => {
	it('повертає db: ok, коли база доступна', async () => {
		await db().$queryRaw`SELECT 1`;
		const res = await anonymous().get('/api/health');
		expect(res.status).toBe(200);
		expect(res.body.db).toBe('ok');
	});
});
