import { formatDate, formatDayHeading, isValidIsoDate, todayIso } from '@/lib/format/date';

describe('formatDate (NFR-20)', () => {
	it('виводить дату у форматі ДД.ММ.РРРР', () => {
		expect(formatDate('2026-10-06')).toBe('06.10.2026');
		expect(formatDate('2026-01-31')).toBe('31.01.2026');
	});
});

describe('formatDayHeading — заголовок групи дня', () => {
	it.each([
		['2026-10-05', '5 жовтня, понеділок'],
		['2026-10-04', '4 жовтня, неділя'],
		['2026-01-01', '1 січня, четвер'],
		['2028-02-29', '29 лютого, вівторок'],
	])('%s → «%s»', (iso, expected) => {
		expect(formatDayHeading(iso)).toBe(expected);
	});
});

describe('isValidIsoDate', () => {
	it.each(['2026-10-21', '2024-02-29', '2026-12-31'])('приймає %s', (value) => {
		expect(isValidIsoDate(value)).toBe(true);
	});

	it.each(['2026-02-30', '2025-02-29', '2026-13-01', '21.10.2026', '2026-1-1', '', null, 20261021])(
		'відхиляє %p',
		(value) => {
			expect(isValidIsoDate(value)).toBe(false);
		},
	);
});

describe('todayIso', () => {
	it('бере локальну дату, а не UTC (операція о 00:30 за Києвом — це вже новий день)', () => {
		expect(todayIso(new Date(2026, 9, 21, 0, 30))).toBe('2026-10-21');
		expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
	});
});
