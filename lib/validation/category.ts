import type { TxType, ValidationError } from '../types';

export const CATEGORY_NAME_MAX_LENGTH = 30;

/** Фіксована палітра категорій із docs/ui/design-spec.md. */
export const CATEGORY_PALETTE = [
	'#1F7A5A',
	'#3E7FA6',
	'#B04A33',
	'#C58A2E',
	'#6B5CA5',
	'#4C8C6B',
	'#A3566F',
	'#5E6B73',
] as const;

export interface CategoryInput {
	name?: unknown;
	type?: unknown;
	color?: unknown;
}

export interface ExistingCategory {
	id: string;
	name: string;
	type: TxType;
}

/**
 * FR-8, FR-9: назва 1–30 символів, унікальна в межах типу та користувача (без урахування регістру),
 * колір — лише з палітри. `selfId` передається при редагуванні, щоб категорія не конфліктувала сама з собою.
 */
export function validateCategory(
	input: CategoryInput,
	existing: ExistingCategory[],
	selfId?: string,
): ValidationError[] {
	const errors: ValidationError[] = [];
	const typeValid = input.type === 'INCOME' || input.type === 'EXPENSE';
	const name = typeof input.name === 'string' ? input.name.trim() : '';

	if (!typeValid) {
		errors.push({ field: 'type', message: 'Оберіть тип категорії: дохід або витрата' });
	}

	if (name.length === 0) {
		errors.push({ field: 'name', message: 'Вкажіть назву категорії' });
	} else if (name.length > CATEGORY_NAME_MAX_LENGTH) {
		errors.push({ field: 'name', message: 'Назва не може бути довшою за 30 символів' });
	} else if (
		typeValid &&
		existing.some(
			(c) => c.id !== selfId && c.type === input.type && c.name.toLowerCase() === name.toLowerCase(),
		)
	) {
		errors.push({ field: 'name', message: 'Категорія з такою назвою вже існує' });
	}

	const color = typeof input.color === 'string' ? input.color.toUpperCase() : '';
	if (!(CATEGORY_PALETTE as readonly string[]).includes(color)) {
		errors.push({ field: 'color', message: 'Оберіть колір із палітри' });
	}

	return errors;
}
