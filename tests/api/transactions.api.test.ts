import { daysAgo, describeIfServer, expectError, registerUser, todayIso, type ApiSession } from '../helpers/api';

describeIfServer('POST /api/transactions — FR-11, FR-12', () => {
	let user: ApiSession;
	let foodId: string;
	let salaryId: string;

	beforeAll(async () => {
		user = await registerUser();
		foodId = await user.categoryId('Продукти', 'EXPENSE');
		salaryId = await user.categoryId('Зарплата', 'INCOME');
	});

	const body = (overrides: object = {}) => ({
		type: 'EXPENSE',
		amount: 124050,
		categoryId: foodId,
		occurredAt: todayIso(),
		comment: 'Сільпо, тижневі покупки',
		...overrides,
	});

	it('201: повертає збережену операцію з id і сумою в копійках', async () => {
		const res = await user.post('/api/transactions', body());
		expect(res.status).toBe(201);
		expect(res.body).toMatchObject({
			id: expect.any(String),
			type: 'EXPENSE',
			amount: 124050,
			categoryId: foodId,
			occurredAt: todayIso(),
			comment: 'Сільпо, тижневі покупки',
		});
	});

	it('201: дохід без коментаря', async () => {
		const res = await user.post('/api/transactions', body({ type: 'INCOME', categoryId: salaryId, comment: undefined }));
		expect(res.status).toBe(201);
	});

	it.each([
		['сума 0', () => ({ amount: 0 }), 'amount'],
		['від\'ємна сума', () => ({ amount: -100 }), 'amount'],
		['сума понад 1 000 000 000 ₴', () => ({ amount: 100_000_000_001 }), 'amount'],
		['дробові копійки', () => ({ amount: 10.5 }), 'amount'],
		['сума рядком', () => ({ amount: '100' }), 'amount'],
		['дата в майбутньому', () => ({ occurredAt: daysAgo(-2) }), 'occurredAt'],
		['неіснуюча дата', () => ({ occurredAt: '2026-02-30' }), 'occurredAt'],
		['без категорії', () => ({ categoryId: undefined }), 'categoryId'],
		['категорія доходу для витрати', () => ({ categoryId: salaryId }), 'categoryId'],
		['невідомий тип', () => ({ type: 'TRANSFER' }), 'type'],
		['коментар 201 символ', () => ({ comment: 'я'.repeat(201) }), 'comment'],
	])('400: %s', async (_, overrides, field) => {
		const res = await user.post('/api/transactions', body(overrides()));
		expect(res.status).toBe(400);
		expectError(res.body, 'VALIDATION_ERROR', field);
	});

	it('граничні значення приймаються: 1 коп., 1 000 000 000 ₴, коментар 200 символів, сьогоднішня дата', async () => {
		for (const overrides of [{ amount: 1 }, { amount: 100_000_000_000 }, { comment: 'я'.repeat(200) }]) {
			expect((await user.post('/api/transactions', body(overrides))).status).toBe(201);
		}
	});
});

describeIfServer('GET /api/transactions — FR-15, FR-16', () => {
	let user: ApiSession;
	let foodId: string;
	let transportId: string;

	beforeAll(async () => {
		user = await registerUser();
		foodId = await user.categoryId('Продукти', 'EXPENSE');
		transportId = await user.categoryId('Транспорт', 'EXPENSE');

		// 25 операцій за 25 різних днів + дохід і витрата в іншій категорії
		for (let i = 0; i < 25; i++) {
			await user.createTransaction({ amount: 100 + i, occurredAt: daysAgo(i), categoryId: foodId });
		}
		await user.createTransaction({ type: 'INCOME', amount: 500000, occurredAt: daysAgo(3) });
		await user.createTransaction({ amount: 24700, occurredAt: daysAgo(1), categoryId: transportId });
	});

	it('повертає порцію з 20 записів і курсор на наступну', async () => {
		const res = await user.get('/api/transactions');
		expect(res.status).toBe(200);
		expect(res.body.items).toHaveLength(20);
		expect(res.body.nextCursor).toEqual(expect.any(String));
	});

	it('сортує від новіших до старіших', async () => {
		const dates: string[] = (await user.get('/api/transactions')).body.items.map((t: { occurredAt: string }) => t.occurredAt);
		expect([...dates].sort().reverse()).toEqual(dates);
	});

	it('курсор віддає решту записів без пропусків і дублікатів', async () => {
		const first = await user.get('/api/transactions');
		const second = await user.get('/api/transactions').query({ cursor: first.body.nextCursor });
		const ids = [...first.body.items, ...second.body.items].map((t: { id: string }) => t.id);

		expect(second.body.items).toHaveLength(7);
		expect(second.body.nextCursor).toBeNull();
		expect(new Set(ids).size).toBe(27);
	});

	it('фільтр за типом', async () => {
		const res = await user.get('/api/transactions').query({ type: 'INCOME' });
		expect(res.body.items).toHaveLength(1);
		expect(res.body.items[0].type).toBe('INCOME');
	});

	it('фільтри комбінуються: період + тип + категорія', async () => {
		const res = await user
			.get('/api/transactions')
			.query({ from: daysAgo(4), to: daysAgo(1), type: 'EXPENSE', categoryId: foodId, limit: 100 });
		expect(res.body.items).toHaveLength(4);
		for (const tx of res.body.items) {
			expect(tx.categoryId).toBe(foodId);
			expect(tx.occurredAt >= daysAgo(4) && tx.occurredAt <= daysAgo(1)).toBe(true);
		}
	});

	it('межі періоду включні', async () => {
		const res = await user.get('/api/transactions').query({ from: daysAgo(2), to: daysAgo(2), categoryId: foodId });
		expect(res.body.items).toHaveLength(1);
	});

	it('комбінація без результатів → 200 і порожній список', async () => {
		const res = await user.get('/api/transactions').query({ type: 'INCOME', categoryId: transportId });
		expect(res.status).toBe(200);
		expect(res.body.items).toEqual([]);
	});

	it('некоректний період (from > to) → 400', async () => {
		const res = await user.get('/api/transactions').query({ from: daysAgo(1), to: daysAgo(5) });
		expect(res.status).toBe(400);
	});
});

describeIfServer('PATCH і DELETE /api/transactions/:id — FR-13, FR-14', () => {
	let user: ApiSession;

	beforeAll(async () => {
		user = await registerUser();
	});

	it('200: змінює суму, і баланс перераховується', async () => {
		const tx = await user.createTransaction({ amount: 10000 });
		const res = await user.patch(`/api/transactions/${tx.id}`, { amount: 25000 });

		expect(res.status).toBe(200);
		expect(res.body.amount).toBe(25000);
		expect((await user.get('/api/analytics/summary')).body.balance).toBe(-25000);
	});

	it('200: зміна типу разом із категорією відповідного типу', async () => {
		const tx = await user.createTransaction();
		const salaryId = await user.categoryId('Зарплата', 'INCOME');
		const res = await user.patch(`/api/transactions/${tx.id}`, { type: 'INCOME', categoryId: salaryId });
		expect(res.status).toBe(200);
		expect(res.body.type).toBe('INCOME');
	});

	it('400: зміна типу без зміни категорії порушує відповідність типів', async () => {
		const tx = await user.createTransaction();
		const res = await user.patch(`/api/transactions/${tx.id}`, { type: 'INCOME' });
		expect(res.status).toBe(400);
		expectError(res.body, 'VALIDATION_ERROR', 'categoryId');
	});

	it('400: ті самі правила валідації, що й при створенні', async () => {
		const tx = await user.createTransaction();
		expect((await user.patch(`/api/transactions/${tx.id}`, { amount: 0 })).status).toBe(400);
		expect((await user.patch(`/api/transactions/${tx.id}`, { occurredAt: daysAgo(-2) })).status).toBe(400);
	});

	it('404: неіснуюча операція', async () => {
		const res = await user.patch('/api/transactions/00000000-0000-0000-0000-000000000000', { amount: 1 });
		expect(res.status).toBe(404);
	});

	it('204: видаляє операцію; повторне видалення → 404', async () => {
		const tx = await user.createTransaction();
		expect((await user.delete(`/api/transactions/${tx.id}`)).status).toBe(204);
		expect((await user.delete(`/api/transactions/${tx.id}`)).status).toBe(404);
	});
});
