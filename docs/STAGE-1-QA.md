# Этап 1 — независимая приёмка bootstrap

Дата: 2026-10-24. Объём: monorepo/toolchain, public contract, API/миграция,
локальная PostgreSQL, стартовые admin/mobile и исходники CI. Это не приёмка
каталога с управлением товарами, входа, заказа, 1С или оплаты.

## Вердикт

**BLOCKED для завершения этапа и продвижения через обязательный security gate.**
Функциональные проверки выполнены, но audit актуального снимка содержит один
HIGH (`node-forge`). Первоначальные два HIGH и последующие исправления описаны
ниже хронологически; актуальный manifest и закрытие Zod — в последнем дополнении.
Неисправленные advisories не исключены из gate и не превращены в known-issue PASS.
Удалённый CI выполнен для исторических commit согласно дополнениям ниже;
enforcement и native builds не проверены.

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

## Дополнение: фактические удалённые проверки

2026-10-24: bootstrap опубликован в draft
[PR #1](https://github.com/ykvlev/vega_mobile/pull/1), проверенный head
`593688d18918df9f69e3bda0dcd6253d7096eac5`. Этот раздел обновляет прежние отметки
«HEAD отсутствует для bootstrap» и «remote CI не выполнен»; остальные пределы
допуска сохраняются. Хэши всех шести ключевых исходников manifest выше повторно
сверены и не изменились; исходники ради этого отчёта не менялись.

QA независимо прочитал `gh run view --json headSha,status,conclusion,jobs`:

| Запуск | Commit | Результат |
|---|---|---|
| [Push 40082362353](https://github.com/ykvlev/vega_mobile/actions/runs/40082362353) | `593688d18918df9f69e3bda0dcd6253d7096eac5` | Completed / FAILURE |
| [PR 40082401387](https://github.com/ykvlev/vega_mobile/actions/runs/40082401387) | Тот же head | Completed / FAILURE |

В обоих jobs `quality` GitHub API подтверждает success для secret scan, pinned
toolchain/frozen install, Prisma generate/migrate, format/lint/types, unit,
integration и сборок API/admin/mobile web. Единственный неуспешный основной шаг —
`Audit production dependencies`. Пропущен только post-step cleanup setup-node,
а не обязательный тест. Содержимое remote audit logs пока не прочитано из-за
сетевого ограничения скачивания; конкретные advisories выше подтверждены
локально, а не приписаны непрочитанным удалённым логам.

Дополнительно QA прочитал локальный полный audit (включая devDependencies):
`/workspace/reference-research/stage1/audit-all.json` — HIGH 2, остальные уровни 0.
Оркестратор сообщил локальный gitleaks по двум коммитам с проверенным release
checksum и без находок; remote secret scan независимо подтверждён step success.

Защита ветки не подтверждена и не считается настроенной: endpoint изменения
branch protection вернул оркестратору 403 `Resource not accessible by integration`.
Неуспех job не доказывает технический запрет merge без required checks/ruleset.
Native, staging/production и store release по-прежнему не выполнены.

**Итог остаётся BLOCKED:** runtime CI теперь действительно выполнен и сохранил
security failure. Изменение только этого отчёта создаст следующий commit/run;
результат будущего запуска не предполагается заранее.

## Дополнение: Expo dev startup и нормализация TypeScript

После описанного remote head оркестратор запустил `CI=1 pnpm dev:mobile --offline`
и сообщил `/status` 200 и `/` 200 с VEGA. QA не выдаёт эти HTTP-запросы за свой
повторный запуск. Expo при старте нормализовал `apps/mobile/tsconfig.json`, удалив
include для `expo-env.d.ts` и `.expo/types/**/*.ts`, а также удалил tracked
`apps/mobile/expo-env.d.ts`, содержавший единственный reference на `expo/types`.

QA независимо просмотрел фактический diff и установленный код Expo CLI:
`startTypescriptTypeGeneration` при выключенном `experiments.typedRoutes` удаляет
эти generated type includes/env-файл. В текущем app.json typedRoutes не включён;
`app/**/*.ts` и `app/**/*.tsx`, strict и noEmit сохранены. Нового дефекта
bootstrap в этой нормализации не найдено. Независимый targeted retest
`pnpm --filter @vega/mobile typecheck` завершился exit 0. Новый хэш tsconfig:
`4285e7ba8bb341087f34c399682d086b1dc0b8bd847dd208a8b3da9dd766a10b`.

Это отдельное изменение исходной конфигурации после remote commit выше;
предыдущие remote runs не доказывают проверку этой правки. Требуется следующий CI.
Предупреждение загрузки desktop RN DevTools в недоступный headless cache не
считается проверкой native debugging; обхода подписи/проверок загрузки не делалось.
Общий вердикт **BLOCKED** и открытые security findings не изменены.

## Дополнение: исправление Zod и новый проверенный снимок

2026-10-24: владелец добавил ограниченный override `@expo/cli>zod: 4.6.7`.
Это реальная замена зависимости, а не alias, module hook, подмена схем или
исключение из audit. QA просмотрел package/lock и compatibility test:
`zod@3` в lock больше нет, Expo CLI разрешает настоящий Zod 4.6.7.
Root `test:unit` обязательно запускает `test:tooling`; lint включает scripts.

QA независимо выполнил:

- `pnpm test:tooling`: **PASS 6/6**, failed/skipped/cancelled = 0. Проверены
  реальные модули Expo CLI: plugin descriptors, readonly environments, optional
  MCP schema/JSON Schema, output schema и parser/error issues. Regression
  constrained array отклоняет oversized input до per-element parsing.
- `pnpm audit --audit-level high --json`: **FAIL, exit 1, HIGH 1**, остальные
  уровни 0. Остался только `expo → @expo/cli → node-forge@1.4.0`,
  GHSA-86w9-cpqp-85rv. Zod advisory отсутствует в полном audit, не только prod.

Дополнительно прочитаны сохранённые root logs в
`/workspace/reference-research/stage1/`: unit-after-zod.log (4 прежних unit +
6 tooling PASS), mobile-zod4-export.log (успешный web export),
mobile-zod4-dev.log (Metro bundling после запуска). HTTP 200 root проверил отдельно;
QA не выдаёт это за собственный HTTP retest. Финальный SIGTERM dev-процесса
после smoke не интерпретируется как успешное завершение команды; это долгоживущий
сервер. Optional RN DevTools headless warning сохраняется, live MCP transport,
native debugging и Android/iOS этим не проверены.

**Zod finding закрыт для проверенного bootstrap/CLI объёма:** advisory устранён
в реальной установке, затронутые модули и security regression проверены независимо,
экспорт/старт подтверждены отдельными свидетельствами. Это не обещание полной
совместимости всех будущих optional integrations. CI должен повторить весь набор
после push нового commit; прежние remote runs этот lockfile не проверяли.
Неизменённые DB/admin suites локально повторно не запускались.

Финальный source CI использует шаг `Audit all workspace dependencies` и
`pnpm audit --audit-level high`, включая devDependencies. Старое имя шага и
prod-only команда выше относятся к историческим runs, а не к текущему workflow.
Проверка не отключена и её порог не ослаблен.

Новый manifest **заменяет прежний package/lock/config снимок**, а не объявляет
старые remote результаты проверкой новых зависимостей:

```text
26f391fdf17f7a01a12c9b80449e708d312be7a002a0b3299e8f8d37706806df  package.json
8e6abb2872e9ab156c3922062b80559e4a46f5876248fcfdaf2812a217405459  pnpm-lock.yaml
3cb3e72828b60b4c04781349f543b061824a4c93e45a69b74dc50e50bd2f9b8c  scripts/expo-cli-compat.test.mjs
0cd3f01fe92f1f6a1fc761ea024536a3a1755b0cc1e6894e209acfe57bf3c5af  apps/mobile/tsconfig.json
0e341aa5fc5807c7ac9519001f83af944a78b822020619ec5053231a1e1dd402  .github/workflows/ci.yml
```

Общий вердикт остаётся **BLOCKED — один HIGH node-forge**, без ослабления audit
и без общего security/runtime/production PASS.
