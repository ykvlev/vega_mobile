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

## Текущий срез: desktop admin (25 октября 2026)

Родитель account UI принят локальными browser7/7 и удалённым run40216578957:
account-ui/catalog-lab/design-preview прошли, quality остановился только на
node-forge audit. Исходники account опубликованы draft PR6, head77e2481.

Текущая ветка feat/desktop-admin: новая manager-роль, guarded offline provisioning,
admin categories/products API, черновик/публикация, CAS-версия и transactional
CatalogAudit; десктопная Next-админка в общей теме VEGA. Реальная 1С, цены,
остатки, оплата и production пока не подключены. Фотозагрузка не входит в срез.

Root проверил25 unit/tooling и27 PostgreSQLintegration checks, все прошли.
UI-граничные случаи категории101 и публикации при несохранённом редакторе
исправлены и подтверждены browser7/7 без пропусков. После паузы root исправил
доступные названия select/button; тест validation теперь проверяет актуальное
сообщение и отсутствие как товара, так и audit-события. Итоговый полный прогон7/7
прошёл; screenshot-сценарий дополнительно переснят с scrollY=0 (1/1PASS).
Регрессии account/design/catalog ранее прошли по7/7 на этом серверном срезе.
Actual desktop screenshots сохранены в docs/media/admin-*.png. Порты fixtures
API3193 и Next3104 (старый чужой Next3191 не трогали). До завершения remote CI
не переносить локальный PASS на GitHub. Далее commit/secret scan/push/draftPR.

Черновик start_skill облачной среды обновлён и сохранён в текущем чате:
новый root redirect/admin, guarded staff access, реальные test-команды.
Publication metadata status=saved, requires_publish=true — это НЕ публикация.
Публикацию выполняет пользователь через продукт; не создавать фиктивные ссылки.
Установка и network/repositories настройки сохранены без изменения.

## Фотографии товаров (26 октября 2026)

Ветка feat/product-photos основана на feat/desktop-admin (8defb37).
Добавлены загрузка, галерея, обложка, перестановка и удаление; нормализация
Sharp в WebP, лимиты 8 фото / 5 MiB input / 16 MP / 1 MiB output.
Bytes сохраняются в PostgreSQL только для изолированного demo.
Manager видит черновики, посетитель — только опубликованные фото.
Все операции используют CAS и транзакционный аудит; BFF скрывает bearer
и API origin, проверяет Origin и размер потока, proxy не кэширует фото.
Исправлены abort-race очереди и выбор файла до гидратации редактора.

Локально прошли 32 unit/tooling, 32 integration, 3 media browser,
7 admin browser, production admin build, lint, types и форматирование.
Скриншоты: docs/media/product-photos-{admin,public}.png.
CI получил отдельную product-media задачу; общий audit остаётся обязательным.
Известная upstream уязвимость node-forge не исправлена и не подавлена.
Реальная 1С, цены, резервирование, оплата и production не подключены.
Далее проверить удалённый CI текущего head; никаких merge/release автоматически.

Проверка CI выявила две гонки прежних экранов: CDP терял тело ответа
регистрации при redirect, а requestAnimationFrame навигации мог забрать
фокус у ссылки входа. Account-тест теперь читает и передаёт неизменённый
реальный ответ до redirect; навигация переносит фокус в useLayoutEffect
того же commit. Keyboard regression проверяет сохранение фокуса после кадра.
Не переносить результаты предыдущего head на финальный CI.

## Изменение scope после встречи 26 октября 2026

Сначала читать CUSTOMER-MEETING-2026-10-26.md и обновлённый DECISIONS.md.
Отдельную админку исключили: сотрудники работают через 1С. Реализованный demo
не удалён, но его развитие остановлено. Backend остаётся. Цены/наличие после
одобрения менеджером, а не просто регистрации. Резерв ожидания оплаты отменён,
отдельное повторное принятие менеджерских изменений тоже. Delivery отдельно
перевозчику при получении; СДЭК ПВЗ на карте сразу, трек из 1С. SMS/push нужны.
Программист/тестовая база обещаны, не получены. Новый брендбук существует по
переписке, но актуальный файл не получен. Старые API/payment-спецификации
помечены как superseded там, где противоречат новым решениям; runtime не изменён.
Открыты готовые отрезы при пороге, границы stock labels, НДС/цена/округление,
назначение менеджера, stale-процесс, отсутствие гарантии остатка без резерва,
партии и финансовые изменения. Не строить их из догадок. Оценка «2 месяца»
не гарантирована. Следующая реализация зависит от обследования и контракта 1С.

### Последующие уточнения 26 октября

При ≤2 целых рулонах Color/Color Ultima запрещены ВСЕ отрезы, в том числе
готовые и отдельно учтённые. Это заменяет старое разрешение готовых отрезов.
Покупатель менеджера не выбирает; свободного клиента менеджер забирает сам.
Нужна атомарность закрепления, не клиентский выбор. Процесс изменения заказа
остался открытым по последнему ответу пользователя; более раннее «Да» про
показ актуального итога этим ответом заменено. Не реализовывать догадками
версии платежа, новые подтверждения, доплаты и возвраты. Runtime не менялся.

## Адаптация к решениям заказчика: customer-alignment

Ветка feat/customer-alignment основана на docs/customer-decisions-20261026.
Корень / теперь ведёт в /design-preview, ссылка на admin из профиля убрана.
Прямой /admin сохранён только как архивный demo с прежними ACL и тестами;
это не сотруднический интерфейс целевого релиза. Профиль показывает отдельный
commercialAccessStatus. Миграция 202610260002_customer_approval задаёт pending
новым и существующим аккаунтам; register не принимает одобрение/managerId,
login/me читают актуальное значение из БД. Поле не заменяет реальный обмен с 1С.

Модуль packages/contracts/src/sale-rules.ts — внутренние проверенные правила,
не опубликованный offers endpoint и не выдуманный протокол 1С. Он проверяет
полноту участвующих складов одного SKU, свежесть и безопасные целые значения;
при ≤2 Color/Color Ultima запрещает все отрезы, включая готовые. Скрывает
наличие неapproved. Метражи в UI — плитки 1–18 для локального подбора, без
обещания наличия. Назначение/одобрение из 1С ещё не подключены, order-change
остаётся открытым вопросом. Нет резервов, заказов или реальных платежей.

Технические спецификации API/payment/architecture/backend/mobile/security/QA
и обследование 1С переписаны под актуальные правила. Исторические stage0
отчёты явно помечены; прежние требования не использовать для новой реализации.
Локально: 38 unit/tooling, 33 PostgreSQLintegration, design7, catalog7,
account7, archived-admin7, media3; production admin build, lint, types,
format и миграции тестовой public БД прошли. В этой среде browser suites
запускать последовательно: параллельный старт пяти наборов вызвал timeouts,
в последовательном прогоне они прошли без ослабления лимитов.
Удалённый CI проверять по финальному head, node-forge audit не обходить.
Следующая зависимость — программист/тестовая 1С и согласованный контракт;
не продолжать развитие отдельной админки и не обещать готовую интеграцию.

### Новое визуальное направление

Пользователь запросил скриншоты и интерфейс как LIMÉ. Исследованы официальные
скриншоты App Store id1440122090; новый ориентир зафиксирован в DESIGN-BRIEF.md.
Фактические текущие web-скриншоты сохранены customer-home-390.png и
customer-catalog-390.png. Это прежний pushr-интерфейс; под LIMÉ ещё не переделан.
Следующая UI-задача — новая сетка/типографика/навигация с соблюдением брендбука
VEGA и бизнес-правил. Не выдавать опубликованные текущие PNG за выполненный редизайн.

## Реализованная визуальная переработка LIMÉ

Ветка feat/lime-redesign основана на feat/customer-alignment (7e2d48a).
Новые пользовательские скриншоты уточнили направление: белые внутренние экраны,
полноэкранная главная, спокойная типографика, тонкие линии/иконки, прямые кнопки.
Переписаны preview/account/catalog-lab стили, убраны inline dark overrides,
общая поверхность web светлая; метаданные больше не называют сайт админкой.
Архивный admin не перерабатывался как целевой продукт, но регрессия проверена.
Сотрудники целевого продукта работают в 1С, бизнес-правила не менялись.

Локально: design7/account7/catalog7/archived-admin7/media3 PASS (31 сценарий),
production web build, typecheck, lint и format PASS. Один промежуточный media
случай не дождался входа за5сек; тихий полный повтор media3/3 прошёл без
ослабления лимитов. Независимый reviewer проверил реальные рендеры и источник;
исправлены контраст подписей, touch target назад и мелкий текст каталога.
Скриншоты docs/media/lime-*.png — реальные Chromium renders, не imagegen/native.
Вход телефон+пароль, pending approval, выбор целых метров1–18 сохранены.
Ни SMS/tracking consent, ни цены/наличие/заказы не имитируются по референсу.
Источник новой визуальной системы: docs/LIME-REDESIGN.md. Удалённый CI требует
проверки финального head; node-forge audit не отключён и релиз не разрешён.
