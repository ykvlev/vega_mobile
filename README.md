# VEGA — мобильное приложение для автомобильных плёнок

Приложение для покупателей и мастеров: каталог, выбор плёнки, подбор метров и рулонов, аккаунт и будущие заказы с интеграцией 1С.

## Где сейчас идёт работа

**Актуальный код — в [feat/studio-choice-memory](https://github.com/ykvlev/vega_mobile/tree/feat/studio-choice-memory), [запрос на слияние №16](https://github.com/ykvlev/vega_mobile/pull/16).**

**Сейчас в работе: этап 7 — 3D. Проверка на телефонах отложена по решению владельца проекта.**

В `main` пока хранится исходная документация этапа 0 и эта навигация. Ветки ниже — последовательные этапы: каждый следующий содержит предыдущую основу. Отдельно от цепочки находится историческая ветка с видео. Ветки ещё не объединены в `main`.

## План по этапам

**[Открыть весь план с критериями и проверками](docs/etapy/README.md)**

| Этап                                                                        | Состояние                                                                                          |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [0. Согласованная основа](docs/etapy/00-osnova.md)                          | Основа записана; уточнения открыты                                                                 |
| [1. Основа проекта и CI/CD](docs/etapy/01-infrastruktura-ci.md)             | Реализовано; аудит блокирует допуск                                                                |
| [2. Интерфейс и мобильная основа](docs/etapy/02-interfeis.md)               | Срез реализован; проверка на телефонах отложена                                                    |
| [3. Товары и доступ покупателей](docs/etapy/03-tovary-dostup.md)            | Частично; ждём 1С                                                                                  |
| [4. Корзина и заказ](docs/etapy/04-korzina-zakaz.md)                        | Только локальный подбор                                                                            |
| [5. Обмен с 1С](docs/etapy/05-obmen-1c.md)                                  | Ожидаем базу и программиста                                                                        |
| [6. Оплата и доставка](docs/etapy/06-oplata-dostavka.md)                    | Не реализовано                                                                                     |
| [7. 3D-конфигуратор](docs/etapy/07-konfigurator-3d.md)                      | В работе: движок, мобильный вход и память выбора готовы; модели/материалы и native-приёмка впереди |
| [8. Контент и сервис](docs/etapy/08-kontent-servis.md)                      | Профиль частично; остальное впереди                                                                |
| [9. Пилот и усиление качества](docs/etapy/09-pilot-kachestvo.md)            | Ещё не начат как этап приёмки                                                                      |
| [10. Выпуск](docs/etapy/10-vypusk.md)                                       | Не начат                                                                                           |
| [11. Обратная связь и следующая итерация](docs/etapy/11-obratnaya-svyaz.md) | После выпуска                                                                                      |

Внутри каждого этапа: цель, выполненное, оставшиеся задачи, критерий завершения и ссылки на соответствующие ветки/PR. Ни один незавершённый этап не помечен готовым ради порядка в списке.

## Навигация по веткам

| Ветка — нажми, чтобы открыть файлы                                                                              | Что находится внутри                                              | Обсуждение и проверки                                |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| [feat/studio-choice-memory](https://github.com/ykvlev/vega_mobile/tree/feat/studio-choice-memory)               | Этап 7: сохранение цвета/поверхности, сброс и возврат в каталог   | [№16](https://github.com/ykvlev/vega_mobile/pull/16) |
| [feat/mobile-3d-studio](https://github.com/ykvlev/vega_mobile/tree/feat/mobile-3d-studio)                       | Этап 7: мобильный вход, изоляция сцены, ошибки и CI               | [№15](https://github.com/ykvlev/vega_mobile/pull/15) |
| [feat/3d-configurator](https://github.com/ykvlev/vega_mobile/tree/feat/3d-configurator)                         | Этап 7: настоящий 3D, материалы, камера, оптимизация и тесты      | [№14](https://github.com/ykvlev/vega_mobile/pull/14) |
| [feat/mobile-device-preparation](https://github.com/ykvlev/vega_mobile/tree/feat/mobile-device-preparation)     | Этап 2: тестовые сборки, native prebuild и приёмка на устройствах | [№13](https://github.com/ykvlev/vega_mobile/pull/13) |
| [feat/mobile-customer-app](https://github.com/ykvlev/vega_mobile/tree/feat/mobile-customer-app)                 | Мобильный клиент: каталог, подбор и аккаунт на React Native       | [№12](https://github.com/ykvlev/vega_mobile/pull/12) |
| [feat/lime-redesign](https://github.com/ykvlev/vega_mobile/tree/feat/lime-redesign)                             | Редизайн клиентского интерфейса по референсам LIMÉ                | [№11](https://github.com/ykvlev/vega_mobile/pull/11) |
| [feat/customer-alignment](https://github.com/ykvlev/vega_mobile/tree/feat/customer-alignment)                   | Одобрение клиентов и правила продаж по решениям заказчика         | [№10](https://github.com/ykvlev/vega_mobile/pull/10) |
| [docs/customer-decisions-20261026](https://github.com/ykvlev/vega_mobile/tree/docs/customer-decisions-20261026) | Решения заказчика и обновлённый план интеграции с 1С              | [№9](https://github.com/ykvlev/vega_mobile/pull/9)   |
| [feat/product-photos](https://github.com/ykvlev/vega_mobile/tree/feat/product-photos)                           | Фотографии товаров и безопасная публикация                        | [№8](https://github.com/ykvlev/vega_mobile/pull/8)   |
| [feat/desktop-admin](https://github.com/ykvlev/vega_mobile/tree/feat/desktop-admin)                             | Архивный стенд менеджера: редактирование каталога                 | [№7](https://github.com/ykvlev/vega_mobile/pull/7)   |
| [feat/account-ui](https://github.com/ykvlev/vega_mobile/tree/feat/account-ui)                                   | Экран аккаунта: вход, регистрация и профиль                       | [№6](https://github.com/ykvlev/vega_mobile/pull/6)   |
| [feat/demo-auth](https://github.com/ykvlev/vega_mobile/tree/feat/demo-auth)                                     | API входа и регистрации по телефону и паролю                      | [№5](https://github.com/ykvlev/vega_mobile/pull/5)   |
| [feat/public-catalog](https://github.com/ykvlev/vega_mobile/tree/feat/public-catalog)                           | Публичный каталог из API и PostgreSQL                             | [№4](https://github.com/ykvlev/vega_mobile/pull/4)   |
| [feat/ui-video](https://github.com/ykvlev/vega_mobile/tree/feat/ui-video)                                       | Видео первого прототипа интерфейса                                | [№3](https://github.com/ykvlev/vega_mobile/pull/3)   |
| [feat/stage-2-design-preview](https://github.com/ykvlev/vega_mobile/tree/feat/stage-2-design-preview)           | Первый прототип интерфейса и проверки в браузере                  | [№2](https://github.com/ykvlev/vega_mobile/pull/2)   |
| [feat/stage-1-bootstrap](https://github.com/ykvlev/vega_mobile/tree/feat/stage-1-bootstrap)                     | Этап 1: основа проекта и CI — выпуск заблокирован аудитом         | [№1](https://github.com/ykvlev/vega_mobile/pull/1)   |

## Что уже можно посмотреть

- [Память выбора 3D, сброс и возврат в каталог](https://github.com/ykvlev/vega_mobile/pull/16).

- [3D внутри мобильного клиента: реальный browser-скриншот](https://github.com/ykvlev/vega_mobile/blob/feat/mobile-3d-studio/docs/media/mobile-3d-studio.png).
- [Мобильная интеграция, ограничения и запуск студии](https://github.com/ykvlev/vega_mobile/blob/feat/mobile-3d-studio/docs/3D-CONFIGURATOR.md).

- [3D: скриншот компьютера](https://github.com/ykvlev/vega_mobile/blob/feat/3d-configurator/docs/media/3d-studio-desktop.png).
- [3D: скриншот мобильного размера](https://github.com/ykvlev/vega_mobile/blob/feat/3d-configurator/docs/media/3d-studio-mobile-carmine.png).
- [Устройство 3D-стенда и дальнейший план](https://github.com/ykvlev/vega_mobile/blob/feat/3d-configurator/docs/3D-CONFIGURATOR.md).
- [Кандидаты седанов и кроссоверов](https://github.com/ykvlev/vega_mobile/blob/feat/3d-configurator/docs/CAR-MODEL-CANDIDATES.md).

- [Главная мобильного клиента](https://github.com/ykvlev/vega_mobile/blob/feat/mobile-customer-app/docs/media/native-home.png).
- [Каталог мобильного клиента](https://github.com/ykvlev/vega_mobile/blob/feat/mobile-customer-app/docs/media/native-catalog.png).
- [Вход в аккаунт](https://github.com/ykvlev/vega_mobile/blob/feat/mobile-customer-app/docs/media/native-login.png).
- [План разработки](https://github.com/ykvlev/vega_mobile/blob/feat/mobile-customer-app/docs/ROADMAP.md).
- [Актуальное состояние и следующий шаг](https://github.com/ykvlev/vega_mobile/blob/feat/mobile-customer-app/docs/HANDOFF.md).
- [Как запустить проект](https://github.com/ykvlev/vega_mobile/blob/feat/mobile-customer-app/README.md).
- [Сборка из Windows и приёмка на телефонах](https://github.com/ykvlev/vega_mobile/blob/feat/mobile-device-preparation/docs/MOBILE-DEVICE-ACCEPTANCE.md).
- [Устройство мобильного клиента и границы проверки](https://github.com/ykvlev/vega_mobile/blob/feat/mobile-customer-app/docs/MOBILE-CUSTOMER.md).
- [Автоматические проверки CI](https://github.com/ykvlev/vega_mobile/actions).

Скриншоты получены из работающих React Native-компонентов через браузер. Установка и проверка на физических iPhone/Android ещё предстоят.

## Что ещё ожидаем

Тестовую базу и программиста 1С, материалы заказчика и брендбук. Реальные цены, остатки, обмен, заказы, эквайринг и доставка пока не подключены. Сотрудники будут работать в 1С, отдельная админка исключена; старый desktop-стенд сохранён только для тестов.

CI запускается при отправке коммитов и запросах на слияние. Известная уязвимость `node-forge` пока блокирует общий аудит; проверка не отключена. Черновики и удачные отдельные проверки не означают готовность к выпуску.

Технические имена веток, файлов, команд и библиотек сохранены для совместимости. Описания для просмотра проекта приведены на русском.
