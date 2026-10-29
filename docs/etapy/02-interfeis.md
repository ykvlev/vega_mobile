# Этап 2. Интерфейс и мобильная основа

Статус на 29 октября 2026: **Реализован проверяемый срез**.

## Цель

Создать навигацию и визуальную систему покупательского приложения.

## Что сделано

Референс LIMÉ, автомобильная главная, белые экраны, каталог, карточка, подбор, вход и профиль на React Native.

Подготовка к устройствам: [PR №13](https://github.com/ykvlev/vega_mobile/pull/13),
[ветка feat/mobile-device-preparation](https://github.com/ykvlev/vega_mobile/tree/feat/mobile-device-preparation).
Добавлены native prebuild обеих платформ, настройки тестовых EAS-сборок,
исправление светлой Android-темы и защита конфигурации endpoint.
[Инструкция Windows и матрица приёмки](https://github.com/ykvlev/vega_mobile/blob/feat/mobile-device-preparation/docs/MOBILE-DEVICE-ACCEPTANCE.md).
Локально прошли 60 unit/tooling, 3 E2E и компиляция JavaScript обеих платформ;
физические устройства и облачные APK/IPA ещё не проверены.

## Что осталось

Принять брендбук, заменить демонстрационные материалы, проверить приложение на iPhone/Android, клавиатуру, доступность и background.

## Где смотреть

- [Ветка feat/mobile-customer-app](https://github.com/ykvlev/vega_mobile/tree/feat/mobile-customer-app).
- [Запрос на слияние №2](https://github.com/ykvlev/vega_mobile/pull/2).
- [Запрос на слияние №11](https://github.com/ykvlev/vega_mobile/pull/11).
- [Запрос на слияние №12](https://github.com/ykvlev/vega_mobile/pull/12).
- [Профильный документ в актуальной ветке](https://github.com/ykvlev/vega_mobile/blob/feat/mobile-customer-app/docs/MOBILE-CUSTOMER.md).
- [Актуальный код целиком](https://github.com/ykvlev/vega_mobile/tree/feat/mobile-customer-app).

## Критерий завершения

Сценарии и состояния приняты; устройство, доступность и размеры экранов проверены. JS export не заменяет запуск на телефоне.

Проверки выполняются при каждом изменении. Этап не считается закрытым только потому, что создан PR или прошёл отдельный тест. Общий аудит зависимостей остаётся блокирующим.

[Все этапы](README.md) · [Предыдущий этап](01-infrastruktura-ci.md) · [Следующий этап](03-tovary-dostup.md)
