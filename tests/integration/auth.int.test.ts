import { DEFAULT_PASSWORD, anonymous, registerUser, uniqueEmail } from '../helpers/api';
import { db, describeIfDb, disconnectDb, userByEmail } from '../helpers/db';

afterAll(disconnectDb);

describeIfDb('Реєстрація: стан БД — FR-1, FR-7, NFR-4', () => {
	it('пароль зберігається лише як bcrypt-хеш, відкритого тексту в БД немає', async () => {
		const session = await registerUser();
		const user = await userByEmail(session.email);

		expect(user.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/);
		expect(user.passwordHash).not.toContain(DEFAULT_PASSWORD);
		// cost factor не нижче 10 — інакше хеш швидко перебирається
		expect(Number(user.passwordHash.split('$')[2])).toBeGreaterThanOrEqual(10);
	});

	it('однакові паролі різних користувачів дають різні хеші (сіль)', async () => {
		const [a, b] = await Promise.all([registerUser(), registerUser()]);
		const [ua, ub] = await Promise.all([userByEmail(a.email), userByEmail(b.email)]);
		expect(ua.passwordHash).not.toBe(ub.passwordHash);
	});

	it('email зберігається в нижньому регістрі без пробілів', async () => {
		const raw = `  ${uniqueEmail('MixedCase').toUpperCase()} `;
		const res = await anonymous().post('/api/auth/register').send({ email: raw, password: DEFAULT_PASSWORD });
		expect(res.status).toBe(201);
		expect(await db().user.count({ where: { email: raw.trim().toLowerCase() } })).toBe(1);
	});

	it('створюється 11 стандартних категорій із позначкою isDefault, прив\'язаних до користувача', async () => {
		const session = await registerUser();
		const user = await userByEmail(session.email);
		const categories = await db().category.findMany({ where: { userId: user.id } });

		expect(categories).toHaveLength(11);
		expect(categories.filter((c) => c.type === 'EXPENSE')).toHaveLength(7);
		expect(categories.every((c) => c.isDefault)).toBe(true);
	});

	it('повторна реєстрація того ж email не створює другого запису і зайвих категорій', async () => {
		const session = await registerUser();
		const res = await anonymous().post('/api/auth/register').send({ email: session.email, password: 'another-pass' });
		const user = await userByEmail(session.email);

		expect(res.status).toBe(409);
		expect(await db().user.count({ where: { email: session.email } })).toBe(1);
		expect(await db().category.count({ where: { userId: user.id } })).toBe(11);
	});

	it('невдала валідація не залишає в БД напівстворених записів', async () => {
		const email = uniqueEmail('short');
		await anonymous().post('/api/auth/register').send({ email, password: '123' });
		expect(await db().user.count({ where: { email } })).toBe(0);
	});
});

describeIfDb('Видалення облікового запису: каскад — FR-6', () => {
	it('видалення користувача видаляє всі його категорії та операції, але не чужі', async () => {
		const [victim, bystander] = await Promise.all([registerUser(), registerUser()]);
		await victim.createTransaction();
		await bystander.createTransaction();
		const user = await userByEmail(victim.email);
		const other = await userByEmail(bystander.email);

		await db().user.delete({ where: { id: user.id } });

		expect(await db().category.count({ where: { userId: user.id } })).toBe(0);
		expect(await db().transaction.count({ where: { userId: user.id } })).toBe(0);
		expect(await db().transaction.count({ where: { userId: other.id } })).toBe(1);
	});
});
