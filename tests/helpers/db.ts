import { PrismaClient } from '@prisma/client';
import { BASE_URL } from './api';

/**
 * Інтеграційні тести перевіряють, що зміни через API реально потрапили в PostgreSQL з правильними
 * обмеженнями цілісності. Потрібні обидві змінні: BASE_URL застосунку і DATABASE_URL тієї самої бази.
 * Ніколи не запускайте їх проти production-бази.
 */
export const describeIfDb = BASE_URL && process.env.DATABASE_URL ? describe : describe.skip;

let client: PrismaClient | undefined;

export function db(): PrismaClient {
	client ??= new PrismaClient();
	return client;
}

export async function disconnectDb() {
	await client?.$disconnect();
	client = undefined;
}

export async function userByEmail(email: string) {
	return db().user.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
}
