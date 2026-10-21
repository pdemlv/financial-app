import type { IsoDate } from '../types';

const MONTHS_GENITIVE = [
	'січня',
	'лютого',
	'березня',
	'квітня',
	'травня',
	'червня',
	'липня',
	'серпня',
	'вересня',
	'жовтня',
	'листопада',
	'грудня',
];

const WEEKDAYS = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота'];

/** Перевіряє, що рядок — реальна календарна дата РРРР-ММ-ДД (2026-02-30 — ні). */
export function isValidIsoDate(value: unknown): value is IsoDate {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [y, m, d] = value.split('-').map(Number);
	const date = new Date(Date.UTC(y, m - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** NFR-20: 2026-10-06 → 06.10.2026. */
export function formatDate(iso: IsoDate): string {
	const [y, m, d] = iso.split('-');
	return `${d}.${m}.${y}`;
}

/** Заголовок групи дня в списку операцій: 2026-10-05 → «5 жовтня, понеділок». */
export function formatDayHeading(iso: IsoDate): string {
	const [y, m, d] = iso.split('-').map(Number);
	const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	return `${d} ${MONTHS_GENITIVE[m - 1]}, ${WEEKDAYS[weekday]}`;
}

/** Локальна дата «сьогодні» у форматі РРРР-ММ-ДД. */
export function todayIso(now: Date = new Date()): IsoDate {
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}
