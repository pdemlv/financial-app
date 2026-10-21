import { registerUser } from '../helpers/api';
import { db, describeIfDb, disconnectDb, userByEmail } from '../helpers/db';

afterAll(disconnectDb);

describeIfDb('Категорії: обмеження цілісності — FR-8…FR-10', () => {
	it('видалення категорії: операції лишаються з categoryId = NULL (ON DELETE SET NULL)', async () => {
		const session = await registerUser();
		const categoryId = await session.categoryId('Розваги', 'EXPENSE');
		const created = await Promise.all(Array.from({ length: 5 }, () => session.createTransaction({ categoryId })));

		expect((await session.delete(`/api/categories/${categoryId}`)).status).toBe(204);

		const rows = await db().transaction.findMany({ where: { id: { in: created.map((t) => t.id) } } });
		expect(rows).toHaveLength(5);
		expect(rows.every((r) => r.categoryId === null)).toBe(true);
		expect(await db().category.findUnique({ where: { id: categoryId } })).toBeNull();
	});

	it('перейменування не змінює id категорії і зв\'язки операцій', async () => {
		const session = await registerUser();
		const categoryId = await session.categoryId('Одяг', 'EXPENSE');
		const tx = await session.createTransaction({ categoryId });

		await session.patch(`/api/categories/${categoryId}`, { name: 'Одяг і взуття' });

		const row = await db().transaction.findUniqueOrThrow({ where: { id: tx.id }, include: { category: true } });
		expect(row.categoryId).toBe(categoryId);
		expect(row.category?.name).toBe('Одяг і взуття');
	});

	it('перейменування стандартної категорії стосується лише одного користувача (US-4)', async () => {
		const [a, b] = await Promise.all([registerUser(), registerUser()]);
		const id = await a.categoryId('Житло', 'EXPENSE');
		await a.patch(`/api/categories/${id}`, { name: 'Оренда' });

		const userB = await userByEmail(b.email);
		expect(await db().category.count({ where: { userId: userB.id, name: 'Житло' } })).toBe(1);
		expect(await db().category.count({ where: { userId: userB.id, name: 'Оренда' } })).toBe(0);
	});

	it('унікальний індекс (userId, type, name) працює і в обхід API', async () => {
		const session = await registerUser();
		const user = await userByEmail(session.email);
		await expect(
			db().category.create({ data: { userId: user.id, name: 'Продукти', type: 'EXPENSE', color: '#1F7A5A' } }),
		).rejects.toThrow();
	});
});
