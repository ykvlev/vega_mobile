# Этап 1 — независимый code review

Проверены root scripts/config, API и миграция Prisma, unit/integration tests,
public contracts, стартовые экраны admin/mobile, GitHub Actions и secret scan.
Review относится к рабочим файлам, а не к опубликованному commit или CI run.
Это не приёмка будущих каталога, аккаунтов, заказов, оплаты или 1С.

## Исправленные замечания

### R1 — Windows: запуск миграций через pnpm.cmd

**Medium, исправлено в коде.** Ранее integration test вызывал
`spawnSync('pnpm', ...)` без Windows-совместимого запуска: `.cmd` shim нельзя
исполнять таким способом как обычный executable.

Теперь [integration.test.mjs](/workspace/vega_mobile/apps/api/test/integration.test.mjs:12)
проверяет существующий JavaScript CLI из `npm_execpath`, а миграция запускается
через `process.execPath` без shell. Командная строка не интерполирует DB URL.
Проверено чтением актуального кода. Windows runtime здесь не запускался;
фактическая воспроизводимость на Windows остаётся отдельной проверкой.

### R2 — integration script не загружал локальный .env

**Medium, исправлено.** Первоначальный root script отличался от `dev:api` и
`db:migrate`: без экспортированного DATABASE_URL тест падал ещё до работы с БД.
Отказ воспроизведён с удалёнными DB environment variables без изменения БД.

Актуальный [package.json](/workspace/vega_mobile/package.json:17) использует
`dotenv -e .env -- ...`. Независимо проверен этот wrapper с очищенным DB env:
переменная загружается, exit 0; значение не выводилось. Это проверка загрузки
конфигурации, а не доказательство повторного прохождения всей integration suite.

## Оставшиеся ограничения допуска

- Известный dependency audit: две high в транзитивных зависимостях Expo CLI,
  исправление совместимыми доступными версиями пока не подтверждено. Проверка
  audit не должна отключаться, а finding — переименовываться в PASS.
- GitHub API отвечает 403: удалённые workflow runs, required checks и protections
  фактически не подтверждены. Наличие YAML не доказывает enforcement.
- Android/iOS native builds и проверка Windows не выполнялись. Web export не
  является доказательством нативной работоспособности.
- В cloud PATH доступен fallback pnpm 11.25.0, который корректно отклоняется
  engines проекта. Команды проверки должны использовать активированный pnpm
  10.34.8; pinned executable доступен вне checkout в `/workspace/.tools` текущей
  среды. Локальная машина обязана установить ту же версию своим способом.

Оркестратор сообщил о пройденных 4 unit и 5 integration проверках, types/lint,
admin build и mobile web export. После исправления runner backend повторил
`pnpm test:integration` с активированным pinned pnpm и локальным .env: PASS,
5 проверок, без пропусков. Это свидетельство команды; reviewer не выдаёт его
за собственный повторный запуск. Windows runtime этим Linux retest не покрыт.

## Вердикт

Новых неисправленных дефектов bootstrap в просмотренном коде не обнаружено.
Первоначальные R1/R2 исправлены; итоговый PASS всего этапа этим review не выдан:
audit, удалённые проверки и применимые runtime gates остаются в своих явных
статусах. Независимая разработка может продолжаться, готовность этапа не следует
объявлять вопреки QA/security gate.
