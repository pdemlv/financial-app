import type { TxType } from '../types';

/** NFR-20: розряди відокремлюються нерозривним пробілом. */
export const NBSP = ' ';
/** Типографський мінус, як у макетах: −1 240,50 ₴. */
export const MINUS = '−';
export const CURRENCY = '₴';

/** FR-12: сума не більша за 1 000 000 000 ₴ (у копійках). */
export const MAX_AMOUNT_KOPECKS = 1_000_000_000 * 100;

/**
 * Перетворює введений користувачем рядок на ціле число копійок (NFR-21).
 * Приймає «1 240,50», «1240.5», «−200», «12 000 ₴». Більше двох знаків після коми — помилка.
 * Повертає null, якщо рядок не є числом. Знак зберігається: перевірку «> 0» виконує валідація.
 */
export function parseAmount(input: string): number | null {
	const cleaned = input.replace(/[\s  ₴]/g, '').replace(MINUS, '-');
	const match = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/.exec(cleaned);
	if (!match) return null;

	const [, sign, whole, fraction = ''] = match;
	const kopecks = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
	if (!Number.isSafeInteger(kopecks)) return null;
	return sign ? -kopecks : kopecks;
}

function groupDigits(digits: string): string {
	return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** Форматує модуль суми: 124050 → «1 240,50 ₴». Округлення до копійки — лише тут (NFR-21). */
export function formatMoney(kopecks: number): string {
	const abs = Math.abs(Math.round(kopecks));
	const whole = Math.floor(abs / 100).toString();
	const fraction = (abs % 100).toString().padStart(2, '0');
	return `${groupDigits(whole)},${fraction}${NBSP}${CURRENCY}`;
}

/** Сума операції зі знаком за типом: дохід «+12 000,00 ₴», витрата «−1 240,50 ₴» (NFR-24). */
export function formatTransactionAmount(kopecks: number, type: TxType): string {
	return `${type === 'INCOME' ? '+' : MINUS}${formatMoney(kopecks)}`;
}

/** Баланс або різниця: від'ємне значення зі знаком «−», додатне — без знака або з «+» за потреби. */
export function formatSigned(kopecks: number, options: { plusSign?: boolean } = {}): string {
	if (kopecks < 0) return `${MINUS}${formatMoney(kopecks)}`;
	if (kopecks > 0 && options.plusSign) return `+${formatMoney(kopecks)}`;
	return formatMoney(kopecks);
}
