import { formatSigned } from '../../lib/format/money';
import {
	addTransaction,
	apiBalance,
	expect,
	isProductionRun,
	navigate,
	seedTransaction,
	test,
	uniqueEmail,
	PASSWORD,
} from './support';

/**
 * Smoke-набір базової працездатності: SMK-01…SMK-10 з doc/tests/smoke-tests.md.
 * Запускається після кожного деплою на staging і production (npm run test:smoke), триває < 3 хв.
 * Будь-яке падіння = деплой не приймається / виконується rollback.
 */
test.describe('Smoke @smoke', () => {
	test('SMK-01 Сайт доступний, сторінка входу відкривається по HTTPS', async ({ page, baseURL }) => {
		const response = await page.goto('/login');
		expect(response?.status()).toBe(200);
		await expect(page.getByRole('button', { name: 'Увійти' })).toBeVisible();
		if (baseURL?.startsWith('https://')) expect(page.url()).toMatch(/^https:\/\//);
	});

	test('SMK-02 Health-check: застосунок і база даних працюють', async ({ request }) => {
		const res = await request.get('/api/health');
		expect(res.status()).toBe(200);
		expect(await res.json()).toMatchObject({ status: 'ok', db: 'ok' });
	});

	test('SMK-03 Реєстрація нового користувача відкриває дашборд', async ({ page }) => {
		test.skip(isProductionRun(), 'на production нові акаунти не створюються');
		await page.goto('/register');
		await page.getByLabel('Email').fill(uniqueEmail('smoke'));
		await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
		await page.getByLabel('Повторіть пароль').fill(PASSWORD);
		await page.getByRole('button', { name: 'Створити акаунт' }).click();

		await expect(page).toHaveURL(/\/dashboard/);
		await expect(page.getByTestId('balance')).toHaveText(formatSigned(0));
	});

	test('SMK-04 Вихід і повторний вхід', async ({ page, account }) => {
		await page.goto('/dashboard');
		await page.getByRole('button', { name: 'Вийти' }).click();
		await expect(page).toHaveURL(/\/login/);

		await page.getByLabel('Email').fill(account.email);
		await page.getByLabel('Пароль').fill(account.password);
		await page.getByRole('button', { name: 'Увійти' }).click();
		await expect(page).toHaveURL(/\/dashboard/);
		await expect(page.getByTestId('balance')).toBeVisible();
	});

	test('SMK-05 Сторінки обліку недоступні без сесії', async ({ page }) => {
		await page.goto('/transactions');
		await expect(page).toHaveURL(/\/login/);
	});

	test('SMK-06 Додавання витрати зменшує баланс', async ({ page, account, marker }) => {
		const before = await apiBalance(page.request);
		await page.goto('/dashboard');
		await addTransaction(page, { amount: '1240,50', category: 'Продукти', comment: marker });

		await expect(page.getByTestId('balance')).toHaveText(formatSigned(before - 124050));
		await expect(page.getByTestId('transaction-row').filter({ hasText: marker })).toContainText('−1 240,50 ₴');
	});

	test('SMK-07 Додавання доходу збільшує баланс і підсумок місяця', async ({ page, account, marker }) => {
		const before = await apiBalance(page.request);
		await page.goto('/dashboard');
		await addTransaction(page, { type: 'Дохід', amount: '12000', category: 'Зарплата', comment: marker });

		await expect(page.getByTestId('balance')).toHaveText(formatSigned(before + 1200000));
		await expect(page.getByTestId('summary-income')).toBeVisible();
	});

	test('SMK-08 Редагування і видалення операції перераховують баланс', async ({ page, account, marker }) => {
		const before = await apiBalance(page.request);
		await seedTransaction(page.request, { amount: 10000, comment: marker });
		await page.goto('/transactions');

		const row = page.getByTestId('transaction-row').filter({ hasText: marker });
		await row.hover();
		await row.getByRole('button', { name: 'Змінити' }).click();
		await page.getByRole('dialog').getByLabel('Сума').fill('300');
		await page.getByRole('dialog').getByRole('button', { name: 'Зберегти зміни' }).click();
		await expect(row).toContainText('−300,00 ₴');

		await row.hover();
		await row.getByRole('button', { name: 'Видалити' }).click();
		await page.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click();
		await expect(row).toHaveCount(0);
		expect(await apiBalance(page.request)).toBe(before);
	});

	test('SMK-09 Список операцій і фільтр за типом', async ({ page, account, marker }) => {
		await seedTransaction(page.request, { type: 'INCOME', amount: 50000, comment: marker });
		await page.goto('/transactions');
		await expect(page.getByTestId('day-group').first()).toBeVisible();

		await page.getByLabel('Тип').selectOption({ label: 'Лише доходи' });
		await expect(page).toHaveURL(/type=INCOME/);
		await expect(page.getByTestId('transaction-row').filter({ hasText: marker })).toBeVisible();
		for (const amount of await page.getByTestId('transaction-row').allTextContents()) {
			expect(amount).toContain('+');
		}
	});

	test('SMK-10 Аналітика: кругова діаграма і графік динаміки відображаються', async ({ page, account, marker }) => {
		await seedTransaction(page.request, { amount: 20000, category: 'Транспорт', comment: marker });
		await page.goto('/analytics');

		await expect(page.getByTestId('expense-chart')).toBeVisible();
		await expect(page.getByTestId('expense-chart')).toContainText('Транспорт');
		await expect(page.getByTestId('timeline-chart')).toBeVisible();
		await navigate(page, 'Головна');
		await expect(page).toHaveURL(/\/dashboard/);
	});
});
