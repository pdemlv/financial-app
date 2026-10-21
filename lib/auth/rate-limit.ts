/**
 * NFR-8: не більше 10 невдалих спроб входу з однієї IP-адреси за 15 хвилин.
 * Ковзне вікно: враховуються лише невдачі за останні `windowMs` мілісекунд.
 */
export interface LoginRateLimiterOptions {
	maxFailures?: number;
	windowMs?: number;
	now?: () => number;
}

export function createLoginRateLimiter(options: LoginRateLimiterOptions = {}) {
	const maxFailures = options.maxFailures ?? 10;
	const windowMs = options.windowMs ?? 15 * 60 * 1000;
	const now = options.now ?? Date.now;
	const failures = new Map<string, number[]>();

	function recent(ip: string): number[] {
		const threshold = now() - windowMs;
		const list = (failures.get(ip) ?? []).filter((t) => t > threshold);
		failures.set(ip, list);
		return list;
	}

	return {
		/** true — спробу входу потрібно відхилити з кодом 429. */
		isBlocked(ip: string): boolean {
			return recent(ip).length >= maxFailures;
		},
		registerFailure(ip: string): void {
			recent(ip).push(now());
		},
		/** Успішний вхід обнуляє лічильник. */
		reset(ip: string): void {
			failures.delete(ip);
		},
	};
}
