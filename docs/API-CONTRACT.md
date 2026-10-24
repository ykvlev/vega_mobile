# VEGA — нормативный API-контракт этапа 0

Статус: контракт до реализации, не действующее API. Приоритет бизнес-решений —
DECISIONS.md; транспортные соглашения этого файла обязательны для mobile/admin/API.
Ниже закрыты документарные пробелы корзины и recovery; runtime-проверки ещё не пройдены.

## Формат и авторизация

REST `/api/v1`, JSON; идентификаторы UUID, время ISO 8601 UTC. Money:
`{amountMinor: "125000", currency: "RUB"}` — строка целого минимальных единиц;
валюта примера не утверждает валюту production. Длина `lengthMm: "5000"` — целые
миллиметры строкой; рулоны/штуки `count: 1`. Расчёты серверные, без binary float.
Списки `{items, nextCursor}` с ограниченным limit и детерминированной сортировкой.
Приватные ответы требуют сессии и объектных прав, `Cache-Control: private, no-store`.

| Endpoint | Тело / результат |
|---|---|
| POST /auth/register | `{phone, password, customerType: individual\|business}` → созданный аккаунт/сессия |
| POST /auth/login | `{phone, password}` → сессия, одинаковая безопасная ошибка неверных данных |
| POST /auth/refresh | Обновление/ротация сессии по SECURITY.md |
| POST /auth/logout | Отзыв сессии и очистка клиентского приватного кэша |
| GET /me | Собственный профиль, разрешённые данные менеджера |

Телефон нормализуется; пароль не логируется/не возвращается, хранится только
стойкий password hash. Телефон без верификации не считается подтверждённым.
SMS позже и не является prerequisite bootstrap. Перед production нужен безопасный
согласованный recovery аккаунта; нельзя сбрасывать пароль только по знанию номера.
Mobile использует SecureStore, browser — HttpOnly/Secure cookie с CSRF-защитой;
детали транспорта сессии фиксируются при bootstrap без экспорта токенов в shared cache.

## Публичные и закрытые DTO

`PublicProduct = {id, skuId, article, name, categoryId, media, description,
characteristics, rollLengthMm, widthMm}`; коммерческие поля отсутствуют целиком.
`GET /products`, `/products/:id`, `/categories` доступны гостю. Гость не получает
price/stock/availability, stock freshness, фильтры/сортировки по ним или вычисленную
из остатка доступность нарезки. Нет этих данных в HTML/SSR, JSON-LD, ошибках,
публичных файлах/изображениях, поисковых агрегациях и аналитике.

`GET /product-offers?skuIds=...` требует входа и возвращает ограниченный набор:
`{skuId, prices, inventory, saleRules, offerVersion, observedAt}`. `inventory`
указывает свежесть/недоступность без обещания резерва; точные поля количества
фиксируются после обследования 1С. saleRules содержит минимум/шаг, разрешённые
единицы, `cutFromFullRollAllowed`, `readyPieceAvailable`. При <=2 полных рулонах
новая нарезка запрещена, готовые отрезы продавать разрешено. Нужная непрерывная
длина должна помещаться в выбранном отрезе. Минимум/шаг и агрегация складов открыты.

Public DTO нельзя собирать из приватного через скрытие в UI. Offers не кэшируются
shared CDN/Next.js, приватный query cache имеет account scope и очищается при выходе.

## Корзина: отдельная идентичность строки

`CartLine = {lineId, skuId, unit, quantity, version}`. В БД
`unique(cartId, skuId, unit)`. unit — meter/roll/piece. Один SKU метрами и рулонами
существует в двух разных строках. Это не два независимых складских остатка:
совместная доступность проверяется на весь заказ, чтобы не зарезервировать одно дважды.

| Endpoint | Семантика |
|---|---|
| GET /cart | `{cartId, version, lines}`; авторизованный владелец |
| POST /cart/items | `{skuId, unit, quantity, expectedCartVersion}` — установить абсолютное количество, upsert по SKU+unit; вернуть lineId |
| PUT /cart/items/:lineId | `{quantity, expectedLineVersion}`; SKU/unit неизменяемы |
| DELETE /cart/items/:lineId | Удалить только эту строку, expectedLineVersion обязателен |

meter quantity: `{lengthMm: "5000"}`; roll/piece: `{count: 1}`. Несовместимые поля,
нулевые/отрицательные количества и неверный шаг отклоняются. POST не прибавляет
количество при повторе. Изменение единицы — отдельная строка, а не тихая замена.
Гостевой локальный подбор не содержит закрытых данных; объединение при входе
показывает итог и не удваивает количества молча. Корзина не резервирует.

## Quote, версии и доставка

Production quote и submit требуют актуальной проверки доступности в 1С. Нет SKU,
недостаток, stale или unavailable — отказ без создания коммерческого заказа;
сохраняется корзина. Скрытая «принятая заявка» вместо отказа не допускается.
Доступность при submit не является резервом и проверяется вновь перед оплатой.

`POST /order-quotes {cartVersion, customerProfileVersion, deliverySelection}` →
`{quoteId, lines, goodsAmount, deliveryTerms, totalPayable, quoteVersion,
offerVersions, deliveryVersion, expiresAt}`. Quote не является резервом или approval.
Сервер хранит immutable snapshot quote и привязку к пользователю; один quoteId
не создаёт два заказа. Истечение quote блокирует новую операцию, но не replay
уже успешно созданного заказа.

deliveryTerms: `{method, carrier?, recipientRef, addressRef?, pickupPointRef?,
deliveryAmount?, chargedBy: seller|carrier, paymentTiming, deliveryVersion}`.
Адреса/контакты — приватные данные, в заказе сохраняется снимок. Если сумма/метод
не согласованы, payment readiness false; неизвестная стоимость не считается нулём.
Перевозчику оплачиваемая доставка явно отделена от 100% суммы продавцу.
Методы отражают ROADMAP.md; автоматическое API перевозчиков не предполагается.

Версии opaque и сравниваются на равенство: offerVersion — изменения цены/правил
и доступности; quoteVersion — снимок расчёта; orderVersion — согласуемые состав и
сумма; deliveryVersion — условия доставки; paymentTermsVersion — разрешённая к
оплате комбинация. Только stock snapshot версии не доказывают актуальный резерв 1С.

## Заказ, согласование и оплата

| Endpoint | Тело / действие |
|---|---|
| POST /orders | `{quoteId, quoteVersion}` + Idempotency-Key; новая актуальная проверка 1С, затем заказ на согласование |
| GET /orders, /orders/:id | Только владелец/сотрудник с правом; версии, история, payment summary |
| POST /admin/orders/:id/approvals | `{expectedOrderVersion, deliveryVersion}`; менеджер фиксирует окончательные условия |
| POST /orders/:id/acceptance | `{orderVersion, deliveryVersion}`; клиент принимает точные условия |
| POST /orders/:id/payment-attempts | `{orderVersion, deliveryVersion, paymentTermsVersion, method}` + Idempotency-Key; method card/business_invoice |
| GET /orders/:id/payment | Серверный финансовый результат; не lookup по idempotency key |
| POST /admin/orders/:id/transitions | `{expectedOrderVersion, target, reason?}`; только разрешённые переходы |

Нормативная последовательность: submitted/pending_manager → terms_approved →
client_accepted → inventory_confirmation_pending → awaiting_payment → processing
→ ready_for_dispatch → dispatched → completed. Подготовка не подтверждает наличие.
Нет SKU/достаточного остатка 1С — STOCK_UNAVAILABLE; unavailable/stale —
INVENTORY_CONFIRMATION_UNAVAILABLE. При submit отказ не создаёт Order; допустима техническая запись операции/recovery,
но клиент сохраняет корзину и получает ошибку, а не «заказ принят».
До оплаты обязательны актуальная проверка и согласованный резерв 1С, защищающий
от других каналов; внешние вызовы не удерживают длинную SQL-транзакцию.

Изменение состава/суммы/доставки сбрасывает approval/acceptance/payment readiness.
Старую попытку нужно отменить/сверить; поступление по старой версии — исключение,
не разрешение отправить изменённый заказ. Подтверждённый сервером приём 100%
причитающейся продавцу суммы и действующее обязательство на товар разрешают processing.
Частичная оплата счёта отправку не разрешает. Оплата отдельно от fulfillment:
PaymentAttempt created/pending/succeeded/failed/canceled/unknown; Refund отдельно.
Сводный payment state включает unpaid/partially_paid/paid/partially_refunded/refunded.
Return URL/скриншот не proof. Подробности webhook/refund/TTL — PAYMENTS.md.

## Recovery без отдельного lookup endpoint

До первого POST клиент надёжно сохраняет account-scoped endpoint, ключ и исходный
canonical payload в защищённом хранилище; при выходе данные не раскрываются другой
сессии. Для заказа достаточно quoteId/quoteVersion, без копирования реквизитов.
Timeout, lost response и перезапуск → тот же POST/ключ/payload, не новый заказ.
Сервер scope ключа: authenticated subject + operation + key; hash payload,
результат и ресурс связаны транзакционно. Сначала проверить сохранённый результат,
затем новую бизнес-валидацию: истёкший quote не ломает replay успешного заказа.

- Завершено: вернуть тот же resourceId/результат без второго резерва/списания.
- Ещё выполняется: 409 REQUEST_IN_PROGRESS и Retry-After; ограниченный backoff,
  затем повтор того же POST. UI показывает неизвестный результат, не новый checkout.
- Тот же ключ, другое тело: 409 IDEMPOTENCY_CONFLICT, без побочных эффектов.
- Retention ответа истёк: сохранённая ссылка/tombstone возвращает исходный ресурс
  либо 409 IDEMPOTENCY_RECORD_EXPIRED. Нельзя считать старый ключ новой операцией.

Retention response, tombstone, незавершённых операций и recovery window — явные
настройки, принятые до production; чисел пока нет. Не удалять защитную связь раньше,
чем гарантирован отказ старой операции: immutable quoteId уникален на заказ,
истёкший quote не создаёт новый заказ. Аналогично платёжная операция имеет durable
operation identity, привязанную к заказу/версии/попытке; timeout не создаёт следующую
попытку. При истёкшем recovery и неизвестном результате — сверка/поддержка,
не автоматическая выдача нового ключа. Новая попытка — только после доказанного
неуспеха прежней. Очистка данных не должна открывать путь случайному дублю.

## Ошибки и gate

`{error: {code, message, fieldErrors?, retryable}, requestId}` без закрытых значений.
400 VALIDATION_FAILED; 401 AUTH_REQUIRED/INVALID_CREDENTIALS; 403 FORBIDDEN;
404 NOT_FOUND без раскрытия чужих объектов; 429 RATE_LIMITED.
409: VERSION_CONFLICT, PRICE_CHANGED, STOCK_CHANGED, STOCK_UNAVAILABLE,
CUTTING_NOT_ALLOWED, TERMS_NOT_APPROVED, TERMS_NOT_ACCEPTED,
PAYMENT_TERMS_CHANGED, RESERVATION_EXPIRED, REQUEST_IN_PROGRESS,
IDEMPOTENCY_CONFLICT, IDEMPOTENCY_RECORD_EXPIRED. 503:
INVENTORY_CONFIRMATION_UNAVAILABLE, PAYMENT_PROVIDER_UNAVAILABLE.
Quote/new terms возвращать только авторизованному клиенту с правом на объект.

Bootstrap не блокируют неизвестные провайдер, TTL, минимумы и протокол 1С: разрешены
явно тестовые fixtures/параметры без реальных денег. Production BLOCKED до выбора
TTL/retention и минимума/шага, проверки резерва 1С, платежей/счёта, фискальной схемы,
безопасного account recovery и обязательных сквозных тестов.
Документарные критерии: единый lineId и replay protocol согласованы между docs.
Runtime-критерии ещё не выполнены: два unit одного SKU, lost response + restart,
expired quote/key без дубля, конкуренция за остаток, guest-cache leak, approval/
delivery invalidation и запрет отправки при частичном поступлении.
