# VEGA mobile

React Native/Expo клиент в стиле LIMÉ: главная, API-каталог, карточка, локальный
подбор и телефон/пароль с ожиданием одобрения менеджером. Native-сессия использует
SecureStore, публичный подбор — AsyncStorage; web-export хранит bearer только
в памяти. Реальные 1С, цены/наличие, заказ, платежи и SMS ещё не подключены.

Из корня workspace:

```sh
pnpm build:contracts
pnpm --filter @vega/mobile typecheck
pnpm build:mobile
pnpm dev:mobile
```

Указать доступный устройству EXPO_PUBLIC_API_URL. На телефоне localhost не означает
компьютер. Нужны настроенный demo API и соответствующий Expo58 development client.
Инструкции, ограничения и проверка: [MOBILE-CUSTOMER.md](../../docs/MOBILE-CUSTOMER.md).
`build:mobile` проверяет web-export, не создаёт APK/IPA. Native/device validation
и подпись пока не выполнены. Не передавать секреты через EXPO_PUBLIC переменные.

Тестовые сборки из Windows и сценарии реальной приёмки:
[инструкция для устройств](../../docs/MOBILE-DEVICE-ACCEPTANCE.md).
