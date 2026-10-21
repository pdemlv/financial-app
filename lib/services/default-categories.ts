import { CATEGORY_PALETTE } from '../validation/category';
import type { TxType } from '../types';

export interface DefaultCategory {
	name: string;
	type: TxType;
	color: string;
}

const EXPENSE_NAMES = ['Продукти', 'Житло', 'Транспорт', "Здоров'я", 'Розваги', 'Одяг', 'Інше'];
const INCOME_NAMES = ['Зарплата', 'Підробіток', 'Подарунок', 'Інше'];

/** FR-7: стандартний набір, який отримує кожен новий користувач під час реєстрації. */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
	...EXPENSE_NAMES.map((name, i) => ({
		name,
		type: 'EXPENSE' as const,
		color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
	})),
	...INCOME_NAMES.map((name, i) => ({
		name,
		type: 'INCOME' as const,
		color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
	})),
];
