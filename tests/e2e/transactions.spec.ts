import { formatSigned } from '../../lib/format/money';
import {
	addTransaction,
	expect,
	fillTransactionForm,
	isoDaysAgo,
	openAddTransaction,
	seedTransaction,
	test,
} from './support';

test.describe('Додавання операції — FR-11, FR-12, US-6, US-7', () => {
	test.beforeEach(async ({ page, account }) => {
		expect(account).toBeTruthy();
		await page.goto('/dashboard');
	});

	test('форма відкривається з типом «Витрата», сьогоднішньою датою і фокусом у полі суми', async ({ page }) => {
		const dialog = await openAddTransaction(page);
		await expect(dialog.getByRole('button', { name: 'Витрата', exact: true })).toHaveAttribute('aria-pressed', 'true');
		await expect(dialog.getByLabel('Дата')).toHaveValue(isoDaysAgo(0));
		await expect(dialog.getByLabel('Сума')).toBeFocused();
	});

	test('сума «1 240,50» зберігається без втрати копійок і відображається як −1 240,50 ₴', async ({ page }) => {
		await addTransaction(page, { amount: '1 240,50', category: 'Продукти', comment: 'Сільпо' });
		await expect(page.getByTestId('balance')).toHaveText(formatSigned(-124050));
		await expect(page.getByTestId('transaction-row').first()).toContainText('−1 240,50 ₴');
	});

	test('для типу «Дохід» список категорій містить лише категорії доходів', async ({ page }) => {
		const dialog = await openAddTransaction(page);
		await dialog.getByRole('button', { name: 'Дохід', exact: true }).click();
		const options = await dialog.getByLabel('Категорія').locator('option').allTextContents();
		expect(options).toEqual(expect.arrayContaining(['Зарплата', 'Підробіток', 'Подарунок']));
		expect(options).not.toContain('Продукти');
	});

	test('сума 0 → «Сума має бути більшою за 0», операція не зберігається', async ({ page }) => {
		await openAddTransaction(page);
		const dialog = await fillTransactionForm(page, { amount: '0', category: 'Продукти' });
		await dialog.getByRole('button', { name: 'Додати операцію' }).click();

		await expect(dialog.getByText('Сума має бути більшою за 0')).toBeVisible();
		await expect(dialog.getByLabel('Сума')).toHaveAttribute('aria-invalid', 'true');
		await expect(dialog).toBeVisible();
	});

	test('дата в майбутньому → «Дата не може бути в майбутньому»', async ({ page }) => {
		await openAddTransaction(page);
		const dialog = await fillTransactionForm(page, { amount: '100', category: 'Продукти', date: isoDaysAgo(-1) });
		await dialog.getByRole('button', { name: 'Додати операцію' }).click();
		await expect(dialog.getByText('Дата не може бути в майбутньому')).toBeVisible();
	});

	test('«Скасувати» закриває форму без збереження', async ({ page }) => {
		await openAddTransaction(page);
		const dialog = await fillTransactionForm(page, { amount: '500', category: 'Продукти' });
		await dialog.getByRole('button', { name: 'Скасувати' }).click();
		await expect(dialog).toBeHidden();
		await expect(page.getByTestId('balance')).toHaveText(formatSigned(0));
	});

	test('HTML у коментарі відображається як текст (NFR-9)', async ({ page }) => {
		let alerted = false;
		page.on('dialog', async (d) => {
			alerted = true;
			await d.dismiss();
		});
		await addTransaction(page, { amount: '1', category: 'Продукти', comment: '<img src=x onerror=alert(1)>' });
		await expect(page.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
		expect(alerted).toBe(false);
	});
});

test.describe('Редагування і видалення — FR-13, FR-14, US-8, US-9', () => {
	test.beforeEach(async ({ page, account }) => {
		expect(account).toBeTruthy();
		await seedTransaction(page.request, { amount: 10000, comment: 'Редагована операція' });
		await page.goto('/transactions');
	});

	const row = (page: import('@playwright/test').Page) =>
		page.getByTestId('transaction-row').filter({ hasText: 'Редагована операція' });

	test('зміна суми перераховує баланс без перезавантаження сторінки', async ({ page }) => {
		let reloaded = false;
		page.on('framenavigated', () => (reloaded = true));

		await row(page).hover();
		await row(page).getByRole('button', { name: 'Змінити' }).click();
		await page.getByRole('dialog').getByLabel('Сума').fill('250');
		await page.getByRole('dialog').getByRole('button', { name: 'Зберегти зміни' }).click();

		await expect(row(page)).toContainText('−250,00 ₴');
		await expect(page.getByTestId('filter-total')).toContainText('250,00');
		expect(reloaded).toBe(false);
	});

	test('скасування редагування лишає операцію без змін', async ({ page }) => {
		await row(page).hover();
		await row(page).getByRole('button', { name: 'Змінити' }).click();
		await page.getByRole('dialog').getByLabel('Сума').fill('999');
		await page.getByRole('dialog').getByRole('button', { name: 'Скасувати' }).click();
		await expect(row(page)).toContainText('−100,00 ₴');
	});

	test('видалення потребує підтвердження; «Скасувати» лишає операцію', async ({ page }) => {
		await row(page).hover();
		await row(page).getByRole('button', { name: 'Видалити' }).click();
		const confirm = page.getByRole('alertdialog');
		await expect(confirm).toBeVisible();
		await confirm.getByRole('button', { name: 'Скасувати' }).click();
		await expect(row(page)).toHaveCount(1);

		await row(page).hover();
		await row(page).getByRole('button', { name: 'Видалити' }).click();
		await page.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click();
		await expect(row(page)).toHaveCount(0);
		await expect(page.getByText('Операцію видалено')).toBeVisible();
	});
});

test.describe('Список і фільтри — FR-15, FR-16, US-10, US-11', () => {
	test('порожній список показує запрошення «Додати першу операцію»', async ({ page, account }) => {
		expect(account).toBeTruthy();
		await page.goto('/transactions');
		await expect(page.getByRole('button', { name: /Додати першу операцію/ })).toBeVisible();
	});

	test('перші 20 записів, групування за днями, новіші зверху; підвантаження при прокручуванні', async ({ page, account }) => {
		expect(account).toBeTruthy();
		for (let i = 0; i < 25; i++) {
			await seedTransaction(page.request, { amount: 100 + i, occurredAt: isoDaysAgo(i), comment: `#${i}` });
		}
		await page.goto('/transactions');

		await expect(page.getByTestId('transaction-row')).toHaveCount(20);
		await expect(page.getByTestId('day-group').first()).toContainText('#0');

		await page.getByTestId('transaction-row').last().scrollIntoViewIfNeeded();
		await page.mouse.wheel(0, 5000);
		await expect(page.getByTestId('transaction-row')).toHaveCount(25);
		await expect(page.getByTestId('day-group').last()).toContainText('#24');
	});

	test('фільтри «Поточний місяць» + категорія показують лише відповідні операції і їх суму; зберігаються в адресі', async ({
		page,
		account,
	}) => {
		expect(account).toBeTruthy();
		await seedTransaction(page.request, { amount: 84500, category: 'Продукти', comment: 'АТБ' });
		await seedTransaction(page.request, { amount: 24700, category: 'Транспорт', comment: 'Проїзний' });
		await page.goto('/transactions');

		await page.getByLabel('Період').selectOption({ label: 'Поточний місяць' });
		await page.getByLabel('Категорія').selectOption({ label: 'Продукти' });

		await expect(page.getByTestId('transaction-row')).toHaveCount(1);
		await expect(page.getByTestId('filter-total')).toContainText('845,00 ₴');

		await page.reload();
		await expect(page.getByLabel('Категорія')).toHaveValue(/.+/);
		await expect(page.getByTestId('transaction-row')).toHaveCount(1);
	});

	test('комбінація без результатів → «За цими умовами операцій немає» і скидання фільтрів', async ({ page, account }) => {
		expect(account).toBeTruthy();
		await seedTransaction(page.request, { amount: 1000, category: 'Продукти' });
		await page.goto('/transactions');

		await page.getByLabel('Тип').selectOption({ label: 'Лише доходи' });
		await page.getByLabel('Категорія').selectOption({ label: 'Зарплата' });
		await expect(page.getByText('За цими умовами операцій немає')).toBeVisible();

		await page.getByRole('button', { name: 'Скинути фільтри' }).click();
		await expect(page.getByTestId('transaction-row')).toHaveCount(1);
	});
});
