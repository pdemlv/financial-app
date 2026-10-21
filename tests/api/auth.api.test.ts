import {
	DEFAULT_PASSWORD,
	anonymous,
	cookieHeader,
	describeIfServer,
	expectError,
	login,
	registerUser,
	uniqueEmail,
} from '../helpers/api';

describeIfServer('POST /api/auth/register — FR-1', () => {
	it('201: створює обліковий запис і одразу відкриває сесію', async () => {
		const email = uniqueEmail();
		const res = await anonymous().post('/api/auth/register').send({ email, password: DEFAULT_PASSWORD });

		expect(res.status).toBe(201);
		expect(res.body).not.toHaveProperty('passwordHash');
		expect(res.body).not.toHaveProperty('password');
		expect(cookieHeader(res.headers['set-cookie'])).not.toBe('');

		const me = await anonymous().get('/api/categories').set('Cookie', cookieHeader(res.headers['set-cookie']));
		expect(me.status).toBe(200);
	});

	it('409: email уже зареєстрований, навіть в іншому регістрі', async () => {
		const email = uniqueEmail();
		await registerUser(email);
		const res = await anonymous().post('/api/auth/register').send({ email: email.toUpperCase(), password: DEFAULT_PASSWORD });

		expect(res.status).toBe(409);
		expect(res.body.error.message).toBe('Такий email уже зареєстрований');
	});

	it('400: пароль коротший за 8 символів', async () => {
		const res = await anonymous().post('/api/auth/register').send({ email: uniqueEmail(), password: '1234567' });
		expect(res.status).toBe(400);
		expectError(res.body, 'VALIDATION_ERROR', 'password');
	});

	it('400: некоректний email', async () => {
		const res = await anonymous().post('/api/auth/register').send({ email: 'not-an-email', password: DEFAULT_PASSWORD });
		expect(res.status).toBe(400);
		expectError(res.body, 'VALIDATION_ERROR', 'email');
	});

	it('400: порожнє тіло запиту не призводить до 500', async () => {
		const res = await anonymous().post('/api/auth/register').send({});
		expect(res.status).toBe(400);
	});
});

describeIfServer('POST /api/auth/login — FR-2', () => {
	let email: string;

	beforeAll(async () => {
		email = uniqueEmail();
		await registerUser(email);
	});

	it('200: правильні дані відкривають сесію', async () => {
		const res = await anonymous().post('/api/auth/login').send({ email, password: DEFAULT_PASSWORD });
		expect(res.status).toBe(200);
		expect(res.headers['set-cookie']).toBeDefined();
	});

	it('200: email нечутливий до регістру', async () => {
		const res = await anonymous().post('/api/auth/login').send({ email: email.toUpperCase(), password: DEFAULT_PASSWORD });
		expect(res.status).toBe(200);
	});

	it('401: неправильний пароль і неіснуючий email дають однакову відповідь без уточнення поля', async () => {
		const wrongPassword = await anonymous().post('/api/auth/login').send({ email, password: 'wrong-password' });
		const wrongEmail = await anonymous()
			.post('/api/auth/login')
			.send({ email: uniqueEmail('nobody'), password: DEFAULT_PASSWORD });

		expect(wrongPassword.status).toBe(401);
		expect(wrongEmail.status).toBe(401);
		expect(wrongPassword.body).toEqual(wrongEmail.body);
		expect(wrongPassword.body.error.message).toBe('Неправильний email або пароль');
		expect(wrongPassword.body.error.field).toBeUndefined();
	});
});

describeIfServer('Сесійна cookie — NFR-7', () => {
	it('HttpOnly, SameSite і (на HTTPS) Secure', async () => {
		const email = uniqueEmail();
		const res = await anonymous().post('/api/auth/register').send({ email, password: DEFAULT_PASSWORD });
		const cookies: string[] = [res.headers['set-cookie']].flat();
		const session = cookies.find((c) => /httponly/i.test(c));

		expect(session).toBeDefined();
		expect(session).toMatch(/SameSite=(Lax|Strict)/i);
		if (process.env.BASE_URL!.startsWith('https://')) expect(session).toMatch(/;\s*Secure/i);
	});

	it('строк дії — 30 днів (Max-Age або Expires)', async () => {
		const res = await anonymous().post('/api/auth/register').send({ email: uniqueEmail(), password: DEFAULT_PASSWORD });
		const session = [res.headers['set-cookie']].flat().find((c: string) => /httponly/i.test(c)) as string;
		const maxAge = /Max-Age=(\d+)/i.exec(session)?.[1];
		const expires = /Expires=([^;]+)/i.exec(session)?.[1];
		const seconds = maxAge ? Number(maxAge) : (Date.parse(expires!) - Date.now()) / 1000;

		expect(seconds).toBeGreaterThan(29 * 24 * 3600);
		expect(seconds).toBeLessThanOrEqual(30 * 24 * 3600 + 60);
	});
});

describeIfServer('POST /api/auth/logout — FR-3', () => {
	it('204 і стара cookie більше не дає доступу', async () => {
		const session = await registerUser();
		const res = await session.post('/api/auth/logout');
		expect(res.status).toBe(204);

		const after = await session.get('/api/transactions');
		expect(after.status).toBe(401);
	});

	it('після виходу можна знову увійти тими самими даними', async () => {
		const first = await registerUser();
		await first.post('/api/auth/logout');
		const again = await login(first.email, first.password);
		expect((await again.get('/api/transactions')).status).toBe(200);
	});
});
