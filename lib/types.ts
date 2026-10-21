export type TxType = 'INCOME' | 'EXPENSE';

/** Дата без часу у форматі ISO: РРРР-ММ-ДД. Так уникаємо зсувів через часові пояси. */
export type IsoDate = string;

export interface Period {
	from: IsoDate;
	to: IsoDate;
}

export interface ValidationError {
	field: string;
	message: string;
}

export interface CategoryRef {
	id: string;
	type: TxType;
}

export interface CategoryInfo {
	id: string;
	name: string;
	color: string;
}

/** Мінімальний набір полів операції, потрібний для розрахунків. Сума — у копійках, завжди > 0. */
export interface TxLike {
	type: TxType;
	amount: number;
	occurredAt: IsoDate;
	categoryId: string | null;
}
