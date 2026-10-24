# Этап 1 — независимая приёмка bootstrap

Дата: 2026-10-24. Объём: monorepo/toolchain, public contract, API/миграция,
локальная PostgreSQL, стартовые admin/mobile и исходники CI. Это не приёмка
каталога с управлением товарами, входа, заказа, 1С или оплаты.

## Вердикт

**BLOCKED для завершения этапа и продвижения через обязательный security gate.**
Функциональные проверки ниже выполнены, но audit завершился с двумя HIGH.
Неисправленные advisories не исключены из gate и не превращены в known-issue PASS.
Удалённый GitHub CI, enforcement и native builds не проверены.

Исходники проверены независимо от авторов: root scripts, workflow, API controllers,
config/database, миграция/тесты, общий DTO, стартовые экраны admin/mobile.
Bootstrap проверен как незакоммиченные рабочие файлы поверх документарного
baseline `9a18b225f3a555586823272190516989fc020c68`. Это не SHA готового bootstrap.
Ниже закреплены хэши ключевых файлов проверенного локального снимка.

## Независимо выполненные проверки

В shell активирован pnpm 10.34.8 через
`PATH=/workspace/.tools/node_modules/.bin:$PATH`; Node 24.19.0. Default managed
pnpm этой машины — 11.25.0, он корректно отклоняется engines: это не успешная
проверка pinned toolchain. Устанавливать/активировать нужный pnpm обязательно.

| Проверка | Результат и предел доказательства |
|---|---|
| `pnpm format:check` | PASS: все проверенные файлы отформатированы до добавления этого отчёта |
| `pnpm lint` | PASS: ошибок/предупреждений не выведено |
| `pnpm typecheck` | PASS: contracts, admin, mobile, API; стандартный Prisma generate выполнен |
| `pnpm test:unit` | PASS: contracts 2/2, API 2/2; failed/skipped/cancelled = 0 |
| `pnpm test:integration` | PASS: runner сообщает 5/5 (родительский тест и 4 subtests), failed/skipped/cancelled = 0 |
| Повтор integration без экспортированных DB vars | PASS 5/5 после исправления root script на dotenv; использован локальный `.env` fixture |
| Финальный integration retest после исправления pnpm CLI runner | PASS 5/5 на Linux без экспортированных DB vars; Windows runtime не проверен |
| `pnpm build` | Contracts/API/admin PASS; mobile первоначально FAIL из-за записи telemetry в недоступный `/home/agent/.expo` |
| `EXPO_NO_TELEMETRY=1 pnpm --filter @vega/mobile build` | PASS после диагностики: 3 web bundles, 3 static routes; native Android/iOS не проверены |
| `env -u EXPO_NO_TELEMETRY pnpm build:mobile` | PASS после исправления root wrapper: telemetry-флаг задаётся скриптом, 3 web bundles/3 routes, exit 0 |
| `pnpm audit --prod --audit-level high --json` | FAIL, exit 1: HIGH 2, остальные уровни 0 |

Integration использовал отдельную случайную PostgreSQL-схему, настоящую миграцию,
fixture и HTTP-процесс API; схема удалена тестом. Проверены положительные размеры
на границе БД, гостевая проекция без private JSON, невалидная пагинация, реальный
разрыв транспорта БД → bounded readiness 503 при живом liveness, отказ запуска
с commerce/production-конфигурацией. Это не проверки резервов/платежей будущего этапа.

## Security gate — открытые дефекты зависимостей

| Пакет и путь | Advisory | Результат |
|---|---|---|
| `apps/mobile → expo → @expo/cli → node-forge@1.4.0` | GHSA-86w9-cpqp-85rv: RSA signature verification, HIGH | Audit не предлагает опубликованную исправленную версию (`patched_versions: <0.0.0`); gate не пройден |
| `apps/mobile → expo → @expo/cli → zod@3.25.76` | GHSA-mrhx-c7xc-m3w5: memory exhaustion, HIGH | Исправление заявлено >=4.6.6; совместимость замены major в Expo CLI не доказана; gate не пройден |

Расположение в инструментах Expo не является автоматическим исключением политики.
Нельзя подавлять audit, менять threshold, подменять неподдержанной major-версией
либо заявлять уязвимости устранёнными без проверки. Владелец зависимостей должен
найти поддержанное исправление/обновление стека; затем QA повторяет audit, сборку
Expo и затронутую регрессию. До этого общий вердикт остаётся BLOCKED.

## Найденные проблемы и retest

1. Root integration script не загружал `.env`, хотя README предлагал такой запуск.
   Исправлен владельцем на dotenv. Независимый retest с удалёнными DATABASE_URL
   и API_INTEGRATION_DATABASE_URL из process environment прошёл 5/5.
2. Обычный cloud build попытался создать `/home/agent/.expo` через telemetry.
   Поддержанный `EXPO_NO_TELEMETRY=1` устранил причину; повторный mobile export
   прошёл. Владелец добавил root wrappers build:mobile/dev:mobile с этим флагом,
   а admin wrappers — с NEXT_TELEMETRY_DISABLED. Независимый retest build:mobile
   без внешнего EXPO_NO_TELEMETRY прошёл; root build вызывает wrapper.
   HOME не переопределялся. Исходный дефект локального запуска закрыт.
3. CI audit перенесён последним обязательным шагом: тесты/сборки могут дать
   свидетельства, но итог job всё равно падает на advisories. Bypass отсутствует.
4. CI PostgreSQL выровнен с локальным 17.9-bookworm и закреплён digest.
5. Финальные checkout/setup-node v6 SHA независимо сверены через git ls-remote
   официальных репозиториев. Source review выполнен после обновления workflow.

## CI и непроверенные возможности

Исходник workflow запускается на push/PR, права contents:read, полный checkout
без сохранения credentials, actions закреплены SHA, зависимости frozen,
PostgreSQL опубликован только на loopback. В исходнике нет continue-on-error,
фиктивного успеха при отсутствии DB и отмены security gate. Prisma generate,
migrate, unit/integration и сборки — реальные команды root scripts.

Git history secret scanner ранее проверен на чистом и синтетическом leak fixture;
для полного нового проекта нужен первый commit и повтор по его истории.
Текущие незакоммиченные файлы этим history scan не подтверждены как чистые.

Не выполнены: GitHub-hosted run, branch rulesets/required checks/environments,
clean-machine remote installation, native builds, подписи/store release,
staging/production deploy и rollback. Наличие YAML не означает enforcement.
1С, платежи, production auth и commerce отключены и не входят в принятый runtime.

## Ключевой manifest SHA-256

```text
de5871e381adfdcc45716be888f83ccd77018fe887afb0daccb922911a0371e2  package.json
46dc396277ca4c83c01d675126879560afe81ccdd4f93c5fdc1abe2534816219  pnpm-lock.yaml
6010d089574ab4078fa09fbf5094c526c1ee5ebebb1ae021ba304c5a71782cae  .github/workflows/ci.yml
89c65c1122c27f7e026b1cc4924d208ccc30601fc26d41d5897b69f95daf5d13  apps/api/test/integration.test.mjs
2baa6cc9667831494843ce1d439509512f8267fe5586b88c445747c5b5e4ffd2  packages/contracts/src/index.ts
2cfdb30a4087b89544c0641f101b286f1ff89a911ac27d8648cbac5d9e39564b  apps/api/src/config.ts
```

Изменение затронутых исходников, lockfile или workflow требует оценки влияния
и соответствующего retest. Отчёт не обещает отсутствия всех багов; фиксирует
выполненные проверки, открытые дефекты и пределы допуска.
