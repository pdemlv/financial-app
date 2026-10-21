import type { CategoryInfo, IsoDate, Period, TxLike } from '../types';

/** FR-20: категорії з часткою менше 3 % об'єднуються в «Інше». */
export const SMALL_SHARE_THRESHOLD = 0.03;
export const OTHER_SEGMENT_KEY = '__other__';
export const UNCATEGORIZED_KEY = '__none__';

export type PeriodPreset = 'current-month' | 'previous-month' | 'year' | 'custom';

const signed = (tx: TxLike) => (tx.type === 'INCOME' ? tx.amount : -tx.amount);

export function isInPeriod(date: IsoDate, period: Period): boolean {
	return date >= period.from && date <= period.to;
}

function lastDayOfMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthPeriod(year: number, month: number): Period {
	const mm = String(month).padStart(2, '0');
	return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${lastDayOfMonth(year, month)}` };
}

/** FR-16: перетворює пресет фільтра на конкретний діапазон дат відносно `today`. */
export function resolvePeriod(preset: PeriodPreset, today: IsoDate, custom?: Period): Period {
	const [year, month] = today.split('-').map(Number);
	switch (preset) {
		case 'current-month':
			return monthPeriod(year, month);
		case 'previous-month':
			return month === 1 ? monthPeriod(year - 1, 12) : monthPeriod(year, month - 1);
		case 'year':
			return { from: `${year}-01-01`, to: `${year}-12-31` };
		case 'custom':
			if (!custom || custom.from > custom.to) {
				throw new Error('Для довільного періоду початок має бути не пізніше за кінець');
			}
			return custom;
	}
}

/** FR-18: баланс — сума всіх доходів мінус сума всіх витрат за весь час (у копійках). */
export function calcBalance(transactions: TxLike[]): number {
	return transactions.reduce((sum, tx) => sum + signed(tx), 0);
}

export interface PeriodSummary {
	income: number;
	expense: number;
	diff: number;
}

/** FR-19: доходи, витрати і різниця за період. */
export function calcSummary(transactions: TxLike[], period: Period): PeriodSummary {
	let income = 0;
	let expense = 0;
	for (const tx of transactions) {
		if (!isInPeriod(tx.occurredAt, period)) continue;
		if (tx.type === 'INCOME') income += tx.amount;
		else expense += tx.amount;
	}
	return { income, expense, diff: income - expense };
}

export interface CategorySegment {
	key: string;
	name: string;
	color: string;
	amount: number;
	/** Ціле число відсотків; сума відсотків усіх сегментів дорівнює 100. */
	percent: number;
}

/** Розподіл 100 % між частками методом найбільших залишків, щоб підписи діаграми давали рівно 100. */
function toPercents(amounts: number[]): number[] {
	const total = amounts.reduce((a, b) => a + b, 0);
	if (total === 0) return amounts.map(() => 0);
	const raw = amounts.map((a) => (a / total) * 100);
	const result = raw.map(Math.floor);
	let rest = 100 - result.reduce((a, b) => a + b, 0);
	const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
	for (const { i } of order) {
		if (rest <= 0) break;
		result[i] += 1;
		rest -= 1;
	}
	return result;
}

/**
 * FR-20: структура витрат за період для кругової діаграми.
 * Сегменти відсортовані за спаданням суми, сегмент «Інше» — завжди останній.
 */
export function expensesByCategory(
	transactions: TxLike[],
	period: Period,
	categories: CategoryInfo[],
	threshold = SMALL_SHARE_THRESHOLD,
): CategorySegment[] {
	const totals = new Map<string, number>();
	for (const tx of transactions) {
		if (tx.type !== 'EXPENSE' || !isInPeriod(tx.occurredAt, period)) continue;
		const key = tx.categoryId ?? UNCATEGORIZED_KEY;
		totals.set(key, (totals.get(key) ?? 0) + tx.amount);
	}

	const total = [...totals.values()].reduce((a, b) => a + b, 0);
	if (total === 0) return [];

	const byId = new Map(categories.map((c) => [c.id, c]));
	const big: Omit<CategorySegment, 'percent'>[] = [];
	let other = 0;
	for (const [key, amount] of totals) {
		if (amount / total < threshold) {
			other += amount;
			continue;
		}
		const category = byId.get(key);
		big.push({
			key,
			name: category?.name ?? 'Без категорії',
			color: category?.color ?? '#5E6B73',
			amount,
		});
	}
	big.sort((a, b) => b.amount - a.amount);
	if (other > 0) big.push({ key: OTHER_SEGMENT_KEY, name: 'Інше', color: '#5E6B73', amount: other });

	const percents = toPercents(big.map((s) => s.amount));
	return big.map((s, i) => ({ ...s, percent: percents[i] }));
}

export interface MonthPoint {
	/** РРРР-ММ */
	month: string;
	income: number;
	expense: number;
	/** Баланс місяця: доходи мінус витрати за цей місяць. */
	balance: number;
}

/** FR-21: динаміка по місяцях; місяці без операцій повертаються з нулями, а не пропускаються. */
export function buildTimeline(transactions: TxLike[], period: Period): MonthPoint[] {
	const points: MonthPoint[] = [];
	const index = new Map<string, MonthPoint>();
	let [year, month] = period.from.split('-').map(Number);
	const [endYear, endMonth] = period.to.split('-').map(Number);

	while (year < endYear || (year === endYear && month <= endMonth)) {
		const key = `${year}-${String(month).padStart(2, '0')}`;
		const point = { month: key, income: 0, expense: 0, balance: 0 };
		points.push(point);
		index.set(key, point);
		month += 1;
		if (month > 12) {
			month = 1;
			year += 1;
		}
	}

	for (const tx of transactions) {
		if (!isInPeriod(tx.occurredAt, period)) continue;
		const point = index.get(tx.occurredAt.slice(0, 7));
		if (!point) continue;
		if (tx.type === 'INCOME') point.income += tx.amount;
		else point.expense += tx.amount;
		point.balance = point.income - point.expense;
	}
	return points;
}

export interface DayGroup<T extends TxLike> {
	date: IsoDate;
	/** Підсумок дня зі знаком: доходи мінус витрати. */
	total: number;
	items: T[];
}

/** FR-15: групування за днями, новіші дні зверху; порядок усередині дня зберігається. */
export function groupByDay<T extends TxLike>(transactions: T[]): DayGroup<T>[] {
	const groups = new Map<IsoDate, DayGroup<T>>();
	for (const tx of transactions) {
		let group = groups.get(tx.occurredAt);
		if (!group) {
			group = { date: tx.occurredAt, total: 0, items: [] };
			groups.set(tx.occurredAt, group);
		}
		group.items.push(tx);
		group.total += signed(tx);
	}
	return [...groups.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
