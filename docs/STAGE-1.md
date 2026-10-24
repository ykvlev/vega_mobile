# Этап 1: bootstrap

Статус: **BLOCKED**, не принят для продвижения по зависимой цепочке.
Локальные функциональные проверки bootstrap пройдены; security audit блокируется
двумя high advisory в инструментах Expo. Не скрывать и не исключать их из gate.

## Реализовано

- pnpm workspaces, единый frozen lockfile, Node 24.19.0/pnpm 10.34.8.
- NestJS 12.2.0, Prisma 7.10.1, PostgreSQL 17.9 с закреплённым image digest.
- Начальная миграция Category/Product с ограничениями размеров плёнки.
- Demo-only API: liveness, DB readiness, пагинируемый публичный каталог.
- Общий Zod-контракт и явное исключение коммерческих/неизвестных полей.
- Стартовая Next.js 16.4.3 админка без имитации работающих бизнес-функций.
- Expo 58.0.17 / React Native 0.88.0 / Expo Router, стартовый экран и web export.
- Root команды setup/dev/build/test, README с запуском для Windows и cloud.
- GitHub Actions с PostgreSQL, scanner, аудитом, types/lint/tests/build.

Это не реализация входа, заказов, оплаты, резерва 1С, 3D или окончательного UI.

## Фактически выполнено локально

| Проверка | Результат |
|---|---|
| Frozen-lockfile установка | PASS |
| Генерация Prisma и миграция PostgreSQL | PASS стандартным CLI, checksum bypass не включён |
| Unit | 4 PASS, 0 skipped: DTO/длины, fail-closed config, readiness masking |
| Integration | 5 PASS, 0 skipped: настоящая миграция/fixture/ограничения, guest DTO, транспортный отказ БД, unsafe startup |
| TypeScript, ESLint, Prettier | PASS |
| Сборка API | PASS |
| Next production build | PASS |
| Expo web export | PASS; не native build |
| Внутренние HTTP-запросы | live/ready/catalog 200, admin 200 с ожидаемым текстом |
| Воспроизведение cloud install | PASS |
| Dependency audit | FAIL: 2 high после исправления multer |

Независимые retest и границы — STAGE-1-QA.md, STAGE-1-REVIEW.md.
Локальные логи сессии: /workspace/reference-research/stage1, они не требуются
приложению и не являются опубликованными CI артефактами.

## Security blockers

1. GHSA-86w9-cpqp-85rv, node-forge 1.4.0 через инструменты Expo: на момент
   проверки исправленный опубликованный релиз не найден.
2. GHSA-mrhx-c7xc-m3w5, Zod 3.25.76 в Expo CLI: официальный CLI всё ещё требует
   старшую ветку 3. Major override без подтверждения совместимости не применён.

API multer обновлён точечным override до исправленной 2.5.0, проверки пройдены.
Общий пакет контрактов использует Zod 4.6.7. Оставшиеся advisory относятся
к CLI, но code signing/devtools используют затронутые функции: это не основание
объявить аудит успешным. Собственные криптопатчи и отключение аудита не применялись.

Для закрытия: проверенный официальный совместимый update/patch с корректным
происхождением, новый frozen install, audit и затронутые проверки. Ожидание
upstream — конкретный внешний blocker, а не «всё готово».

## CI и внешняя среда

Workflow job `quality`: scanner → install/generate/migrate → format/lint/types →
unit/integration/build → audit. Аудит оставлен последним, чтобы ошибки зависимостей
не скрывали результаты остальных проверок; его fail всё равно блокирует job.
Ни continue-on-error, ни audit exclusions нет. Actions и PostgreSQL закреплены.

Удалённый запуск Actions и protections фиксируются отдельно по фактическим
результатам. Git push не доказывает доступ к GitHub API или успешный CI.
Native Android/iOS и выполнение на Windows в этой Linux-сессии не проводились.
Исправление запуска pnpm CLI на Windows проверено по коду и Linux retest, не
выдаётся за испытание на Windows.

## Применённые ограничения cloud

Установлен локальный pnpm в /workspace/.tools, поскольку системный pnpm другой
версии и HOME недоступен для записи. Системный HOME не менялся. Expo/Next telemetry
выключены поддержанными root wrappers. Prisma сначала получал 403 при скачивании;
позднее стандартные generate/migrate выполнились без checksum bypass.
Отдельное ручное чтение checksum endpoint продолжало возвращать 403 и не выдаётся
за успешную независимую проверку checksum. Настройки не ослаблялись.

Для будущих окружений сохраняются install/start инструкции; живые процессы
не считаются переживающими snapshot. Production и пользовательские данные не используются.
