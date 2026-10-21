import { expect, isoDaysAgo, openAddTransaction, seedTransaction, test } from './support';

test.describe('Категорії — FR-8…FR-10, US-5', () => {
	test.beforeEach(async ({ page, account }) => {
		expect(account).toBeTruthy();
		await page.goto('/categories');
	});

	test('нова категорія з\'являється у списку і у формі операції', async ({ page }) => {
		await page.getByRole('button', { name: /Нова категорія/ }).click();
		const dialog = page.getByRole('dialog');
		await dialog.getByLabel('Назва').fill('Кава');
		await dialog.getByRole('radio', { name: 'Витрата' }).check();
		await dialog.getByRole('radio', { name: /#C58A2E/i }).check();
		await dialog.getByRole('button', { name: 'Зберегти' }).click();

		await expect(page.getByText('Кава', { exact: true })).toBeVisible();
		const form = await openAddTransaction(page);
		await expect(form.getByLabel('Категорія').locator('option', { hasText: 'Кава' })).toHaveCount(1);
	});

	test('дубль назви в межах типу → помилка, категорія не дублюється', async ({ page }) => {
		await page.getByRole('button', { name: /Нова категорія/ }).click();
		const dialog = page.getByRole('dialog');
		await dialog.getByLabel('Назва').fill('Продукти');
		await dialog.getByRole('radio', { name: 'Витрата' }).check();
		await dialog.getByRole('button', { name: 'Зберегти' }).click();

		await expect(dialog.getByText('Категорія з такою назвою вже існує')).toBeVisible();
		await dialog.getByRole('button', { name: 'Скасувати' }).click();
		await expect(page.getByText('Продукти', { exact: true })).toHaveCount(1);
	});

	test('видалення категорії з 12 операціями попереджає і переносить їх у «Без категорії»', async ({ page }) => {
		for (let i = 0; i < 12; i++) await seedTransaction(page.request, { amount: 100, category: 'Розваги' });
		await page.reload();

		const item = page.getByRole('listitem').filter({ hasText: 'Розваги' });
		await expect(item).toContainText('12 операцій');
		await item.getByRole('button', { name: 'Змінити' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Видалити' }).click();

		const confirm = page.getByRole('alertdialog');
		await expect(confirm).toContainText('12');
		await confirm.getByRole('button', { name: 'Видалити' }).click();
		await expect(page.getByRole('listitem').filter({ hasText: 'Розваги' })).toHaveCount(0);

		await page.goto('/transactions');
		await expect(page.getByTestId('transaction-row').filter({ hasText: 'Без категорії' })).toHaveCount(12);
	});
});

test.describe('Аналітика — FR-20…FR-22, US-13, US-14', () => {
	test('кругова діаграма: суми, відсотки, сегмент «Інше» для часток < 3 %', async ({ page, account }) => {
		expect(account).toBeTruthy();
		await seedTransaction(page.request, { amount: 60000, category: 'Продукти' });
		await seedTransaction(page.request, { amount: 38500, category: 'Житло' });
		await seedTransaction(page.request, { amount: 1500, category: 'Одяг' }); // 1,5 %
		await page.goto('/analytics');

		const chart = page.getByTestId('expense-chart');
		await expect(chart).toContainText('Продукти');
		await expect(chart).toContainText('60 %');
		await expect(chart).toContainText('Інше');
		await expect(chart).not.toContainText('Одяг');
	});

	test('наведення на сегмент показує назву, суму і відсоток', async ({ page, account, isMobile }) => {
		test.skip(!!isMobile, 'на сенсорних екранах наведення немає');
		expect(account).toBeTruthy();
		await seedTransaction(page.request, { amount: 10000, category: 'Транспорт' });
		await page.goto('/analytics');

		await page.getByTestId('expense-chart').locator('path, [role="img"] *').first().hover();
		await expect(page.getByRole('tooltip')).toContainText(/Транспорт.*100,00.*100 %/);
	});

	test('діаграма має текстову таблицю значень для читачів екрана', async ({ page, account }) => {
		expect(account).toBeTruthy();
		await seedTransaction(page.request, { amount: 10000, category: 'Транспорт' });
		await page.goto('/analytics');
		await expect(page.getByRole('table').filter({ hasText: 'Транспорт' })).toHaveCount(1);
	});

	test('графік динаміки має три ряди: доходи, витрати, баланс', async ({ page, account }) => {
		expect(account).toBeTruthy();
		await seedTransaction(page.request, { type: 'INCOME', amount: 500000 });
		await seedTransaction(page.request, { amount: 100000, occurredAt: isoDaysAgo(40) });
		await page.goto('/analytics');

		const chart = page.getByTestId('timeline-chart');
		for (const legend of ['доходи', 'витрати', 'баланс']) await expect(chart).toContainText(new RegExp(legend, 'i'));
	});

	test('період без операцій → пояснення і кнопка додавання замість графіків (FR-22)', async ({ page, account }) => {
		expect(account).toBeTruthy();
		await page.goto('/analytics');
		await expect(page.getByTestId('expense-chart')).toHaveCount(0);
		await expect(page.getByRole('button', { name: /Додати/ }).first()).toBeVisible();
	});
});
