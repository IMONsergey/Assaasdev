# APCOSYS SaaS — сценарии, источники и границы приёмки

Дата: 23 октября 2026. База сравнительного чтения: `83b2a3a20ca5d81b1b8f232d6351ce2bf5c4455c`, репозиторий `IMONsergey/Assaasdev`.

Этот документ сопоставляет исходные исследования с текущим frontend. Статус «есть в исходнике» не означает пройденную браузерную или промышленную проверку. Окончательные результаты текущего релиза фиксируются отдельно после интеграции изменений всей команды.

## 1. Источники действительно найдены и прочитаны

| Источник | Что прочитано и использовано | Идентификатор исходного файла в ChatGPT Library |
|---|---|---|
| `APCOSYS_Deep_Scenarios_2026-10-19.md` | Модель объекта/сервиса/наблюдения, счётчики, запросы, большие данные, файлы, сканер, аккаунт, деньги; границы реестра из 304 проектных сценариев | `libfile_4301f504475c8191b15f81cc8f7d9394` |
| `APCOSYS_Deep_UX_Audit_2026-10-20.md` | Зафиксированные в прежнем продукте проблемы и требования ко всем семействам поиска, данным, ресурсам и общим состояниям | `libfile_9c9df8d7de708191acdbcf5c748153ae` |
| `APCOSYS_Current_Implementation_Defects_2026-10-20.md` | Начальные разделы о причинах дефектов, query ownership и асинхронности; исторические дефекты не объявлялись багами новой реализации без чтения кода | `libfile_90a06becc1588191ad5c3370ef26ccc7` |
| `APCOSYS_Product_Reconstruction_Figma_Master_2026-10-20.md` | Архитектура, правила поиска/данных/операций и все 38 маршрутов AC-01…AC-38, строки 1307–1806 | `libfile_ba0c31c3db848191bf90b161c1d149b4` |
| `web-api.md`, 22 октября | Введение и назначение website API, WebSocket envelope, профиль `/whoami`, поля ресурсов и отличия новой документации от исторического scope | `libfile_3e4c30b325408191934d8e043f9f06ac` |
| `web-api.ru.md`, 22 октября | Стоимости, доступ, метаданные, guest quota, кредиты плана, server pushes и поисковый запрос; особенно строки 226–405 | `libfile_506c046a22a481918a39ded2ca717cec` |

`APCOSYS-Audit-2026-10-23.md` также найден и просмотрен по структуре: это аудит маркетингового `apcoseb-clear`, а не данного SaaS. Его проблемы локализации, промоблоков и GSAP нельзя автоматически переносить в `Assaasdev`.

В текущем репозитории прочитаны [API integration](../API-INTEGRATION.md), [implementation coverage](../IMPLEMENTATION-COVERAGE.md), [frontend contract](../FRONTEND-CONTRACT.md) и исходники соответствующих feature-модулей. Новая API-документация от 22 октября имеет приоритет над восстановленными предположениями 19–20 октября. Например, старое исследование не подтверждало ротацию API-ключа, а новый контракт явно содержит `regenerate_api_key`; работающую реализацию этой операции удалять не следует.

## 2. Реальная глубина исходного исследования

Figma Master различает 61 экранный контракт, 548 визуальных состояний, 1082 перехода и исторический каталог из 3868 сценарных строк. Это разные единицы. Источник прямо маркирует исторические комбинации как **NOT_RUN** и не считает их промышленными тестами.

Требование про «все сценарии» следует проверять по конечному реестру маршрутов и инвариантов, а не объявлять бесконечный набор входов и событий проверенным. Для текущего продукта нужны минимум: основной путь; пусто; неверный ввод; loading; поздний ответ; partial; network failure; session expired; доступ запрещён; нулевой ресурс; неизвестный исход изменяющей операции; восстановление; клавиатура; узкий экран; длинные данные.

## 3. Токены и шкала: точная семантика

Новый контракт различает следующие значения:

- `credits`: полученный остаток поисковых кредитов. В metadata появляется после фактического списания; отсутствие поля не означает ноль.
- `scan_credits`: отдельный ресурс приватных сканов.
- `purchased_credits`: отдельное целое поле профиля. Документация показывает его в примерах, но **не описывает**, включён ли он в `credits` и какой баланс расходуется первым.
- `subscription.credits` / `subscription.scan_credits`: включённое в план количество; это основание сравнения, а не доказанный первоначальный баланс текущего периода.
- `balance`: денежный остаток; не складывается с кредитами.
- `guest_access.remaining_daily_searches`: остаток тарифицируемых вызовов гостя. Дневной лимит — 20, сутки UTC; отдельный analytics/detail вызов также может расходовать квоту.

Состав планов по API-документу: Free — 500, Plus — 25 000, Expert — 250 000, Business — 1 500 000 поисковых кредитов; Business — 327 680 scan credits. Однако интерфейс должен использовать переданные сервером значения плана, когда они есть, и не подставлять исторические числа как текущую договорённость аккаунта.

Корректная шкала — **остаток относительно включённого количества** с полным числом рядом. При остатке выше allocation визуальная ширина ограничивается 100%, а подпись сохраняет фактическое число и не утверждает, что весь баланс куплен или весь период не использован. При неизвестном/нулевом allocation процент не вычисляется. Это не «процент израсходованного» и не точный расчёт `allocation − remaining`. `purchased_credits` показывается отдельно без прибавления или вычитания.

Member расходует баланс владельца команды. Metadata общей ссылки описывает автора ссылки и не должна заменять глобальный остаток пользователя. Для `full_access` нельзя придумывать числовой unlimited balance. Сам индикатор должен быть настоящей доступной кнопкой, открывающей подробности и переход к существующим тарифам/пакетам.

## 4. Приоритетные разрывы, найденные в базе

| ID | Приоритет | Наблюдение по исходнику базы | Корректное действие |
|---|---|---|---|
| UX-01 | P1 | В шапке остаток был только некликабельным текстом; шкала отсутствовала | Вернуть кнопку, шкалу с честным denominator, раздельные ресурсы и переход к пакетам |
| UX-02 | P1 | `BillingPage` хранит выбор/период только в `useState`; Sign in возвращает на `/billing` без заказа | Сохранять только несекретный plan/pack/cadence intent и восстанавливать review после входа; не запускать платёж автоматически |
| UX-03 | P1 | Account sign-in возвращает всегда в `/account`, теряя `/account/security` и `/account/sessions` | Сохранять исходный локальный подраздел и параметры |
| UX-04 | P1 | Поля OTP имеют `maxLength=6`; вставка `012 345` может обрезаться до нормализации | Удалять только пробелы вставки, сохранять ведущие нули, валидировать полное значение; opaque reset code не переопределять |
| UX-05 | P1 | `ProfilePanel` после unknown verify блокирует форму без чтения текущего состояния | Дать явный Check current state; сопоставить полученный профиль с ожидаемыми email/username; не повторять mutation автоматически |
| UX-06 | P1 | `NotificationsPage` вызывает `toISOString()` на непроверенном `created_at` | Ошибка одной даты не должна уронить страницу; показать нейтральную подпись |
| UX-07 | P2 | `HostPage` на mobile прокручивает к сервису, но не предлагает явно вернуться к списку | Список → детали → назад к тому же фильтру/странице/выбору/позиции |
| UX-08 | P2 | `ExposedData` рендерит весь `field_value` сразу; прочие вложенные массивы также не ограничивают DOM | Ограниченное видимое окно с доступом ко всем полученным записям, без молчаливого обрезания |
| UX-09 | P2 | Facet click просто дописывает leaf в верхний AND; повтор создаёт дубликаты | Явный выбранный state, удаление/toggle и понятная OR-семантика нескольких значений одного простого фасета; сложные группы не переписывать молча |
| UX-10 | P2 | `DataValue` объединяет undefined/null/empty string в «Not observed» | Не выдавать отсутствие поля за факт отсутствия наблюдения; zero/false сохранять; unknown/restricted/errors различать по реальным данным |
| UX-11 | P2 | `team_member_added` называется «Team invitation» | Называть добавлением в команду: email invitation API отсутствует |
| UX-12 | P2 | Session list не валидирует форму массива до `.some/.map` | Локальная читаемая ошибка с Refresh вместо падения всего account screen |
| UX-13 | P2 | Owner может отправить свой ID или уже видимого участника; whitespace-only username проходит HTML required | Inline validation известных неверных значений, сохранение ввода; сервер остаётся источником разрешений и актуальности |
| UX-14 | P2 | Часть последовательностей хранит возвращаемый query, но позиция/состояние списка не имеют единого восстановления | Адресная проверка Back/Forward и возврата от объекта/диалога на desktop/mobile; не имитировать готовность наличием ссылки Back |

Это исходные разрывы базы. Их итоговый статус должен обновляться только по фактически интегрированному коду и текущим тестам. Визуальные выводы требуют свежих скриншотов; этот документ не подменяет браузерный аудит.

## 5. Матрица всех 38 AC-маршрутов

Легенда: **Source** — существующая реализация найдена в коде, но свежий полный runtime-проход этим документом не заявляется. **Gap** — указан конкретный разрыв базы. **Mock Firefox PASS** — прошли только явно перечисленные браузерные случаи с подменой HTTP/WS ответов. **Integration** — итог требует настоящего серверного окружения и/или тестового провайдера. Эти статусы могут сочетаться.

| AC | Маршрут исходного исследования | Покрытие в текущем frontend / необходимая проверка |
|---|---|---|
| 01 | Первый вход, ориентация, ограниченный раздел | Source: shell, guest/sign-in, gates. Проверить 320 px, увеличенный текст, короткую высоту и клавиатуру |
| 02 | Exact domain против full text | Source: free text и structured leaf отдельно. Integration: реальные match results; не выводить причину совпадения без provenance |
| 03 | IPv4, IPv6, IDN, CIDR, URL | Source: query codec/type controls. Проверить длинные значения, link round-trip; не выдавать free text за автоматически распознанный exact host |
| 04 | Draft → Apply / Cancel / chip / Clear / Back | Source: отдельный draft и applied; Gap UX-09/14. Проверить, какой draft применяет type/facet action |
| 05 | AND в одном сервисе и в разных | Source: recursive conditions/demo fixtures. Integration: real nested semantics; гипотезы не превращать в server guarantee |
| 06 | NOT, missing, partial | Source: boolean groups и missing-представление. Gap UX-10; Integration: смысл отрицания и completeness |
| 07 | Первая/последняя страница, plan cap, Back | Source: page/size caps, неизвестный total не придуман. Gap UX-14; проверить, что смена условий возвращает на первую страницу |
| 08 | Многозначный фасет, исключение, selected value, отказ analytics | Source: независимый stream. Gap UX-09, поиск по длинным facet values; результат hosts должен остаться видимым |
| 09 | Short/deep link, malformed query, reload | Source: codec, share forms, explicit malformed error. Integration: `/s`, guest bootstrap, bound payload и реальный use budget |
| 10 | A/B requests, поздний ответ, Browser Back | Source: query keys, abort/generation separation. Проверить фактическое переставление ответов, facets отдельно |
| 11 | 1000 сервисов, numeric sort, последняя запись | Source: 25-row local pagination, stable UI keys, fixture 1000. Gap UX-07; проверить последнюю запись на keyboard/mobile |
| 12 | 50/1000 partial и unknown total | Source: подпись received records, локальная область фильтра. Integration: backend completeness metadata; не изобретать endpoint догрузки |
| 13 | TCP/UDP, SNI, несколько наблюдений | Source: service key включает port/transport/protocol/context/time. Integration: серверная identity и неоднозначные дубликаты |
| 14 | Выбор после sort/filter/refresh | Source: выбранный key и сообщение исчезновения. Проверить URL/Back/selection и выбранный элемент вне фильтра |
| 15 | Длинные/повреждённые HTTP/TLS/raw | Source: текстовый React render, raw preview/full dialog. Gap UX-08; проверить длинные SAN, headers, управляющие символы, clipboard denial |
| 16 | zero / false / empty / missing / restricted / error | Source: zero/false сохраняются, hidden fields отдельно. Gap UX-10; ни одна недоступная часть не должна считаться «безопасной» |
| 17 | Независимые DNS/WHOIS/date/source | Source: независимые section states. Integration: реальные response shapes, dates и partial errors |
| 18 | CVE без выдуманной уверенности | Source: product → CVE, нет заявления «no vulnerabilities». Проверить score=0/missing и разные CVE разных сервисов |
| 19 | Files keywords/stopwords/size/date/extension | Source: полный filter model и validation. Проверить 0 bytes, UTC bounds, reversed range, Unicode, long path |
| 20 | Files → Buckets → bucket → Back | Source: две единицы и drilldown. Gap UX-14; сохранить исходные фильтры/вид/страницу, не показывать чужой applied scope |
| 21 | Export mode/format/count boundaries | Source: согласованные ограничения и endpoint. Проверить 0/1/max/max+1/full CSV; актуальный API default имеет приоритет над старым макетом |
| 22 | Stream failure, cancellation, changed query | Source: bounded buffer/native stream, interrupted state. Integration: настоящие headers/Range/save semantics; handoff не означает saved-to-disk |
| 23 | Scanner targets/1000 ports/CSV/review | Source: normalization, exact review, BigInt estimate, malformed-row report. Проверить /99, /31-/32 uncertainty, repeated targets, last range |
| 24 | Task checks/status/partial/repeat | Source: raw status, distinct counts, opt-in refresh, six-field cron. Integration: timezone и actual scanner; не обещать exact every-N-days по календарному step |
| 25 | Один IP в public/task A/task B, private export | Source: dataset/task IDs во всех запросах. Integration: ACL/revocation/share recipient; late responses/cache actor separation |
| 26 | Remove task/results/schedule; unknown | Source: разные операции и confirm ID; reconcile вместо автоматического повтора. Integration: реальные эффекты scanner |
| 27 | Login/202/verify/recovery | Source: отдельные HTTP steps/reducer. Gap UX-03/04/13; проверить paste/autofill, whitespace, session verification после ACK |
| 28 | Google/Telegram cancel/error/delayed callback | Source: Google entry, disabled Telegram без настройки. Integration: bot/widget/callback configuration. Невыполненный внешний flow не маркировать PASS |
| 29 | TOTP, backup codes, sessions | Source: local QR, one-time codes retained, unknown check, terminate current distinction. Gap UX-04/12; настоящие enrollment secrets не писать в evidence |
| 30 | Profile email/password/linking | Source: update/verify separate. Gap UX-05; проверять expected profile after unknown; provider linking requires Integration |
| 31 | Owner/Member/User ID, conflicts | Source: existing-user add/remove/leave, no invitations. Gap UX-11/13; server full_access следует metadata, не hardcoded role name |
| 32 | Plan/cadence/promo/order survives login | Mock Firefox PASS: anonymous Annually + Plus → login → Plus annually review ($480); Research Pack → login → тот же пакет 100 000 credits ($180), без периода подписки. В обоих случаях только HTTP login и WS `user_billing`, без автоматических purchase mutation; текущий план Free сохраняется. Дополнительно same-route Back после явного mock checkout другого пакета восстанавливает Plus без прежней payment link/promo/currency/discount и без повторного checkout. Integration: реальная цена/скидка и provider purchase. В URL сохраняется только plan/pack/cadence, без секретов и payment link |
| 33 | Нулевые ресурсы, before/after/stale | Source: metadata provenance and timestamp guard. Gap UX-01; не складывать purchased_credits без документированной семантики |
| 34 | Payment unknown, callback twice | Source: pending/unknown/explicit check, нет automatic mutation retry. Integration: sandbox progression/idempotency; callback ≠ paid |
| 35 | Paid → entitlement pending → access; history/portal | Source: confirmation + billing/profile refresh. Integration: реальная выдача доступа, provider portal и invoice history |
| 36 | API key/docs, notifications read race | Source: masked key/copy/rotation, paged notifications and ACK. Gap UX-06/11; новый notification после mark-all не скрывать |
| 37 | Полный путь keyboard/narrow screen | Source: dialog/focus/tabs, responsive CSS. Gap UX-07/14; обязательно свежий runtime-проход, а не вывод из CSS |
| 38 | Partial failure/reconnect/two tabs/actor switch | Source: isolated request lanes, principal cache clear. Integration: реальные cookie/WS disconnects; моделируемые client checks маркируются отдельно |

## 6. Адресные исправления Auth/Account в этом проходе

Пакет содержит адресные изменения `src/features/auth/**`, `src/features/account/AccountPage.tsx` и pending-2FA guard в `src/app/App.tsx`:

1. Код подтверждения принимает вставку с пробелами и не теряет ведущие нули. Код восстановления остаётся opaque по контракту. Переключение TOTP/backup очищает несовместимый ввод.
2. Whitespace-only username/identifier получает понятное сообщение до запроса. На 2FA появляется фокус в поле кода.
3. Account sign-in сохраняет конкретный подраздел. Выбор guest не уничтожает локальный return context.
4. Неопределённый результат profile verification имеет действие чтения состояния; ожидаемые email/username сравниваются с `/whoami`. Никакая изменяющая операция не повторяется автоматически.
5. Profile/password поля не меняются во время отправки; verification явно показывает ожидаемый профиль, сохраняя текущий подтверждённый до ACK.
6. Session payload проверяется до рендера. Неполный список получает локальное сообщение с повторным чтением.
7. Собственный и уже присутствующий User ID получают inline error; подтверждённый `metadata.full_access` учитывается в клиентском team gate. Последнее решение остаётся у сервера.
8. Внутренняя навигация Account сохраняет фокус выбранной вкладки после смены URL и mount. Согласованное `preserveTabFocus` запрещает общему navigation effect перемещать фокус в main и сбрасывать прокрутку.
9. Pending-2FA guard использует общий `safeReturnPath`, принимает `returnTo`, `next` и navigation state; legacy `/login` также сохраняет state при перенаправлении.

Проверка этого пакета: `npm exec vitest run src/features/auth/auth-state.test.ts` — **9/9 PASS**; `npm run typecheck` — **PASS**; `git diff --check` — **PASS**.

Отдельно `tests/e2e/auth-return.spec.ts` — **8/8 PASS в Firefox** на локальном приложении с подменой HTTP/WS ответов: login 202 → вставка `012 345` → отправка строки `012345`; существующая pending-2FA с deep link, query/hash и перезагрузкой challenge; варианты `next` и legacy `/login`; pending-2FA, обнаруженная после перехода по настоящей ссылке Forgot password с navigation-state return context; возврат в `/account/sessions?view=all` после входа; явный guest → исходный локальный экран без скрытого login; последовательные ArrowRight, Home/End и wrap-around в Account tabs. Подтверждены фактические адреса, выбранные вкладки, клавиатурный фокус и HTTP bodies. Реальные email/TOTP backend, cookie-policy и внешний auth provider этим прогоном не проверялись. Эти результаты не заменяют финальный браузерный прогон всего релиза.

`tests/e2e/billing-return.spec.ts` — **3/3 PASS в Firefox**, адресная проверка AC-32 с `seedPricing()` и подменой HTTP/WS. Проверены восстановление годового Plus и отдельного credit pack после входа, суммы review, отсутствие автоматического checkout/invoice/payment запроса, сохранение текущего entitlement до оплаты. Третий случай использует настоящие SPA controls: Plus annual deep link → Cancel → CreditBalance → Plans & credit packs → Research Pack → явный mock `init_checkout` → Close → browser Back. BillingPage остаётся на том же route, восстанавливает Plus annual review, очищает чужую checkout-ссылку, promo/currency/discount; повторной mutation нет. Тесты не обращались к платёжному провайдеру и не создавали реальные покупки.

## 7. Что frontend не может подтвердить самостоятельно

Нужны реальные HTTP/WS origins, cookie/CORS/WS Origin настройки и test identities по планам/ролям. Отдельно остаются email/OAuth/Telegram delivery, sandbox payment → entitlement, scanner status/cron/стоимость, private ACL/revocation, share accounting, полные серверные данные и export stream recovery.

Демо должно оставаться явно маркированным. Синтетический платёж не превращается в реальное списание, queued task — в завершённый скан, локальный массив — в полный промышленный индекс, а 38 строк этой матрицы — в 38 PASS. Отсутствие backend-доступа не мешает довести удобство, адаптивность и безопасные состояния frontend, но ограничивает честный статус готовности продукта.
