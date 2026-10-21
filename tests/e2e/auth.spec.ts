import { test as base } from '@playwright/test';
import { PASSWORD, expect, test, uniqueEmail } from './support';

base.describe('Реєстрація — FR-1, UC-1', () => {
	base('пароль коротший за 8 символів підсвічується з поясненням', async ({ page }) => {
		await page.goto('/register');
		await page.getByLabel('Email').fill(uniqueEmail());
		await page.getByLabel('Пароль', { exact: true }).fill('1234567');
		await page.getByLabel('Повторіть пароль').fill('1234567');
		await page.getByRole('button', { name: 'Створити акаунт' }).click();

		const field = page.getByLabel('Пароль', { exact: true });
		await expect(field).toHaveAttribute('aria-invalid', 'true');
		await expect(page.getByText('Пароль має містити не менше 8 символів')).toBeVisible();
		await expect(page).toHaveURL(/\/register/);
	});

	base('паролі не збігаються', async ({ page }) => {
		await page.goto('/register');
		await page.getByLabel('Email').fill(uniqueEmail());
		await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
		await page.getByLabel('Повторіть пароль').fill(`${PASSWORD}x`);
		await page.getByRole('button', { name: 'Створити акаунт' }).click();
		await expect(page.getByText('Паролі не збігаються')).toBeVisible();
	});

	base('email уже зареєстрований → повідомлення, акаунт не створюється', async ({ page }) => {
		const email = uniqueEmail();
		await page.request.post('/api/auth/register', { data: { email, password: PASSWORD } });
		await page.context().clearCookies();

		await page.goto('/register');
		await page.getByLabel('Email').fill(email);
		await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
		await page.getByLabel('Повторіть пароль').fill(PASSWORD);
		await page.getByRole('button', { name: 'Створити акаунт' }).click();
		await expect(page.getByText('Такий email уже зареєстрований')).toBeVisible();
	});

	base('після реєстрації категорії вже готові (FR-7)', async ({ page }) => {
		await page.goto('/register');
		await page.getByLabel('Email').fill(uniqueEmail());
		await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
		await page.getByLabel('Повторіть пароль').fill(PASSWORD);
		await page.getByRole('button', { name: 'Створити акаунт' }).click();
		await page.goto('/categories');
		for (const name of ['Продукти', 'Житло', 'Транспорт', "Здоров'я", 'Розваги', 'Одяг', 'Зарплата', 'Підробіток', 'Подарунок']) {
			await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
		}
	});
});

base.describe('Вхід — FR-2, UC-2', () => {
	base('неправильний пароль → «Неправильний email або пароль», без підсвічування конкретного поля', async ({ page }) => {
		const email = uniqueEmail();
		await page.request.post('/api/auth/register', { data: { email, password: PASSWORD } });
		await page.context().clearCookies();

		await page.goto('/login');
		await page.getByLabel('Email').fill(email);
		await page.getByLabel('Пароль').fill('wrong-password');
		await page.getByRole('button', { name: 'Увійти' }).click();

		await expect(page.getByText('Неправильний email або пароль')).toBeVisible();
		await expect(page.getByLabel('Email')).not.toHaveAttribute('aria-invalid', 'true');
		await expect(page).toHaveURL(/\/login/);
	});

	base('сторінка входу має посилання на реєстрацію', async ({ page }) => {
		await page.goto('/login');
		await page.getByRole('link', { name: 'Зареєструватися' }).click();
		await expect(page).toHaveURL(/\/register/);
	});
});

base.describe('Обмеження доступу — FR-4', () => {
	for (const path of ['/dashboard', '/transactions', '/categories', '/analytics']) {
		base(`${path} без сесії перенаправляє на вхід`, async ({ page }) => {
			await page.goto(path);
			await expect(page).toHaveURL(/\/login/);
		});
	}
});

test.describe('Вихід — FR-3, US-3', () => {
	test('після виходу кнопка «Назад» не показує даних обліку', async ({ page, account }) => {
		await page.goto('/dashboard');
		await expect(page.getByTestId('balance')).toBeVisible();
		await page.getByRole('button', { name: 'Вийти' }).click();
		await expect(page).toHaveURL(/\/login/);

		await page.goBack();
		await page.reload();
		await expect(page).toHaveURL(/\/login/);
		await expect(page.getByTestId('balance')).toHaveCount(0);
		expect(account.email).toBeTruthy();
	});
});
