import request from 'supertest';
import { anonymous, describeIfServer, registerUser, type ApiSession } from '../helpers/api';

describeIfServer('GET /api/health — FR-23, UC-14', () => {
	it('200 без автентифікації: стан застосунку, БД і версія', async () => {
		const res = await anonymous().get('/api/health');
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({ status: 'ok', db: 'ok', version: expect.any(String) });
		expect(typeof res.body.dbLatencyMs).toBe('number');
	});

	it('не розкриває секретів і рядка підключення до БД', async () => {
		const text = JSON.stringify((await anonymous().get('/api/health')).body);
		expect(text).not.toMatch(/postgres(ql)?:\/\/|password|secret/i);
	});
});

describeIfServer('Захист від ін\'єкцій і XSS — NFR-9', () => {
	let user: ApiSession;

	beforeAll(async () => {
		user = await registerUser();
	});

	it.each(["' OR 1=1 --", "'; DROP TABLE \"Transaction\"; --", '{"$gt": ""}'])(
		'SQL-подібний рядок у фільтрі (%s) не викликає 500 і не повертає чужих даних',
		async (payload) => {
			const res = await user.get('/api/transactions').query({ categoryId: payload, type: payload });
			expect(res.status).toBeLessThan(500);
			if (res.status === 200) expect(res.body.items).toEqual([]);
		},
	);

	it('SQL-ін\'єкція в email під час входу не дає доступу', async () => {
		const res = await anonymous().post('/api/auth/login').send({ email: "' OR '1'='1", password: "' OR '1'='1" });
		expect([400, 401]).toContain(res.status);
	});

	it('HTML у коментарі зберігається як текст і повертається як JSON-рядок, а не розмітка', async () => {
		const comment = '<img src=x onerror=alert(1)>';
		const tx = await user.createTransaction({ comment });
		expect(tx.comment).toBe(comment);

		const res = await user.get('/api/transactions');
		expect(res.headers['content-type']).toMatch(/application\/json/);
	});
});

describeIfServer('Обмеження спроб входу — NFR-8', () => {
	// Окрема «IP-адреса» через X-Forwarded-For, щоб блокування не зачепило інші тести.
	// На staging за проксі Vercel заголовок перезаписується — тоді тест варто запускати останнім.
	const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;

	it('11-та невдала спроба за 15 хвилин → 429; правильний пароль теж відхиляється', async () => {
		const user = await registerUser();
		for (let i = 0; i < 10; i++) {
			const res = await anonymous()
				.post('/api/auth/login')
				.set('X-Forwarded-For', ip)
				.send({ email: user.email, password: 'wrong-password' });
			expect(res.status).toBe(401);
		}
		const blocked = await anonymous()
			.post('/api/auth/login')
			.set('X-Forwarded-For', ip)
			.send({ email: user.email, password: user.password });
		expect(blocked.status).toBe(429);
		expect(blocked.body.error.message).toMatch(/[а-яії]/i);
	});
});

const httpsUrl = process.env.BASE_URL?.startsWith('https://') ? process.env.BASE_URL : undefined;

(httpsUrl ? describe : describe.skip)('HTTPS — NFR-5', () => {
	it('HTTP-запит перенаправляється на HTTPS', async () => {
		const res = await request(httpsUrl!.replace('https://', 'http://')).get('/').redirects(0);
		expect([301, 307, 308]).toContain(res.status);
		expect(res.headers.location).toMatch(/^https:\/\//);
	});
});
