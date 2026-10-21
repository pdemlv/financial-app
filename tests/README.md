# Автоматизовані тести

Повний опис підходу, середовищ і критеріїв — у [`doc/test-plan.md`](../doc/test-plan.md).

| Каталог        | Рівень                         | Інструменти             | Потребує                   |
| -------------- | ------------------------------ | ----------------------- | -------------------------- |
| `unit/`        | Модульні: `lib/` без БД і HTTP | Jest, ts-jest           | —                          |
| `integration/` | API + PostgreSQL               | Jest, Supertest, Prisma | `BASE_URL`, `DATABASE_URL` |
| `api/`         | Контракт REST API              | Jest, Supertest         | `BASE_URL`                 |
| `e2e/`         | UI-сценарії і smoke (`@smoke`) | Playwright              | `BASE_URL`                 |
| `helpers/`     | Клієнт API, доступ до БД       | —                       | —                          |

## Підготовка

```bash
npm install
npx prisma generate          # клієнт Prisma для інтеграційних тестів
npx playwright install       # браузери для e2e
```

## Запуск

```bash
npm test                                  # unit
npm run test:unit                         # unit + покриття (поріг 80 % для calculations.ts і money.ts, NFR-18)

BASE_URL=http://localhost:3000 npm run test:api
BASE_URL=http://localhost:3000 DATABASE_URL=postgresql://… npm run test:integration
BASE_URL=http://localhost:3000 npm run test:e2e
BASE_URL=https://<staging> npm run test:smoke

RUN_PERF=1 BASE_URL=https://<staging> npm run test:api -- performance   # NFR-2, повільно
```

Без `BASE_URL` API- та інтеграційні тести позначаються як пропущені. Інтеграційні тести пишуть у БД напряму — **не запускайте їх проти production**.

## Домовленості

- Кожен тест створює власного користувача (`registerUser()` / фікстура `account`), тому тести незалежні і можуть виконуватися паралельно.
- Назви тестів посилаються на вимоги (FR / NFR / US / AC), smoke-тести — на ID із `doc/tests/smoke-tests.md`.
- Суми в API — цілі копійки, дати — `РРРР-ММ-ДД`. Очікувані формати відповідей — додаток Б тест-плану.
- UI-елементи шукаються за роллю і доступною назвою з `doc/design-spec.md`; числові значення — за `data-testid` (додаток В тест-плану).
