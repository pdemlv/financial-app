import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';
import type { TxType } from '../../lib/types';

/**
 * Контракт тестованості інтерфейсу (doc/test-plan.md, додаток В):
 *  - елементи керування шукаються за роллю і доступною назвою з design-spec.md («Додати операцію», «Сума»…);
 *  - числові значення, які не мають унікальної підписаної ролі, позначені data-testid:
 *    balance, summary-income, summary-expense, summary-diff, transaction-row, day-group, filter-total,
 *    expense-chart, timeline-chart.
 */

export const PASSWORD = 'Test-passw0rd';

export function uniqueEmail(tag = 'e2e'): string {
	return `${tag}+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

export function isoDaysAgo(days: number): string {
	const d = new Date();
	d.setDate(d.getDate() - days);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface Account {
	email: string;
	password: string;
}

/**
 * `account` — користувач, від імені якого працює тест; сторінка вже має його сесію.
 * На staging для кожного тесту реєструється новий користувач. На production (SMOKE_EMAIL/SMOKE_PASSWORD)
 * використовується службовий акаунт, щоб не засмічувати базу: тести перевіряють відносні зміни балансу
 * і прибирають створені операції за маркером у коментарі.
 */
export const test = base.extend<{ account: Account; marker: string }>({
	account: async ({ page }, use) => {
		if (process.env.SMOKE_EMAIL && process.env.SMOKE_PASSWORD) {
			const account = { email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD };
			const res = await page.request.post('/api/auth/login', { data: account });
			expect(res.status()).toBe(200);
			await use(account);
			return;
		}
		const account = { email: uniqueEmail(), password: PASSWORD };
		const res = await page.request.post('/api/auth/register', { data: account });
		expect(res.status(), 'реєстрація тестового користувача').toBe(201);
		await use(account);
	},
	marker: async ({ page }, use) => {
		const marker = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
		await use(marker);
		await deleteTransactionsByMarker(page.request, marker);
	},
});

export { expect };

export const isProductionRun = () => !!process.env.SMOKE_EMAIL;

// --- Робота через API для підготовки даних (швидше і стабільніше, ніж через форму) ---

export async function categoryId(api: APIRequestContext, name: string, type: TxType): Promise<string> {
	const res = await api.get('/api/categories', { params: { type } });
	const found = (await res.json()).items.find((c: { name: string }) => c.name === name);
	if (!found) throw new Error(`Категорію «${name}» не знайдено`);
	return found.id;
}

export async function seedTransaction(
	api: APIRequestContext,
	data: { type?: TxType; amount: number; category?: string; occurredAt?: string; comment?: string },
) {
	const type = data.type ?? 'EXPENSE';
	const res = await api.post('/api/transactions', {
		data: {
			type,
			amount: data.amount,
			categoryId: await categoryId(api, data.category ?? (type === 'EXPENSE' ? 'Продукти' : 'Зарплата'), type),
			occurredAt: data.occurredAt ?? isoDaysAgo(0),
			comment: data.comment,
		},
	});
	expect(res.status()).toBe(201);
	return res.json();
}

export async function apiBalance(api: APIRequestContext): Promise<number> {
	return (await (await api.get('/api/analytics/summary')).json()).balance;
}

async function deleteTransactionsByMarker(api: APIRequestContext, marker: string) {
	let cursor: string | null = null;
	const ids: string[] = [];
	do {
		const res = await api.get('/api/transactions', { params: cursor ? { cursor, limit: 100 } : { limit: 100 } });
		if (!res.ok()) return;
		const body = await res.json();
		ids.push(...body.items.filter((t: { comment?: string }) => t.comment?.includes(marker)).map((t: { id: string }) => t.id));
		cursor = body.nextCursor;
	} while (cursor);
	await Promise.all(ids.map((id) => api.delete(`/api/transactions/${id}`)));
}

// --- Дії в інтерфейсі ---

export async function openAddTransaction(page: Page) {
	await page.getByRole('button', { name: /Додати операцію/ }).first().click();
	const dialog = page.getByRole('dialog', { name: /операці/i });
	await expect(dialog).toBeVisible();
	return dialog;
}

export async function fillTransactionForm(
	page: Page,
	data: { type?: 'Витрата' | 'Дохід'; amount: string; category?: string; date?: string; comment?: string },
) {
	const dialog = page.getByRole('dialog');
	if (data.type) await dialog.getByRole('button', { name: data.type, exact: true }).click();
	await dialog.getByLabel('Сума').fill(data.amount);
	if (data.category) await dialog.getByLabel('Категорія').selectOption({ label: data.category });
	if (data.date) await dialog.getByLabel('Дата').fill(data.date);
	if (data.comment !== undefined) await dialog.getByLabel('Коментар').fill(data.comment);
	return dialog;
}

export async function addTransaction(page: Page, data: Parameters<typeof fillTransactionForm>[1]) {
	await openAddTransaction(page);
	const dialog = await fillTransactionForm(page, data);
	await dialog.getByRole('button', { name: /Додати операцію|Зберегти/ }).click();
	await expect(page.getByText('Операцію додано')).toBeVisible();
	await expect(dialog).toBeHidden();
}

export async function navigate(page: Page, item: 'Головна' | 'Операції' | 'Категорії' | 'Аналітика') {
	await page.getByRole('navigation').getByRole('link', { name: item }).click();
}

/** Сторінка не прокручується горизонтально (NFR-14). */
export async function expectNoHorizontalScroll(page: Page) {
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	expect(overflow, 'горизонтальне переповнення, px').toBeLessThanOrEqual(0);
}
