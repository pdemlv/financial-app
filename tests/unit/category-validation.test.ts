import { CATEGORY_PALETTE, validateCategory, type ExistingCategory } from '@/lib/validation/category';
import { DEFAULT_CATEGORIES } from '@/lib/services/default-categories';

const existing: ExistingCategory[] = [
	{ id: 'c1', name: 'Продукти', type: 'EXPENSE' },
	{ id: 'c2', name: 'Зарплата', type: 'INCOME' },
	{ id: 'c3', name: 'Інше', type: 'EXPENSE' },
	{ id: 'c4', name: 'Інше', type: 'INCOME' },
];
const fields = (input: Parameters<typeof validateCategory>[0], selfId?: string) =>
	validateCategory(input, existing, selfId).map((e) => e.field);

describe('validateCategory — FR-8, FR-9', () => {
	it('коректна нова категорія', () => {
		expect(fields({ name: 'Кава', type: 'EXPENSE', color: '#C58A2E' })).toEqual([]);
	});

	it('назва 1 і 30 символів приймається, 0 і 31 — ні (граничні значення)', () => {
		expect(fields({ name: 'К', type: 'EXPENSE', color: '#1F7A5A' })).toEqual([]);
		expect(fields({ name: 'К'.repeat(30), type: 'EXPENSE', color: '#1F7A5A' })).toEqual([]);
		expect(fields({ name: '', type: 'EXPENSE', color: '#1F7A5A' })).toEqual(['name']);
		expect(fields({ name: 'К'.repeat(31), type: 'EXPENSE', color: '#1F7A5A' })).toEqual(['name']);
	});

	it('назва лише з пробілів вважається порожньою', () => {
		expect(fields({ name: '   ', type: 'EXPENSE', color: '#1F7A5A' })).toEqual(['name']);
	});

	it('дубль у межах типу → «Категорія з такою назвою вже існує», без урахування регістру і пробілів', () => {
		expect(validateCategory({ name: ' продукти ', type: 'EXPENSE', color: '#1F7A5A' }, existing)).toEqual([
			{ field: 'name', message: 'Категорія з такою назвою вже існує' },
		]);
	});

	it('однакова назва в різних типах дозволена («Продукти» як дохід)', () => {
		expect(fields({ name: 'Продукти', type: 'INCOME', color: '#1F7A5A' })).toEqual([]);
	});

	it('перейменування категорії на її ж назву не є конфліктом', () => {
		expect(fields({ name: 'Продукти', type: 'EXPENSE', color: '#3E7FA6' }, 'c1')).toEqual([]);
	});

	it('перейменування на назву іншої категорії того ж типу — конфлікт', () => {
		expect(fields({ name: 'Інше', type: 'EXPENSE', color: '#3E7FA6' }, 'c1')).toEqual(['name']);
	});

	it('колір лише з палітри; регістр HEX не важливий', () => {
		expect(fields({ name: 'Кава', type: 'EXPENSE', color: '#ff0000' })).toEqual(['color']);
		expect(fields({ name: 'Кава', type: 'EXPENSE', color: '#1f7a5a' })).toEqual([]);
		expect(fields({ name: 'Кава', type: 'EXPENSE' })).toEqual(['color']);
	});

	it('тип обов\'язковий', () => {
		expect(fields({ name: 'Кава', color: '#1F7A5A' })).toEqual(['type']);
	});
});

describe('DEFAULT_CATEGORIES — FR-7', () => {
	it('містить 7 категорій витрат у визначеному порядку', () => {
		expect(DEFAULT_CATEGORIES.filter((c) => c.type === 'EXPENSE').map((c) => c.name)).toEqual([
			'Продукти',
			'Житло',
			'Транспорт',
			"Здоров'я",
			'Розваги',
			'Одяг',
			'Інше',
		]);
	});

	it('містить 4 категорії доходів', () => {
		expect(DEFAULT_CATEGORIES.filter((c) => c.type === 'INCOME').map((c) => c.name)).toEqual([
			'Зарплата',
			'Підробіток',
			'Подарунок',
			'Інше',
		]);
	});

	it('кожна стандартна категорія проходить ту саму валідацію, що й власні', () => {
		DEFAULT_CATEGORIES.forEach((category, i) => {
			const others = DEFAULT_CATEGORIES.filter((_, j) => j !== i).map((c, j) => ({ ...c, id: String(j) }));
			expect(validateCategory(category, others)).toEqual([]);
			expect(CATEGORY_PALETTE).toContain(category.color);
		});
	});
});
