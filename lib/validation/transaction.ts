import { MAX_AMOUNT_KOPECKS } from '../format/money';
import { isValidIsoDate } from '../format/date';
import type { CategoryRef, IsoDate, ValidationError } from '../types';

export const COMMENT_MAX_LENGTH = 200;

export interface TransactionInput {
	type?: unknown;
	amount?: unknown;
	categoryId?: unknown;
	occurredAt?: unknown;
	comment?: unknown;
}

export interface TransactionContext {
	/** Сьогоднішня дата користувача — дата операції не може бути пізнішою. */
	today: IsoDate;
	/** Категорії поточного користувача; чужі категорії сюди не потрапляють. */
	categories: CategoryRef[];
}

/**
 * FR-12: правила валідації операції. Повертає список помилок із назвою поля;
 * порожній список означає, що операцію можна зберігати.
 */
export function validateTransaction(input: TransactionInput, ctx: TransactionContext): ValidationError[] {
	const errors: ValidationError[] = [];
	const typeValid = input.type === 'INCOME' || input.type === 'EXPENSE';

	if (!typeValid) {
		errors.push({ field: 'type', message: 'Оберіть тип операції: дохід або витрата' });
	}

	if (typeof input.amount !== 'number' || !Number.isInteger(input.amount)) {
		errors.push({ field: 'amount', message: 'Вкажіть суму числом, наприклад 1 240,50' });
	} else if (input.amount <= 0) {
		errors.push({ field: 'amount', message: 'Сума має бути більшою за 0' });
	} else if (input.amount > MAX_AMOUNT_KOPECKS) {
		errors.push({ field: 'amount', message: 'Сума не може перевищувати 1 000 000 000 ₴' });
	}

	if (typeof input.categoryId !== 'string' || input.categoryId === '') {
		errors.push({ field: 'categoryId', message: 'Оберіть категорію' });
	} else {
		const category = ctx.categories.find((c) => c.id === input.categoryId);
		if (!category) {
			errors.push({ field: 'categoryId', message: 'Категорію не знайдено, оберіть іншу' });
		} else if (typeValid && category.type !== input.type) {
			errors.push({ field: 'categoryId', message: 'Категорія не відповідає типу операції' });
		}
	}

	if (!isValidIsoDate(input.occurredAt)) {
		errors.push({ field: 'occurredAt', message: 'Вкажіть дату у форматі ДД.ММ.РРРР' });
	} else if (input.occurredAt > ctx.today) {
		errors.push({ field: 'occurredAt', message: 'Дата не може бути в майбутньому' });
	}

	if (input.comment !== undefined && input.comment !== null) {
		if (typeof input.comment !== 'string') {
			errors.push({ field: 'comment', message: 'Коментар має бути текстом' });
		} else if (input.comment.length > COMMENT_MAX_LENGTH) {
			errors.push({ field: 'comment', message: 'Коментар не може бути довшим за 200 символів' });
		}
	}

	return errors;
}
