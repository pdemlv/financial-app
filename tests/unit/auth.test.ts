import { createLoginRateLimiter } from '@/lib/auth/rate-limit';
import { isValidEmail, normalizeEmail, validateRegistration } from '@/lib/validation/auth';

describe('validateRegistration — FR-1', () => {
	it('коректні email і пароль з 8 символів', () => {
		expect(validateRegistration({ email: 'anna@example.com', password: '12345678' })).toEqual([]);
	});

	it('пароль із 7 символів → підсвічується поле password (UC-1, 3b)', () => {
		expect(validateRegistration({ email: 'anna@example.com', password: '1234567' })).toEqual([
			{ field: 'password', message: 'Пароль має містити не менше 8 символів' },
		]);
	});

	it('підтвердження пароля має збігатися', () => {
		const errors = validateRegistration({ email: 'a@b.ua', password: 'secret123', passwordConfirm: 'secret124' });
		expect(errors.map((e) => e.field)).toEqual(['passwordConfirm']);
	});

	it.each(['', 'anna', 'anna@', '@example.com', 'anna@example', 'an na@example.com'])(
		'некоректний email «%s»',
		(email) => {
			expect(validateRegistration({ email, password: '12345678' }).map((e) => e.field)).toEqual(['email']);
		},
	);

	it('пароль з кирилиці та пробілів довжиною 8 приймається', () => {
		expect(validateRegistration({ email: 'a@b.ua', password: 'пароль 1' })).toEqual([]);
	});
});

describe('normalizeEmail', () => {
	it('приводить email до нижнього регістру і прибирає пробіли — унікальність не обходиться регістром', () => {
		expect(normalizeEmail('  Anna@Example.COM ')).toBe('anna@example.com');
		expect(isValidEmail(' anna@example.com ')).toBe(true);
	});
});

describe('createLoginRateLimiter — NFR-8', () => {
	const ip = '203.0.113.7';
	let clock = 0;
	const now = () => clock;

	beforeEach(() => {
		clock = 1_000_000;
	});

	it('після 9 невдач вхід ще дозволений, після 10-ї — заблокований', () => {
		const limiter = createLoginRateLimiter({ now });
		for (let i = 0; i < 9; i++) limiter.registerFailure(ip);
		expect(limiter.isBlocked(ip)).toBe(false);
		limiter.registerFailure(ip);
		expect(limiter.isBlocked(ip)).toBe(true);
	});

	it('блокування знімається через 15 хвилин після найстарішої невдачі', () => {
		const limiter = createLoginRateLimiter({ now });
		for (let i = 0; i < 10; i++) limiter.registerFailure(ip);
		clock += 15 * 60 * 1000 - 1;
		expect(limiter.isBlocked(ip)).toBe(true);
		clock += 1;
		expect(limiter.isBlocked(ip)).toBe(false);
	});

	it('враховує ковзне вікно: старі невдачі не сумуються з новими', () => {
		const limiter = createLoginRateLimiter({ now });
		for (let i = 0; i < 5; i++) limiter.registerFailure(ip);
		clock += 16 * 60 * 1000;
		for (let i = 0; i < 9; i++) limiter.registerFailure(ip);
		expect(limiter.isBlocked(ip)).toBe(false);
	});

	it('лічильники різних IP-адрес незалежні', () => {
		const limiter = createLoginRateLimiter({ now });
		for (let i = 0; i < 10; i++) limiter.registerFailure(ip);
		expect(limiter.isBlocked('198.51.100.1')).toBe(false);
	});

	it('успішний вхід обнуляє лічильник', () => {
		const limiter = createLoginRateLimiter({ now });
		for (let i = 0; i < 9; i++) limiter.registerFailure(ip);
		limiter.reset(ip);
		limiter.registerFailure(ip);
		expect(limiter.isBlocked(ip)).toBe(false);
	});
});
