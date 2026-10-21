import type { ValidationError } from '../types';

export const PASSWORD_MIN_LENGTH = 8;

export interface RegistrationInput {
	email?: unknown;
	password?: unknown;
	passwordConfirm?: unknown;
}

/** Email зберігається в нижньому регістрі без пробілів по краях (architecture.md, розділ 4). */
export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** FR-1: коректний email, пароль не менше 8 символів, підтвердження збігається (якщо передане). */
export function validateRegistration(input: RegistrationInput): ValidationError[] {
	const errors: ValidationError[] = [];

	if (typeof input.email !== 'string' || !isValidEmail(input.email)) {
		errors.push({ field: 'email', message: 'Вкажіть коректний email, наприклад name@example.com' });
	}

	if (typeof input.password !== 'string' || input.password.length < PASSWORD_MIN_LENGTH) {
		errors.push({ field: 'password', message: 'Пароль має містити не менше 8 символів' });
	} else if (input.passwordConfirm !== undefined && input.passwordConfirm !== input.password) {
		errors.push({ field: 'passwordConfirm', message: 'Паролі не збігаються' });
	}

	return errors;
}
