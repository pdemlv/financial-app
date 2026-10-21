import {
	MAX_AMOUNT_KOPECKS,
	MINUS,
	NBSP,
	formatMoney,
	formatSigned,
	formatTransactionAmount,
	parseAmount,
} from '@/lib/format/money';

describe('parseAmount — введення суми в копійки (NFR-21)', () => {
	it.each([
		['1 240,50', 124050],
		['1240,50', 124050],
		['1240.50', 124050],
		['1240,5', 124050],
		['0,01', 1],
		['12 000', 1200000],
		[`12${NBSP}000,00 ₴`, 1200000],
		['  247 ', 24700],
	])('«%s» → %i коп.', (input, expected) => {
		expect(parseAmount(input)).toBe(expected);
	});

	it('не втрачає копійки на значеннях, які неточні у float (0,29; 1,15; 4,35)', () => {
		// 0.29 * 100 === 28.999999999999996 у JavaScript
		expect(parseAmount('0,29')).toBe(29);
		expect(parseAmount('1,15')).toBe(115);
		expect(parseAmount('4,35')).toBe(435);
	});

	it('зберігає знак від\'ємних чисел, щоб валідація показала «Сума має бути більшою за 0»', () => {
		expect(parseAmount('-5')).toBe(-500);
		expect(parseAmount(`${MINUS}200,00`)).toBe(-20000);
	});

	it.each(['', 'abc', '12,345', '1,2,3', '12.', ',50', '1e5', '١٢٣'])('«%s» → null', (input) => {
		expect(parseAmount(input)).toBeNull();
	});

	it('максимально допустима сума 1 000 000 000 ₴ парситься без втрати точності', () => {
		expect(parseAmount('1 000 000 000,00')).toBe(MAX_AMOUNT_KOPECKS);
		expect(Number.isSafeInteger(MAX_AMOUNT_KOPECKS)).toBe(true);
	});
});

describe('formatMoney — відображення сум (NFR-20)', () => {
	it('відокремлює розряди нерозривним пробілом і використовує кому', () => {
		expect(formatMoney(124050)).toBe(`1${NBSP}240,50${NBSP}₴`);
		expect(formatMoney(100000000000)).toBe(`1${NBSP}000${NBSP}000${NBSP}000,00${NBSP}₴`);
	});

	it('завжди показує дві цифри копійок', () => {
		expect(formatMoney(0)).toBe(`0,00${NBSP}₴`);
		expect(formatMoney(5)).toBe(`0,05${NBSP}₴`);
		expect(formatMoney(24700)).toBe(`247,00${NBSP}₴`);
	});

	it('не ставить розділювач перед числами до 1000', () => {
		expect(formatMoney(99999)).toBe(`999,99${NBSP}₴`);
	});

	it('форматує модуль числа (знак додають окремі функції)', () => {
		expect(formatMoney(-124050)).toBe(formatMoney(124050));
	});
});

describe('formatTransactionAmount — знак за типом операції (NFR-24)', () => {
	it('дохід зі знаком «+»', () => {
		expect(formatTransactionAmount(1200000, 'INCOME')).toBe(`+12${NBSP}000,00${NBSP}₴`);
	});

	it('витрата з типографським мінусом «−»', () => {
		expect(formatTransactionAmount(124050, 'EXPENSE')).toBe(`${MINUS}1${NBSP}240,50${NBSP}₴`);
	});
});

describe('formatSigned — баланс і різниця', () => {
	it('від\'ємний баланс позначається знаком «−» (US-12)', () => {
		expect(formatSigned(-5000)).toBe(`${MINUS}50,00${NBSP}₴`);
	});

	it('додатний — без знака за замовчуванням і з «+» на вимогу', () => {
		expect(formatSigned(1355975)).toBe(`13${NBSP}559,75${NBSP}₴`);
		expect(formatSigned(1355975, { plusSign: true })).toBe(`+13${NBSP}559,75${NBSP}₴`);
	});

	it('нуль ніколи не має знака', () => {
		expect(formatSigned(0, { plusSign: true })).toBe(`0,00${NBSP}₴`);
	});
});
