# Этап 1: bootstrap

Статус: **BLOCKED**, не принят для продвижения по зависимой цепочке.
Локальные функциональные проверки bootstrap пройдены; security audit блокируется
одним high advisory node-forge в инструментах Expo. Не скрывать и не исключать их из gate.

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
| Unit/tooling | 4 unit + 6 CLI compatibility/security regression PASS, 0 skipped |
| Integration | 5 PASS, 0 skipped: настоящая миграция/fixture/ограничения, guest DTO, транспортный отказ БД, unsafe startup |
| TypeScript, ESLint, Prettier | PASS |
| Сборка API | PASS |
| Next production build | PASS |
| Expo web export | PASS; не native build |
| Внутренние HTTP-запросы | live/ready/catalog 200, admin 200 с ожидаемым текстом |
| Воспроизведение cloud install | PASS |
| Полный dependency audit | FAIL: 1 high node-forge; Zod и multer исправлены |

Независимые retest и границы — STAGE-1-QA.md, STAGE-1-REVIEW.md.
Локальные логи сессии: /workspace/reference-research/stage1, они не требуются
приложению и не являются опубликованными CI артефактами.

## Security blockers

1. GHSA-86w9-cpqp-85rv, node-forge 1.4.0 через инструменты Expo: на момент
   проверки исправленный опубликованный релиз не найден.
2. **ЗАКРЫТО в последующей ревизии:** GHSA-mrhx-c7xc-m3w5, Zod 3.25.76
   в Expo CLI заменён scoped override4.6.7 после проверки реальной совместимости;
   доказательства в последнем разделе. Upstream CLI semver support не заявляется.

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

## Фактическая публикация bootstrap

- Baseline этапа 0: main, commit 9a18b225f3a555586823272190516989fc020c68.
- Bootstrap: ветка feat/stage-1-bootstrap, commit 593688d18918df9f69e3bda0dcd6253d7096eac5.
- Draft PR: https://github.com/ykvlev/vega_mobile/pull/1 — не слит.
- Реальный push CI: https://github.com/ykvlev/vega_mobile/actions/runs/40082362353
- Реальный PR CI: https://github.com/ykvlev/vega_mobile/actions/runs/40082401387

Оба run завершились FAILURE: установка, scanner, миграции, форматирование, lint,
типы, unit/integration и три сборки SUCCESS; audit FAILURE. В скачанном журнале
push run подтверждены оба указанных GHSA и `Severity: 2 high`. Пропущен лишь
служебный post setup-node, не обязательные тесты. Последующая штатная нормализация
Expo tsconfig/удаление expo-env при отключённых typed routes прошла независимый
typecheck и review; после commit/push ей требуется новый CI, смотреть PR checks.

Branch protection не прочитан/не настроен: API возвращает 403 Resource not
accessible by integration. Для required quality/review нужны Administration
permissions соответствующего GitHub-подключения либо ручная настройка владельцем.
Нельзя утверждать, что main технически защищена. В репозитории пока один владелец:
для внешнего обязательного одобрения нужен отдельный reviewer.

Сохранён draft cloud-конфигурации: install_script, start_skill и добавления
binaries.prisma.sh, api.github.com, results-receiver.actions.githubusercontent.com
с сохранением прежних доменов. Это не публикация snapshot; для будущих задач
проверить и сохранить изменения в environment settings, затем опубликовать среду.

Штатный Metro startup в offline/CI режиме проверен: /status200 и /200 с VEGA.
Необязательный standalone desktop React Native DevTools попытался использовать
readonly HOME cache и переключился на fallback. Native debugger не проверен;
это ограничение headless cloud, не выданное за успешную нативную сессию.

## Исправление Zod: последующая ревизия

GHSA-mrhx-c7xc-m3w5 закрыта: scoped override `@expo/cli>zod=4.6.7` использует
настоящий опубликованный upstream fix, lockfile больше не содержит Zod3.
Это major вне диапазона Expo CLI, поэтому совместимость доказана для проверенных
путей, а не выдана за upstream semver guarantee. Полный native/live MCP не проверен.

Добавлены шесть обязательных `test:tooling`: реальные схемы установленного CLI,
plugin text/image/audio output, MCP schema без transport, error handling и security
regression — oversized bounded array отвергается до обработки элементов.
Без override тесты воспроизвели отказ; после установки 6/6 PASS, без подмены модулей
или re-export Zod3. Root unit теперь выполняет 4 основных + 6 tooling tests.

На реальной итоговой установке: frozen install PASS, mobile export PASS, свежий
dev HTTP200 с VEGA, тестовый процесс остановлен. QA/security/критик независимо
проверили версии и tooling tests. Полный audit содержит ровно один HIGH forge,
Zod advisory отсутствует. CI теперь запускает **полный** audit workspace включая
dev dependencies; исключений нет. После push нужны новые PR checks на новом SHA.

Forge source-only fix исследован: PR1152/1158 ещё не приняты upstream.
Official main имеет version bump1.4.1-0 без устранения вложенной ASN.1 проверки,
поэтому такой prerelease не используется ради исчезновения advisory. Требуется
принятый проверяемый upstream fix/release; собственная криптография не пишется.
Итого этап1 всё ещё BLOCKED одним security finding.
