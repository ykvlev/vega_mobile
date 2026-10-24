# VEGA mobile: bootstrap

Стартовый Expo Router экран этапа 1, без реализованных торговых функций.

Из корня репозитория после установки общего workspace:

```sh
pnpm --filter @vega/mobile typecheck
pnpm --filter @vega/mobile build
pnpm --filter @vega/mobile start
```

`build` выполняет web export через Metro и проверяет bundling. Это не сборка
Android/iOS и не проверка native release. Для устройств потребуется совместимый
development build; Expo Go не заменяет приёмку подписанной сборки.

React 19.3.0, React Native 0.88.0 и native peer versions выбраны по
`bundledNativeModules.json` пакета Expo 58.0.17. Не обновлять их независимо.
Идентификаторы приложений, EAS и signing ещё не настроены; схема `vega-dev`
используется только для разработки.
