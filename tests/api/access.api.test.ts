import { anonymous, describeIfServer, registerUser, type ApiSession } from '../helpers/api';

const PROTECTED: [method: 'get' | 'post' | 'patch' | 'delete', path: string][] = [
	['get', '/api/transactions'],
	['post', '/api/transactions'],
	['patch', '/api/transactions/00000000-0000-0000-0000-000000000000'],
	['delete', '/api/transactions/00000000-0000-0000-0000-000000000000'],
	['get', '/api/categories'],
	['post', '/api/categories'],
	['patch', '/api/categories/00000000-0000-0000-0000-000000000000'],
	['delete', '/api/categories/00000000-0000-0000-0000-000000000000'],
	['get', '/api/analytics/summary'],
	['get', '/api/analytics/by-category'],
	['get', '/api/analytics/timeline'],
];

describeIfServer('Доступ без сесії — FR-4', () => {
	it.each(PROTECTED)('%s %s → 401', async (method, path) => {
		const res = await anonymous()[method](path).send({});
		expect(res.status).toBe(401);
		expect(res.body.error.code).toBeDefined();
	});

	it('підроблена cookie → 401', async () => {
		const res = await anonymous().get('/api/transactions').set('Cookie', 'session=forged-token-value');
		expect(res.status).toBe(401);
	});
});

describeIfServer('Ізоляція даних між користувачами — NFR-6, AC9, US-15', () => {
	let alice: ApiSession;
	let bob: ApiSession;
	let aliceTxId: string;
	let aliceCategoryId: string;

	beforeAll(async () => {
		[alice, bob] = await Promise.all([registerUser(), registerUser()]);
		aliceTxId = (await alice.createTransaction({ amount: 777700, comment: 'Секретна покупка Аліси' })).id;
		aliceCategoryId = await alice.categoryId('Продукти', 'EXPENSE');
	});

	it('список операцій Боба не містить операцій Аліси', async () => {
		const res = await bob.get('/api/transactions');
		expect(res.status).toBe(200);
		expect(res.body.items.map((t: { id: string }) => t.id)).not.toContain(aliceTxId);
	});

	it('PATCH чужої операції → 403/404 і операція не змінюється', async () => {
		const res = await bob.patch(`/api/transactions/${aliceTxId}`, { amount: 1 });
		expect([403, 404]).toContain(res.status);
		expect(JSON.stringify(res.body)).not.toContain('Секретна покупка');

		const own = await alice.get('/api/transactions');
		expect(own.body.items.find((t: { id: string }) => t.id === aliceTxId).amount).toBe(777700);
	});

	it('DELETE чужої операції → 403/404 і операція залишається', async () => {
		const res = await bob.delete(`/api/transactions/${aliceTxId}`);
		expect([403, 404]).toContain(res.status);
		const own = await alice.get('/api/transactions');
		expect(own.body.items.map((t: { id: string }) => t.id)).toContain(aliceTxId);
	});

	it('не можна створити операцію в чужій категорії', async () => {
		const res = await bob.post('/api/transactions', {
			type: 'EXPENSE',
			amount: 100,
			categoryId: aliceCategoryId,
			occurredAt: new Date().toISOString().slice(0, 10),
		});
		expect([400, 403, 404]).toContain(res.status);
	});

	it('PATCH і DELETE чужої категорії → 403/404', async () => {
		expect([403, 404]).toContain((await bob.patch(`/api/categories/${aliceCategoryId}`, { name: 'Зламано' })).status);
		expect([403, 404]).toContain((await bob.delete(`/api/categories/${aliceCategoryId}`)).status);
		expect(await alice.categoryId('Продукти', 'EXPENSE')).toBe(aliceCategoryId);
	});

	it('фільтр categoryId чужої категорії не повертає чужих операцій', async () => {
		const res = await bob.get('/api/transactions').query({ categoryId: aliceCategoryId });
		expect(res.status === 200 ? res.body.items : []).toEqual([]);
	});

	it('аналітика Боба не враховує суми Аліси', async () => {
		const res = await bob.get('/api/analytics/summary');
		expect(res.body.balance).toBe(0);
	});
});
