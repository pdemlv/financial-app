import { MAX_AMOUNT_KOPECKS } from '@/lib/format/money';
import { validateTransaction, type TransactionInput } from '@/lib/validation/transaction';
import type { CategoryRef } from '@/lib/types';

const categories: CategoryRef[] = [
	{ id: 'cat-food', type: 'EXPENSE' },
	{ id: 'cat-salary', type: 'INCOME' },
];
const ctx = { today: '2026-10-21', categories };

const valid: TransactionInput = {
	type: 'EXPENSE',
	amount: 124050,
	categoryId: 'cat-food',
	occurredAt: '2026-10-21',
	comment: 'Сільпо, тижневі покупки',
};

const fieldsWithErrors = (input: TransactionInput) => validateTransaction(input, ctx).map((e) => e.field);

describe('validateTransaction — FR-12', () => {
	it('коректна витрата не має помилок', () => {
		expect(validateTransaction(valid, ctx)).toEqual([]);
	});

	it('коректний дохід без коментаря не має помилок', () => {
		const income = { type: 'INCOME', amount: 1200000, categoryId: 'cat-salary', occurredAt: '2026-10-01' };
		expect(validateTransaction(income, ctx)).toEqual([]);
	});

	describe('сума', () => {
		it.each([0, -1, -50000])('%i → «Сума має бути більшою за 0» (US-7)', (amount) => {
			expect(validateTransaction({ ...valid, amount }, ctx)).toEqual([
				{ field: 'amount', message: 'Сума має бути більшою за 0' },
			]);
		});

		it('мінімальна сума 1 коп. приймається (граничне значення)', () => {
			expect(validateTransaction({ ...valid, amount: 1 }, ctx)).toEqual([]);
		});

		it('рівно 1 000 000 000 ₴ приймається, на 1 коп. більше — ні', () => {
			expect(fieldsWithErrors({ ...valid, amount: MAX_AMOUNT_KOPECKS })).toEqual([]);
			expect(fieldsWithErrors({ ...valid, amount: MAX_AMOUNT_KOPECKS + 1 })).toEqual(['amount']);
		});

		it.each([12.5, '1240', null, undefined, NaN, Infinity])('нецілі або нечислові значення (%p) відхиляються', (amount) => {
			expect(fieldsWithErrors({ ...valid, amount })).toEqual(['amount']);
		});
	});

	describe('дата', () => {
		it('сьогоднішня дата приймається (граничне значення)', () => {
			expect(fieldsWithErrors({ ...valid, occurredAt: '2026-10-21' })).toEqual([]);
		});

		it('завтрашня дата → «Дата не може бути в майбутньому»', () => {
			expect(validateTransaction({ ...valid, occurredAt: '2026-10-22' }, ctx)).toEqual([
				{ field: 'occurredAt', message: 'Дата не може бути в майбутньому' },
			]);
		});

		it('дата в минулому році приймається', () => {
			expect(fieldsWithErrors({ ...valid, occurredAt: '2019-03-15' })).toEqual([]);
		});

		it.each(['2026-02-30', '21.10.2026', '', undefined])('некоректна дата %p відхиляється', (occurredAt) => {
			expect(fieldsWithErrors({ ...valid, occurredAt })).toEqual(['occurredAt']);
		});
	});

	describe('категорія', () => {
		it('обов\'язкова', () => {
			expect(validateTransaction({ ...valid, categoryId: undefined }, ctx)).toEqual([
				{ field: 'categoryId', message: 'Оберіть категорію' },
			]);
		});

		it('має відповідати типу операції: дохід із категорією витрат відхиляється', () => {
			expect(validateTransaction({ ...valid, type: 'INCOME' }, ctx)).toEqual([
				{ field: 'categoryId', message: 'Категорія не відповідає типу операції' },
			]);
		});

		it('чужа або неіснуюча категорія відхиляється (NFR-6)', () => {
			expect(fieldsWithErrors({ ...valid, categoryId: 'cat-of-another-user' })).toEqual(['categoryId']);
		});
	});

	describe('коментар', () => {
		it('рівно 200 символів приймається, 201 — ні', () => {
			expect(fieldsWithErrors({ ...valid, comment: 'я'.repeat(200) })).toEqual([]);
			expect(fieldsWithErrors({ ...valid, comment: 'я'.repeat(201) })).toEqual(['comment']);
		});

		it('необов\'язковий: відсутній, null або порожній рядок приймаються', () => {
			expect(fieldsWithErrors({ ...valid, comment: undefined })).toEqual([]);
			expect(fieldsWithErrors({ ...valid, comment: null })).toEqual([]);
			expect(fieldsWithErrors({ ...valid, comment: '' })).toEqual([]);
		});

		it('HTML у коментарі не є помилкою валідації — його екранує шар відображення (NFR-9)', () => {
			expect(fieldsWithErrors({ ...valid, comment: '<script>alert(1)</script>' })).toEqual([]);
		});
	});

	it('тип обов\'язковий і лише INCOME | EXPENSE', () => {
		expect(fieldsWithErrors({ ...valid, type: 'TRANSFER' })).toEqual(['type']);
	});

	it('повертає помилки для всіх некоректних полів одночасно, щоб форма підсвітила кожне', () => {
		const errors = fieldsWithErrors({ type: 'EXPENSE', amount: 0, occurredAt: '2030-01-01', comment: 'x'.repeat(300) });
		expect(errors.sort()).toEqual(['amount', 'categoryId', 'comment', 'occurredAt']);
	});

	it('усі повідомлення українською і без технічних кодів (NFR-12)', () => {
		const errors = validateTransaction({}, ctx);
		for (const { message } of errors) {
			expect(message).toMatch(/[а-яіїєґ]/i);
			expect(message).not.toMatch(/[A-Z_]{4,}|undefined|null|NaN/);
		}
	});
});
