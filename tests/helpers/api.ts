import request from 'supertest';
import type { TxType } from '@/lib/types';

/**
 * Адреса розгорнутого застосунку (local / staging). Без неї API- та інтеграційні тести пропускаються,
 * щоб `npm test` лишався зеленим на машині без запущеного сервера.
 */
export const BASE_URL = process.env.BASE_URL?.replace(/\/$/, '');
export const describeIfServer = BASE_URL ? describe : describe.skip;

export const DEFAULT_PASSWORD = 'Test-passw0rd';

export function uniqueEmail(tag = 'qa'): string {
	return `${tag}+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

export function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

export function daysAgo(days: number): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - days);
	return d.toISOString().slice(0, 10);
}

/** Витягує пари name=value з Set-Cookie. Cookie передаються вручну, бо Secure-cookie не надсилається по http://localhost. */
export function cookieHeader(setCookie: string | string[] | undefined): string {
	const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
	return list.map((c) => c.split(';')[0]).join('; ');
}

/** Клієнт API від імені конкретного користувача (з його сесійною cookie). */
export class ApiSession {
	constructor(
		readonly cookie: string,
		readonly email: string,
		readonly password: string,
	) {}

	get(path: string) {
		return request(BASE_URL!).get(path).set('Cookie', this.cookie);
	}

	post(path: string, body?: object) {
		return request(BASE_URL!).post(path).set('Cookie', this.cookie).send(body ?? {});
	}

	patch(path: string, body: object) {
		return request(BASE_URL!).patch(path).set('Cookie', this.cookie).send(body);
	}

	delete(path: string) {
		return request(BASE_URL!).delete(path).set('Cookie', this.cookie);
	}

	async categories(type?: TxType): Promise<ApiCategory[]> {
		const res = await this.get('/api/categories').query(type ? { type } : {});
		expect(res.status).toBe(200);
		return res.body.items;
	}

	async categoryId(name: string, type: TxType): Promise<string> {
		const category = (await this.categories(type)).find((c) => c.name === name);
		if (!category) throw new Error(`Категорію «${name}» (${type}) не знайдено`);
		return category.id;
	}

	async createTransaction(data: Partial<TransactionPayload> & { categoryName?: string } = {}): Promise<ApiTransaction> {
		const type = data.type ?? 'EXPENSE';
		const categoryId =
			data.categoryId ?? (await this.categoryId(data.categoryName ?? (type === 'EXPENSE' ? 'Продукти' : 'Зарплата'), type));
		const res = await this.post('/api/transactions', {
			type,
			amount: data.amount ?? 10000,
			categoryId,
			occurredAt: data.occurredAt ?? todayIso(),
			comment: data.comment,
		});
		if (res.status !== 201) throw new Error(`POST /api/transactions → ${res.status}: ${JSON.stringify(res.body)}`);
		return res.body;
	}
}

/** Реєструє нового користувача і повертає його сесію (FR-1: після реєстрації користувач уже увійшов). */
export async function registerUser(email = uniqueEmail(), password = DEFAULT_PASSWORD): Promise<ApiSession> {
	const res = await request(BASE_URL!).post('/api/auth/register').send({ email, password });
	if (res.status !== 201) throw new Error(`Реєстрація ${email} → ${res.status}: ${JSON.stringify(res.body)}`);
	return new ApiSession(cookieHeader(res.headers['set-cookie']), email, password);
}

export async function login(email: string, password: string): Promise<ApiSession> {
	const res = await request(BASE_URL!).post('/api/auth/login').send({ email, password });
	if (res.status !== 200) throw new Error(`Вхід ${email} → ${res.status}`);
	return new ApiSession(cookieHeader(res.headers['set-cookie']), email, password);
}

export const anonymous = () => request(BASE_URL!);

/** Очікуваний формат помилки з architecture.md, розділ 5. */
export function expectError(body: unknown, code: string, field?: string) {
	expect(body).toMatchObject({ error: { code, message: expect.any(String) } });
	if (field) expect((body as { error: { field: string } }).error.field).toBe(field);
}

// --- Контракт відповідей API, на який спираються тести (див. doc/test-plan.md, додаток Б) ---

export interface TransactionPayload {
	type: TxType;
	amount: number;
	categoryId: string;
	occurredAt: string;
	comment?: string;
}

export interface ApiTransaction extends TransactionPayload {
	id: string;
	categoryId: string;
	createdAt: string;
	updatedAt: string;
}

export interface ApiCategory {
	id: string;
	name: string;
	type: TxType;
	color: string;
	isDefault: boolean;
	transactionCount: number;
}
