import {
	OTHER_SEGMENT_KEY,
	UNCATEGORIZED_KEY,
	buildTimeline,
	calcBalance,
	calcSummary,
	expensesByCategory,
	groupByDay,
	isInPeriod,
	resolvePeriod,
} from '@/lib/services/calculations';
import type { CategoryInfo, TxLike } from '@/lib/types';

const income = (amount: number, occurredAt: string, categoryId: string | null = 'salary'): TxLike => ({
	type: 'INCOME',
	amount,
	occurredAt,
	categoryId,
});
const expense = (amount: number, occurredAt: string, categoryId: string | null = 'food'): TxLike => ({
	type: 'EXPENSE',
	amount,
	occurredAt,
	categoryId,
});

const categories: CategoryInfo[] = [
	{ id: 'food', name: 'Продукти', color: '#1F7A5A' },
	{ id: 'home', name: 'Житло', color: '#3E7FA6' },
	{ id: 'transport', name: 'Транспорт', color: '#B04A33' },
	{ id: 'fun', name: 'Розваги', color: '#C58A2E' },
	{ id: 'clothes', name: 'Одяг', color: '#6B5CA5' },
	{ id: 'salary', name: 'Зарплата', color: '#1F7A5A' },
];

const october = { from: '2026-10-01', to: '2026-10-31' };

describe('calcBalance — FR-18, AC5', () => {
	it('порожній список → 0', () => {
		expect(calcBalance([])).toBe(0);
	});

	it('доходи мінус витрати за весь час, незалежно від дати', () => {
		const txs = [income(1200000, '2025-01-10'), expense(124050, '2026-10-05'), expense(24700, '2026-10-06')];
		expect(calcBalance(txs)).toBe(1200000 - 124050 - 24700);
	});

	it('може бути від\'ємним', () => {
		expect(calcBalance([income(10000, '2026-10-01'), expense(15000, '2026-10-02')])).toBe(-5000);
	});

	it('точний у копійках: 0,10 + 0,20 = 0,30 (немає похибки float)', () => {
		expect(calcBalance([income(10, '2026-10-01'), income(20, '2026-10-01')])).toBe(30);
	});

	it('коректно сумує 10 000 операцій із великими сумами (NFR-3)', () => {
		const txs = Array.from({ length: 10000 }, (_, i) =>
			i % 2 === 0 ? income(100_000_000_000, '2026-10-01') : expense(99_999_999_999, '2026-10-01'),
		);
		expect(calcBalance(txs)).toBe(5000);
	});

	it('операції без категорії враховуються в балансі', () => {
		expect(calcBalance([income(5000, '2026-10-01', null), expense(2000, '2026-10-01', null)])).toBe(3000);
	});
});

describe('calcSummary — FR-19', () => {
	const txs = [
		income(3250000, '2026-10-01'),
		expense(1894025, '2026-10-15'),
		expense(50000, '2026-09-30'),
		income(100000, '2026-11-01'),
	];

	it('рахує доходи, витрати і різницю лише за період', () => {
		expect(calcSummary(txs, october)).toEqual({ income: 3250000, expense: 1894025, diff: 1355975 });
	});

	it('включає межі періоду (перший і останній день)', () => {
		const edges = [income(100, '2026-10-01'), income(200, '2026-10-31')];
		expect(calcSummary(edges, october).income).toBe(300);
	});

	it('період без операцій → нулі', () => {
		expect(calcSummary(txs, { from: '2020-01-01', to: '2020-01-31' })).toEqual({ income: 0, expense: 0, diff: 0 });
	});
});

describe('resolvePeriod — FR-16', () => {
	it('поточний місяць', () => {
		expect(resolvePeriod('current-month', '2026-10-21')).toEqual(october);
	});

	it('попередній місяць через межу року', () => {
		expect(resolvePeriod('previous-month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
	});

	it('лютий високосного і невисокосного року', () => {
		expect(resolvePeriod('previous-month', '2028-03-01').to).toBe('2028-02-29');
		expect(resolvePeriod('previous-month', '2026-03-01').to).toBe('2026-02-28');
	});

	it('рік — календарний рік поточної дати', () => {
		expect(resolvePeriod('year', '2026-10-21')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
	});

	it('довільний діапазон повертається як є; початок пізніше кінця — помилка', () => {
		const custom = { from: '2026-09-10', to: '2026-10-05' };
		expect(resolvePeriod('custom', '2026-10-21', custom)).toEqual(custom);
		expect(() => resolvePeriod('custom', '2026-10-21', { from: '2026-10-05', to: '2026-09-10' })).toThrow();
		expect(() => resolvePeriod('custom', '2026-10-21')).toThrow();
	});

	it('isInPeriod включає обидві межі', () => {
		expect(isInPeriod('2026-10-01', october)).toBe(true);
		expect(isInPeriod('2026-10-31', october)).toBe(true);
		expect(isInPeriod('2026-11-01', october)).toBe(false);
	});
});

describe('expensesByCategory — FR-20, AC7', () => {
	it('групує лише витрати за період, сортує за спаданням суми', () => {
		const txs = [
			expense(30000, '2026-10-02', 'home'),
			expense(50000, '2026-10-03', 'food'),
			expense(20000, '2026-10-04', 'transport'),
			income(999999, '2026-10-01'),
			expense(70000, '2026-09-30', 'fun'),
		];
		const segments = expensesByCategory(txs, october, categories);
		expect(segments.map((s) => [s.name, s.amount, s.percent])).toEqual([
			['Продукти', 50000, 50],
			['Житло', 30000, 30],
			['Транспорт', 20000, 20],
		]);
	});

	it('категорії з часткою < 3 % потрапляють у сегмент «Інше» в кінці списку', () => {
		const txs = [
			expense(9500, '2026-10-01', 'food'),
			expense(290, '2026-10-01', 'fun'), // 2,9 %
			expense(210, '2026-10-01', 'clothes'), // 2,1 %
		];
		const segments = expensesByCategory(txs, october, categories);
		expect(segments.map((s) => s.key)).toEqual(['food', OTHER_SEGMENT_KEY]);
		expect(segments[1]).toMatchObject({ name: 'Інше', amount: 500, percent: 5 });
	});

	it('частка рівно 3 % не об\'єднується (граничне значення)', () => {
		const txs = [expense(9700, '2026-10-01', 'food'), expense(300, '2026-10-01', 'fun')];
		expect(expensesByCategory(txs, october, categories).map((s) => s.key)).toEqual(['food', 'fun']);
	});

	it('відсотки на діаграмі завжди дають у сумі 100', () => {
		const txs = [
			expense(1, '2026-10-01', 'food'),
			expense(1, '2026-10-01', 'home'),
			expense(1, '2026-10-01', 'transport'),
		];
		const percents = expensesByCategory(txs, october, categories).map((s) => s.percent);
		expect(percents.reduce((a, b) => a + b, 0)).toBe(100);
		expect(percents).toEqual([34, 33, 33]);
	});

	it('операції без категорії показуються сегментом «Без категорії» (FR-10)', () => {
		const segments = expensesByCategory([expense(1000, '2026-10-01', null)], october, categories);
		expect(segments).toEqual([
			{ key: UNCATEGORIZED_KEY, name: 'Без категорії', color: '#5E6B73', amount: 1000, percent: 100 },
		]);
	});

	it('немає витрат за період → порожній масив (FR-22, порожній стан)', () => {
		expect(expensesByCategory([income(1000, '2026-10-01')], october, categories)).toEqual([]);
	});
});

describe('buildTimeline — FR-21, AC8', () => {
	it('повертає кожен місяць періоду, включно з місяцями без операцій (US-14)', () => {
		const txs = [income(1000, '2026-05-10'), expense(400, '2026-05-11'), expense(300, '2026-07-01')];
		expect(buildTimeline(txs, { from: '2026-05-01', to: '2026-07-31' })).toEqual([
			{ month: '2026-05', income: 1000, expense: 400, balance: 600 },
			{ month: '2026-06', income: 0, expense: 0, balance: 0 },
			{ month: '2026-07', income: 0, expense: 300, balance: -300 },
		]);
	});

	it('працює через межу року', () => {
		const months = buildTimeline([], { from: '2025-11-15', to: '2026-02-03' }).map((p) => p.month);
		expect(months).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
	});

	it('ігнорує операції поза періодом, навіть у крайніх місяцях', () => {
		const txs = [income(1000, '2026-05-01'), income(5000, '2026-05-20')];
		expect(buildTimeline(txs, { from: '2026-05-15', to: '2026-05-31' })[0].income).toBe(5000);
	});
});

describe('groupByDay — FR-15', () => {
	it('групує за днями, новіші зверху, з підсумком дня зі знаком', () => {
		const txs = [
			expense(24700, '2026-10-05'),
			income(1200000, '2026-10-06'),
			expense(124050, '2026-10-06'),
			expense(20000, '2026-10-04'),
		];
		const groups = groupByDay(txs);
		expect(groups.map((g) => [g.date, g.total, g.items.length])).toEqual([
			['2026-10-06', 1200000 - 124050, 2],
			['2026-10-05', -24700, 1],
			['2026-10-04', -20000, 1],
		]);
	});

	it('порожній список → порожній масив', () => {
		expect(groupByDay([])).toEqual([]);
	});
});
