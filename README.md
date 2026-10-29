# VEGA

Клиент React Native/Expo, клиентский web/demo (Next.js), API (NestJS) и PostgreSQL.
Реализованы demo-каталог, фотографии и вход по телефону/паролю со статусом
одобрения клиента. Реальные заказы, платежи и обмен с 1С ещё не подключены.
Сотрудники целевого продукта работают в 1С; отдельная админка исключена.
Архивный desktop-стенд сохранён для воспроизводимости прежних проверок.
API работает исключительно в явно заданном demo-режиме с выключенной коммерцией.

## Инструменты

- Node.js **24.19.0**, pnpm **10.34.8** (версии закреплены).
- Docker с Compose v2 для PostgreSQL. На Windows — Docker Desktop с Linux containers.
- `npm install --global pnpm@10.34.8`, затем проверить `node --version` и `pnpm --version`.
  Использовать `pnpm`, не `npm install`, для зависимостей монорепозитория.

## Первый запуск

Из корня репозитория:

```sh
pnpm install --frozen-lockfile
docker compose -f infrastructure/compose.yaml up -d --wait
```

Скопировать `.env.example` в `.env` (PowerShell: `Copy-Item .env.example .env`,
bash: `cp .env.example .env`), только если своего `.env` ещё нет.
Это локальные тестовые реквизиты, не настройки production. Порт БД опубликован
только на loopback. Не менять существующие пользовательские файлы вслепую.

```sh
pnpm db:generate
pnpm db:migrate
pnpm dev:api
```

API: порт **3001**, `GET /health/live`, `GET /health/ready`,
`GET /api/v1/products`. Последний возвращает пустой список после миграции:
автоматического заполнения каталога нет. Пример проверки в PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/health/ready
Invoke-RestMethod http://127.0.0.1:3001/api/v1/products
```

В отдельных терминалах:

```sh
pnpm dev:admin
pnpm dev:mobile
```

Web: порт **3000**, корень открывает клиентский `/design-preview`.
`/catalog-lab` показывает публичный каталог API, `/account` — demo-вход/профиль.
Для тестового каталога есть `pnpm demo:catalog:seed` (только test/demo БД).
Авторизация по умолчанию выключена: настройка изолированного режима —
[AUTH.md](docs/AUTH.md). Новый аккаунт ожидает одобрения менеджером; выбор
менеджера и самостоятельное одобрение не допускаются. Реальных цен/остатков
пока нет даже у approved. Прямой `/admin` — архивный staff demo, не целевой UI.
Expo выводит инструкции для устройства/эмулятора. Поддержка установленным Expo Go
зависит от версии SDK; web export не доказывает запуск на iPhone/Android.
`dev:api` собирает и запускает сервер; после изменения API перезапустить команду.

## Проверки

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm build
pnpm audit --audit-level high
```

Перед API typecheck/build выполнить `db:generate` (root scripts также генерируют
клиент); `typecheck` и тесты сначала собирают общий пакет контрактов.
Интеграционные тесты требуют работающей отдельной тестовой PostgreSQL: создают
случайную схему, применяют настоящую миграцию, пишут fixture и удаляют свою схему.
Не направлять их на рабочую БД. `API_INTEGRATION_DATABASE_URL` может переопределить
адрес только для интеграционных тестов. Тесты не пропускаются при отсутствии БД.

`build`: API → admin production build → mobile web export. Это не подписанные
нативные сборки и не деплой. Node test runner проверяет контракты и API;
Playwright проверяет реальные цепочки web/API/PostgreSQL. Browser-наборы:
`pnpm test:design`, `test:catalog`, `test:account`, `test:admin`, `test:media`.
Перед ними собрать API и web; на небольшой машине запускать последовательно.
Мобильный клиент проверяется отдельно: `pnpm test:mobile` после сборки API
и `EXPO_PUBLIC_API_URL=http://127.0.0.1:3106 pnpm build:mobile`.
Каталог, карточка, подбор и аккаунт используют RN-компоненты и настоящий demo API.
На native токен хранится в SecureStore, в web — только в памяти.
Настройка HTTPS endpoint и границы проверки: [мобильный клиент](docs/MOBILE-CUSTOMER.md).
Native-приёмка на устройствах пока не выполнена.

Команды root `build:mobile`/`dev:mobile` отключают необязательную телеметрию Expo
поддержанным EXPO_NO_TELEMETRY=1; `build:admin`/`dev:admin` — телеметрию Next.
Это также позволяет запуск в cloud, где домашняя папка недоступна для записи.
Глобальный HOME не меняется. Для этой облачной среды зависимости воспроизводятся
`bash scripts/cloud-install.sh`; закреплённый pnpm затем доступен через
`export PATH="/workspace/.tools/node_modules/.bin:$PATH"` в каждом новом shell.

CI описан в `.github/workflows/ci.yml`. Защиты веток и факт удалённого запуска
проверяются отдельно. Сканер истории `bash scripts/scan-secrets.sh` требует Linux
x86_64 и существующего Git HEAD, скачивает закреплённый gitleaks с проверкой checksum.
Он не заменяет проверку незакоммиченных файлов перед коммитом.

## Ограничения

Актуальный статус, результаты и блокеры этапа 1 — `docs/STAGE-1.md`.
В частности, известный high advisory node-forge в инструментах Expo не считаются исправленными
потому, что они не входят в серверный runtime. Политика аудита не ослаблена.

Секреты не коммитить. Сторонние inputs/references не публиковать автоматически.
Данные PostgreSQL сохраняются в named volume; обычная остановка:
`docker compose -f infrastructure/compose.yaml stop`. Не использовать `down -v`,
если не намерены удалить локальные данные.

Начать с `docs/HANDOFF.md`, `docs/DECISIONS.md` и `docs/ROADMAP.md`.

## Независимый дизайн-прототип

Путь `/design-preview` — клиентская главная web/demo: демонстрационные товары,
поиск, категории, карточка и локальный подбор. Метраж выбирается плитками 1–18 м;
это не обещание наличия. Ссылка входа ведёт на настоящий demo-аккаунт `/account`.
Сам дизайн-каталог использует fixtures; отдельный `/catalog-lab` читает API.
Цен/остатков нет даже в fixtures, заказы и платежи не создаются. Автомобильный hero —
оригинальная AI-концепция, не фотография реального товара или гарантия цвета.

```sh
pnpm install --frozen-lockfile
pnpm build:admin
pnpm exec playwright install chromium
pnpm test:design
```

Playwright сам запускает production-сервер на свободном порту 3100 и останавливает
только его после проверок. `DESIGN_PREVIEW_BASE_URL` позволяет проверить отдельно
запущенный сервер. В текущем cloud Chromium уже установлен: вместо загрузки
используется `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`.
Скриншоты/trace сохраняются в игнорируемый `test-results/design-preview`; в CI
это artifact `design-preview-browser-results`. Job `design-preview` проверяет
только независимый визуальный прототип, а общий `quality` продолжает блокироваться
на node-forge. Никакой автоматической публикации или обхода gate нет.

Команды build явно задают `NODE_ENV=production`, dev — `development`, чтобы
локальный `.env` API не ломал сборку Next/Expo. Тестовый подбор сбрасывается при
перезагрузке страницы; сохранение коммерческой корзины и рабочего заказа не реализовано. Demo-сессия
аккаунта сохраняется в защищённой cookie, её статус читается из БД.

Для исправления GHSA-mrhx-c7xc-m3w5 задан scoped override Expo CLI на Zod 4.6.7.
`pnpm test:tooling` проверяет фактическую зависимость CLI, его схемы и security
regression; команда включена в обязательный `test:unit`. Это проверенная
совместимость конкретных путей, не обещание поддержки Expo semver/native/MCP transport.

## Актуальные правила и зависимости

Цены и наличие разрешены только после одобрения менеджером. Внутренние правила
`packages/contracts/src/sale-rules.ts` проверяют свежий полный снимок одного SKU;
при ≤2 целых рулонах Color/Color Ultima запрещают любые отрезы, включая готовые.
Это подготовка для адаптера, не действующий обмен или offers API. Резерв ожидания
оплаты заказчик исключил; процесс изменения заказа ещё согласуется.
Программист и тестовая база 1С обещаны, но пока не предоставлены. Подробности:
[DECISIONS.md](docs/DECISIONS.md), [INTEGRATION-1C.md](docs/INTEGRATION-1C.md).

Визуальный ориентир web-интерфейса обновлён по присланным скриншотам LIMÉ:
белые внутренние экраны, линейные поля, прямые кнопки и полноэкранная главная.
Детали: [LIME-REDESIGN.md](docs/LIME-REDESIGN.md). Вход остаётся телефон + пароль.

## Интерактивный 3D-стенд

`/configurator3d`: Three.js/WebGL2, автомобиль GLB, вращение, ракурсы, цвета
и три финиша. `pnpm check:3d` проверяет сохранённый ассет, `pnpm test:3d` —
реальный WebGL через Chromium. [Устройство и границы](docs/3D-CONFIGURATOR.md).
Native-встраивание и физические цвета ещё не приняты; цены/наличие не имитируются.
