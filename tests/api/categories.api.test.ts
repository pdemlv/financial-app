import { describeIfServer, expectError, registerUser, type ApiSession } from '../helpers/api';

describeIfServer('Категорії — FR-7…FR-10', () => {
	let user: ApiSession;

	beforeAll(async () => {
		user = await registerUser();
	});

	it('GET: новий користувач має 7 стандартних категорій витрат і 4 доходів (FR-7)', async () => {
		const expense = await user.categories('EXPENSE');
		const income = await user.categories('INCOME');

		expect(expense.map((c) => c.name).sort()).toEqual(
			['Продукти', 'Житло', 'Транспорт', "Здоров'я", 'Розваги', 'Одяг', 'Інше'].sort(),
		);
		expect(income.map((c) => c.name).sort()).toEqual(['Зарплата', 'Підробіток', 'Подарунок', 'Інше'].sort());
		expect([...expense, ...income].every((c) => c.isDefault && c.transactionCount === 0)).toBe(true);
	});

	it('POST 201: створює власну категорію', async () => {
		const res = await user.post('/api/categories', { name: 'Кава', type: 'EXPENSE', color: '#C58A2E' });
		expect(res.status).toBe(201);
		expect(res.body).toMatchObject({ id: expect.any(String), name: 'Кава', type: 'EXPENSE', isDefault: false });
		expect((await user.categories('EXPENSE')).map((c) => c.name)).toContain('Кава');
	});

	it('POST 409: дубль назви в межах типу (без урахування регістру)', async () => {
		const res = await user.post('/api/categories', { name: 'продукти', type: 'EXPENSE', color: '#1F7A5A' });
		expect(res.status).toBe(409);
		expect(res.body.error.field).toBe('name');
	});

	it('POST 201: та сама назва допустима для іншого типу', async () => {
		const res = await user.post('/api/categories', { name: 'Продукти', type: 'INCOME', color: '#1F7A5A' });
		expect(res.status).toBe(201);
	});

	it('POST 201: та сама назва допустима в іншого користувача', async () => {
		const other = await registerUser();
		expect((await other.post('/api/categories', { name: 'Кава', type: 'EXPENSE', color: '#C58A2E' })).status).toBe(201);
	});

	it.each([
		['порожня назва', { name: '' }, 'name'],
		['назва з 31 символу', { name: 'К'.repeat(31) }, 'name'],
		['колір поза палітрою', { color: '#FF0000' }, 'color'],
		['без типу', { type: undefined }, 'type'],
	])('POST 400: %s', async (_, overrides, field) => {
		const res = await user.post('/api/categories', { name: 'Нова', type: 'EXPENSE', color: '#1F7A5A', ...overrides });
		expect(res.status).toBe(400);
		expectError(res.body, 'VALIDATION_ERROR', field);
	});

	it('PATCH 200: перейменування і зміна кольору зберігають зв\'язок з операціями (FR-9)', async () => {
		const id = await user.categoryId('Розваги', 'EXPENSE');
		const tx = await user.createTransaction({ categoryId: id });
		const res = await user.patch(`/api/categories/${id}`, { name: 'Дозвілля', color: '#6B5CA5' });

		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({ name: 'Дозвілля', color: '#6B5CA5' });
		const list = await user.get('/api/transactions').query({ categoryId: id });
		expect(list.body.items.map((t: { id: string }) => t.id)).toContain(tx.id);
	});

	it('PATCH 409: перейменування на назву іншої категорії того ж типу', async () => {
		const id = await user.categoryId('Одяг', 'EXPENSE');
		expect((await user.patch(`/api/categories/${id}`, { name: 'Житло' })).status).toBe(409);
	});

	it('DELETE 204: операції категорії переходять у «Без категорії» (FR-10, US-5)', async () => {
		const id = await user.categoryId('Транспорт', 'EXPENSE');
		const created = await Promise.all(Array.from({ length: 12 }, () => user.createTransaction({ categoryId: id })));

		const before = (await user.categories('EXPENSE')).find((c) => c.id === id)!;
		expect(before.transactionCount).toBe(12);

		expect((await user.delete(`/api/categories/${id}`)).status).toBe(204);
		expect((await user.categories('EXPENSE')).map((c) => c.id)).not.toContain(id);

		const all = await user.get('/api/transactions').query({ limit: 100 });
		const moved = all.body.items.filter((t: { id: string }) => created.some((c) => c.id === t.id));
		expect(moved).toHaveLength(12);
		expect(moved.every((t: { categoryId: string | null }) => t.categoryId === null)).toBe(true);
	});

	it('DELETE 404: неіснуюча категорія', async () => {
		expect((await user.delete('/api/categories/00000000-0000-0000-0000-000000000000')).status).toBe(404);
	});
});
