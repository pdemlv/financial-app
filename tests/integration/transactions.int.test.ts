import { daysAgo, registerUser, todayIso, type ApiSession } from '../helpers/api';
import { db, describeIfDb, disconnectDb, userByEmail } from '../helpers/db';

afterAll(disconnectDb);

describeIfDb('Операції: API ↔ PostgreSQL — FR-11…FR-14, NFR-21', () => {
	let session: ApiSession;
	let userId: string;

	beforeAll(async () => {
		session = await registerUser();
		userId = (await userByEmail(session.email)).id;
	});

	it('POST зберігає суму в копійках цілим числом і прив\'язує запис до користувача із сесії', async () => {
		const tx = await session.createTransaction({ amount: 124050, comment: 'Сільпо' });
		const row = await db().transaction.findUniqueOrThrow({ where: { id: tx.id } });

		expect(row.amount).toBe(BigInt(124050));
		expect(row.userId).toBe(userId);
		expect(row.type).toBe('EXPENSE');
		expect(row.occurredAt.toISOString().slice(0, 10)).toBe(todayIso());
	});

	it('максимальна сума 1 000 000 000 ₴ зберігається без переповнення', async () => {
		const tx = await session.createTransaction({ amount: 100_000_000_000 });
		const row = await db().transaction.findUniqueOrThrow({ where: { id: tx.id } });
		expect(row.amount).toBe(BigInt(100_000_000_000));
	});

	it('userId у тілі запиту ігнорується — не можна записати операцію іншому користувачу', async () => {
		const other = await registerUser();
		const otherId = (await userByEmail(other.email)).id;
		const categoryId = await session.categoryId('Продукти', 'EXPENSE');

		const res = await session.post('/api/transactions', {
			type: 'EXPENSE',
			amount: 100,
			categoryId,
			occurredAt: todayIso(),
			userId: otherId,
		});
		expect(res.status).toBe(201);
		expect((await db().transaction.findUniqueOrThrow({ where: { id: res.body.id } })).userId).toBe(userId);
		expect(await db().transaction.count({ where: { userId: otherId } })).toBe(0);
	});

	it('некоректна операція не потрапляє в БД (запит до бази не виконується)', async () => {
		const before = await db().transaction.count({ where: { userId } });
		const categoryId = await session.categoryId('Продукти', 'EXPENSE');
		await session.post('/api/transactions', { type: 'EXPENSE', amount: 0, categoryId, occurredAt: todayIso() });
		await session.post('/api/transactions', { type: 'EXPENSE', amount: 100, categoryId, occurredAt: daysAgo(-2) });
		expect(await db().transaction.count({ where: { userId } })).toBe(before);
	});

	it('CHECK amount > 0 існує на рівні БД, а не лише в коді', async () => {
		const categoryId = await session.categoryId('Продукти', 'EXPENSE');
		await expect(
			db().transaction.create({
				data: { userId, categoryId, type: 'EXPENSE', amount: BigInt(-1), occurredAt: new Date() },
			}),
		).rejects.toThrow();
	});

	it('PATCH оновлює поля і updatedAt; createdAt не змінюється', async () => {
		const tx = await session.createTransaction({ amount: 10000 });
		const before = await db().transaction.findUniqueOrThrow({ where: { id: tx.id } });
		await new Promise((r) => setTimeout(r, 20));
		await session.patch(`/api/transactions/${tx.id}`, { amount: 20000, comment: 'Виправлено' });
		const after = await db().transaction.findUniqueOrThrow({ where: { id: tx.id } });

		expect(after.amount).toBe(BigInt(20000));
		expect(after.comment).toBe('Виправлено');
		expect(after.createdAt).toEqual(before.createdAt);
		expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
	});

	it('DELETE фізично видаляє рядок', async () => {
		const tx = await session.createTransaction();
		await session.delete(`/api/transactions/${tx.id}`);
		expect(await db().transaction.findUnique({ where: { id: tx.id } })).toBeNull();
	});
});
