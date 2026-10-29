# VEGA: checkpoint этапа 1

Дата: 2026-10-24, Europe/Moscow.

## Итог

Этап 0 принят документарно. Этап 1 реализован, но **BLOCKED**: одна high
уязвимость node-forge в Expo CLI без принятого upstream исправления.
QA/критик завершили независимые проверки; аудиту не делались исключения.
Не начинать зависимый этап 2 в обход gate. Допустима работа над устранением blocker.

## Git и PR

GitHub https://github.com/ykvlev/vega_mobile, репозиторий публичный.
main содержит документацию этапа0 (9a18b225f3a555586823272190516989fc020c68).
feat/stage-1-bootstrap содержит код; исходный code commit593688d18918df9f69e3bda0dcd6253d7096eac5.
Draft PR https://github.com/ykvlev/vega_mobile/pull/1 открыт, не слит.
Последующие изменения: отчёты, этот checkpoint и штатный Expo tsconfig cleanup.
Определить актуальный SHA через git rev-parse HEAD, текущие CI через gh run list.
Не переписывать опубликованную историю и не force push.

## Реализовано и проверено

pnpm workspace; Node24.19.0/pnpm10.34.8; Nest12.2/Prisma7.10.1/Postgres17.9;
общие DTO и whitelist; API live/ready/catalog; Next16.4.3 admin shell;
Expo58/RN0.88 mobile shell, SQL migration, ограничение положительных размеров.
Всё только demo; commerce и NODE_ENV production запрещены API-конфигурацией.
Нет реализации login, заказа, 1С, оплаты, 3D и финального дизайна.

Локально: frozen install, cloud install, migrations, format/lint/types,
unit4 + tooling6 и integration5 (skipped0), API/admin builds и mobile web export PASS.
Штатные API/admin/Metro startup и внутренние HTTP-запросы проверены.
Native Android/iOS и запуск на Windows не проверены. Windows test-launch,
.env и telemetry дефекты исправлены с независимым retest.
Gitleaks проверил историю двух commits с publisher checksum: no leaks.

Реальные CI40082362353 (push) и40082401387 (PR) для593688d прошли все основные
шаги кроме audit. Скачанный remote log подтверждает 2high. Последний tsconfig
cleanup проходит targeted mobile typecheck; финальный push повторно запустит CI.
Результаты смотреть в PR, не переносить успех старого run на новый SHA автоматически.

## Оставшиеся блокеры

- node-forge1.4.0: GHSA-86w9-cpqp-85rv через Expo CLI/signing.
- Zod GHSA-mrhx-c7xc-m3w5 ЗАКРЫТА scoped override4.6.7 с реальными CLI/regression tests.
  Последний полный audit подтверждает1HIGH forge. Multer исправлен override2.5.0;
  общий контракт использует Zod4.6.7. Не отключать audit и не патчить криптографию вслепую.
- API branch-protection403: текущему GitHub-подключению не доступны Administration
  endpoints. Main protections не настроены и не подтверждены; PR остаётся draft.
- Production prerequisites этапа0 сохраняются: настоящие1С/резервы, merchant/касса,
  phone ownership/recovery, коммерческие параметры, хостинг и store accounts.

## Продолжение и окружение

Рабочая папка этой сессии /workspace/vega_mobile (Linux), не Windows Documents/vega.
Активировать PATH=/workspace/.tools/node_modules/.bin:$PATH в новом shell.
README содержит команды; scripts/cloud-install.sh воспроизведён.
Игнорируемый .env содержит только fixture из .env.example. Не добавлять в Git.
PostgreSQL запущен Docker Compose, API3001, admin3000, Metro8081 — процессы текущей
сессии, их наличие в следующей задаче не гарантируется.
Root dev/build wrappers выключают optional telemetry, HOME не менялся.
Metro в CI/offline режиме использовал fallback optional desktop DevTools;
это не проверка native debugging и не изменённая проверка подписи.
Prisma standard generate/migrate работают, checksum-ignore/mirror/binary overrides не включались.

Cloud draft install_script/start_skill и network additions сохранены, не опубликованы.
Для snapshot review/save environment settings и publish выполняются пользователем.
Логи локальной сессии /workspace/reference-research/stage1; CI логи доступны по PR.
Старый /workspace/exports/vega-transfer.zip устарел: для Windows нужен новый экспорт
или git clone/fetch этой ветки. Inputs/references не публиковались в GitHub.

## Следующий конкретный шаг

Проверить актуальные официальные Expo CLI/node-forge/Zod fixes. Применять только
подтверждённое совместимое исправление, повторить audit и затронутые проверки.
После устранения security blockers — независимый QA на новом SHA и только затем
готовность этапа1. Не переводить PR ready/merge и не деплоить при FAIL/BLOCKED.

## Последующее устранение Zod blocker

В этой ревизии package/lock/test:unit обновлены: настоящий scoped Zod4.6.7,
новый scripts/expo-cli-compat.test.mjs с6 обязательными проверками; lint включает
scripts, CI full audit вместо --prod. Установка frozen, unit4+tooling6, export и
свежий devHTTP прошли, fullaudit1HIGH. Подробности новых независимых reviews
в последних разделах STAGE-1-QA/REVIEW; старые manifests относятся к старым SHA.
Новый source push запускает CI; результаты проверять по PR head, не переносить
прохождение старых40098273270/40098276494 на новую ревизию автоматически.

ForgePR1152/1158 не merged; version1.4.1-0 в upstreammain не устраняет конкретный
defect. Не ставить его ради зелёного audit. Не начинать этап2 без закрытия gate.
Cloud start_skill обновлён: один blocker и полный audit; сохранение не публикация.

## Независимая дизайн-ветка после разрешения пользователя

Пользователь разрешил параллельную визуальную работу при Stage1BLOCKED.
Текущая ветка feat/stage-2-design-preview, base feat/stage-1-bootstrap.
Общий environment-only fix d8023f50088bbc0f1ac60d1c8f939cbfd988a9bd выделен
отдельным коммитом и fast-forward перенесён в обе ветки (без force push):
build явно NODE_ENVproduction, dev development. Это устраняет ошибку Next
при наличии API.env с NODE_ENVdevelopment.

Добавлены @vega/design-tokens, webroute /design-preview, AIhero asset,
интерактивные home/catalog/detail/local selection/profile/dialog/2Dcolorstudio.
Admin homepage и native app не заменены. Fixtures гостевые: вообще нет цен
или остатков, не запрашиваются credentials, нет API/order/payment запросов.
Размеры perSKU, Clear15м против Graphite17м; keyboard remove переносит фокус
и объявляет удаление. Семь Playwright тестов прошли локально и независимо,
полный root lint/types/format и productionadminbuild PASS.
Скриншоты в /workspace/reference-research/stage2/playwright и independent.

Документы: STAGE-2-PREVIEW.md, STAGE-2-DESIGN.md, STAGE-2-QA.md.
PASS только перечисленных браузерных сценариев, не всего этапа2/native/commerce.
QA-agent финальный turn однажды упёрся в usage limit; вместо выдуманного отчёта
независимый критик выполнил все7 проверок после исправлений и сохранил отчёт.
Root усилил проверку успешной загрузки hero и повторил7/7.

CI дополнен отдельным job design-preview с browser screenshot artifacts;
quality сохраняет обязательный полный audit и ожидаемо FAIL по node-forge.
Новый UI/source commit и run должны быть проверены по актуальной ветке/PR: не
переносить локальный PASS на удалённый CI до его завершения. Публичного deploy нет.
Для продолжения: проверить git status/PRchecks, изучить визуальные артефакты,
собирать обратную связь по дизайну. Не merge/release, пока quality BLOCKED.
