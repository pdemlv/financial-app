import { expect, expectNoHorizontalScroll, openAddTransaction, seedTransaction, test } from './support';

const PAGES = ['/dashboard', '/transactions', '/categories', '/analytics'];

test.describe('Адаптивність — NFR-14, AC10, US-16', () => {
	for (const width of [360, 768, 1024, 1440]) {
		test(`ширина ${width} px: жодна сторінка не прокручується горизонтально`, async ({ page, account }) => {
			expect(account).toBeTruthy();
			await seedTransaction(page.request, { amount: 100_000_000_000, comment: 'Дуже довгий коментар '.repeat(9) });
			await page.setViewportSize({ width, height: 800 });
			for (const path of ['/login', ...PAGES]) {
				await page.goto(path);
				await expectNoHorizontalScroll(page);
			}
		});
	}

	test('на мобільному: нижня панель навігації з 4 пунктами і кнопкою додавання завжди на видноті', async ({ page, account }) => {
		expect(account).toBeTruthy();
		await page.setViewportSize({ width: 360, height: 740 });
		for (const path of PAGES) {
			await page.goto(path);
			const nav = page.getByRole('navigation');
			await expect(nav.getByRole('link')).toHaveCount(4);
			const add = page.getByRole('button', { name: /Додати операцію/ }).first();
			await expect(add).toBeInViewport();
		}
	});

	test('на мобільному модальне вікно відкривається панеллю на всю ширину', async ({ page, account }) => {
		expect(account).toBeTruthy();
		await page.setViewportSize({ width: 360, height: 740 });
		await page.goto('/dashboard');
		const dialog = await openAddTransaction(page);
		const box = await dialog.boundingBox();
		expect(box!.width).toBeGreaterThanOrEqual(359);
	});

	test('інтерактивні елементи на мобільному — не менше 44×44 px', async ({ page, account }) => {
		expect(account).toBeTruthy();
		await page.setViewportSize({ width: 360, height: 740 });
		await page.goto('/dashboard');
		const small = await page.$$eval('button, a, input, select', (els) =>
			els
				.filter((el) => (el as HTMLElement).offsetParent !== null)
				.map((el) => ({ text: el.textContent?.trim() || el.getAttribute('aria-label'), rect: el.getBoundingClientRect() }))
				.filter(({ rect }) => rect.width < 44 || rect.height < 44)
				.map(({ text, rect }) => `${text} ${Math.round(rect.width)}×${Math.round(rect.height)}`),
		);
		expect(small).toEqual([]);
	});
});

test.describe('Клавіатура і фокус — NFR-23', () => {
	test('«Додати операцію» досяжна з Tab, Enter відкриває форму, Esc закриває', async ({ page, account }) => {
		expect(account).toBeTruthy();
		await page.goto('/dashboard');
		const add = page.getByRole('button', { name: /Додати операцію/ }).first();

		for (let i = 0; i < 30 && !(await add.evaluate((el) => el === document.activeElement)); i++) {
			await page.keyboard.press('Tab');
		}
		await expect(add).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('dialog')).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).toBeHidden();
		await expect(add).toBeFocused();
	});

	test('фокус замкнений усередині модального вікна', async ({ page, account }) => {
		expect(account).toBeTruthy();
		await page.goto('/dashboard');
		const dialog = await openAddTransaction(page);
		for (let i = 0; i < 15; i++) {
			await page.keyboard.press('Tab');
			expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
		}
	});

	test('активний елемент має видиму обвідку фокуса', async ({ page }) => {
		await page.goto('/login');
		await page.keyboard.press('Tab');
		const outline = await page.evaluate(() => {
			const style = getComputedStyle(document.activeElement as Element);
			return { width: parseFloat(style.outlineWidth), style: style.outlineStyle, shadow: style.boxShadow };
		});
		expect(outline.width >= 2 || outline.shadow !== 'none').toBe(true);
	});
});

test.describe('Локалізація і подання — NFR-19, NFR-20, NFR-24', () => {
	test('мова документа — українська', async ({ page }) => {
		await page.goto('/login');
		await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
	});

	test('тип операції дублюється знаком, а не лише кольором; дати у форматі ДД.ММ.РРРР або «6 жовтня»', async ({
		page,
		account,
	}) => {
		expect(account).toBeTruthy();
		await seedTransaction(page.request, { type: 'INCOME', amount: 1200000 });
		await seedTransaction(page.request, { amount: 124050 });
		await page.goto('/transactions');

		const rows = page.getByTestId('transaction-row');
		await expect(rows.filter({ hasText: '+12 000,00 ₴' })).toHaveCount(1);
		await expect(rows.filter({ hasText: '−1 240,50 ₴' })).toHaveCount(1);
		await expect(page.getByTestId('day-group').first()).toContainText(
			/\d{1,2} (січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)/,
		);
	});

	test('при prefers-reduced-motion анімації вимкнені', async ({ page, account }) => {
		expect(account).toBeTruthy();
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/dashboard');
		const dialog = await openAddTransaction(page);
		const duration = await dialog.evaluate((el) => getComputedStyle(el).transitionDuration);
		expect(duration.split(',').every((d) => parseFloat(d) === 0)).toBe(true);
	});
});

test.describe('Продуктивність сторінок — NFR-1, AC11', () => {
	test('дашборд на акаунті з 1000 операцій завантажується менше ніж за 2 с', async ({ page, account }) => {
		test.skip(!process.env.RUN_PERF, 'повільна підготовка даних; вмикається RUN_PERF=1');
		test.setTimeout(10 * 60 * 1000);
		expect(account).toBeTruthy();
		for (let batch = 0; batch < 100; batch++) {
			await Promise.all(Array.from({ length: 10 }, (_, i) => seedTransaction(page.request, { amount: 100 + batch * 10 + i })));
		}

		for (const path of PAGES) {
			await page.goto(path, { waitUntil: 'load' });
			const loadMs = await page.evaluate(() => {
				const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
				return nav.loadEventEnd - nav.startTime;
			});
			expect(loadMs, `${path}: час завантаження`).toBeLessThan(2000);
		}
	});
});
