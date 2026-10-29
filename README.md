# VEGA — мобильное приложение для автомобильных плёнок

Приложение для покупателей и мастеров: каталог, выбор плёнки, подбор метров и рулонов, аккаунт и будущие заказы с интеграцией 1С.

## Где сейчас идёт работа

**Актуальный код — в [feat/mobile-customer-app](https://github.com/ykvlev/vega_mobile/tree/feat/mobile-customer-app), [запрос на слияние №12](https://github.com/ykvlev/vega_mobile/pull/12).**

В `main` пока хранится исходная документация этапа 0 и эта навигация. Ветки ниже — последовательные этапы: каждый следующий содержит предыдущую основу. Отдельно от цепочки находится историческая ветка с видео. Ветки ещё не объединены в `main`.

## Навигация по веткам

| Ветка — нажми, чтобы открыть файлы                                                                              | Что находится внутри                                        | Обсуждение и проверки                                |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| [feat/mobile-customer-app](https://github.com/ykvlev/vega_mobile/tree/feat/mobile-customer-app)                 | Мобильный клиент: каталог, подбор и аккаунт на React Native | [№12](https://github.com/ykvlev/vega_mobile/pull/12) |
| [feat/lime-redesign](https://github.com/ykvlev/vega_mobile/tree/feat/lime-redesign)                             | Редизайн клиентского интерфейса по референсам LIMÉ          | [№11](https://github.com/ykvlev/vega_mobile/pull/11) |
| [feat/customer-alignment](https://github.com/ykvlev/vega_mobile/tree/feat/customer-alignment)                   | Одобрение клиентов и правила продаж по решениям заказчика   | [№10](https://github.com/ykvlev/vega_mobile/pull/10) |
| [docs/customer-decisions-20261026](https://github.com/ykvlev/vega_mobile/tree/docs/customer-decisions-20261026) | Решения заказчика и обновлённый план интеграции с 1С        | [№9](https://github.com/ykvlev/vega_mobile/pull/9)   |
| [feat/product-photos](https://github.com/ykvlev/vega_mobile/tree/feat/product-photos)                           | Фотографии товаров и безопасная публикация                  | [№8](https://github.com/ykvlev/vega_mobile/pull/8)   |
| [feat/desktop-admin](https://github.com/ykvlev/vega_mobile/tree/feat/desktop-admin)                             | Архивный стенд менеджера: редактирование каталога           | [№7](https://github.com/ykvlev/vega_mobile/pull/7)   |
| [feat/account-ui](https://github.com/ykvlev/vega_mobile/tree/feat/account-ui)                                   | Экран аккаунта: вход, регистрация и профиль                 | [№6](https://github.com/ykvlev/vega_mobile/pull/6)   |
| [feat/demo-auth](https://github.com/ykvlev/vega_mobile/tree/feat/demo-auth)                                     | API входа и регистрации по телефону и паролю                | [№5](https://github.com/ykvlev/vega_mobile/pull/5)   |
| [feat/public-catalog](https://github.com/ykvlev/vega_mobile/tree/feat/public-catalog)                           | Публичный каталог из API и PostgreSQL                       | [№4](https://github.com/ykvlev/vega_mobile/pull/4)   |
| [feat/ui-video](https://github.com/ykvlev/vega_mobile/tree/feat/ui-video)                                       | Видео первого прототипа интерфейса                          | [№3](https://github.com/ykvlev/vega_mobile/pull/3)   |
| [feat/stage-2-design-preview](https://github.com/ykvlev/vega_mobile/tree/feat/stage-2-design-preview)           | Первый прототип интерфейса и проверки в браузере            | [№2](https://github.com/ykvlev/vega_mobile/pull/2)   |
| [feat/stage-1-bootstrap](https://github.com/ykvlev/vega_mobile/tree/feat/stage-1-bootstrap)                     | Этап 1: основа проекта и CI — выпуск заблокирован аудитом   | [№1](https://github.com/ykvlev/vega_mobile/pull/1)   |

## Что уже можно посмотреть

- [Главная мобильного клиента](https://github.com/ykvlev/vega_mobile/blob/feat/mobile-customer-app/docs/media/native-home.png).
- [Каталог мобильного клиента](https://github.com/ykvlev/vega_mobile/blob/feat/mobile-customer-app/docs/media/native-catalog.png).
- [Вход в аккаунт](https://github.com/ykvlev/vega_mobile/blob/feat/mobile-customer-app/docs/media/native-login.png).
- [План разработки](https://github.com/ykvlev/vega_mobile/blob/feat/mobile-customer-app/docs/ROADMAP.md).
- [Актуальное состояние и следующий шаг](https://github.com/ykvlev/vega_mobile/blob/feat/mobile-customer-app/docs/HANDOFF.md).
- [Как запустить проект](https://github.com/ykvlev/vega_mobile/blob/feat/mobile-customer-app/README.md).
- [Устройство мобильного клиента и границы проверки](https://github.com/ykvlev/vega_mobile/blob/feat/mobile-customer-app/docs/MOBILE-CUSTOMER.md).
- [Автоматические проверки CI](https://github.com/ykvlev/vega_mobile/actions).

Скриншоты получены из работающих React Native-компонентов через браузер. Установка и проверка на физических iPhone/Android ещё предстоят.

## Что ещё ожидаем

Тестовую базу и программиста 1С, материалы заказчика и брендбук. Реальные цены, остатки, обмен, заказы, эквайринг и доставка пока не подключены. Сотрудники будут работать в 1С, отдельная админка исключена; старый desktop-стенд сохранён только для тестов.

CI запускается при отправке коммитов и запросах на слияние. Известная уязвимость `node-forge` пока блокирует общий аудит; проверка не отключена. Черновики и удачные отдельные проверки не означают готовность к выпуску.

Технические имена веток, файлов, команд и библиотек сохранены для совместимости. Описания для просмотра проекта приведены на русском.
