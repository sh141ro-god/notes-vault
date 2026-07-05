# Notes Vault

Приватное офлайн-first приложение заметок (PWA): данные сильно зашифрованы на покое,
открываются по кодовой фразе. Тонкое ядро + подключаемые модули-фичи.

Стек: React 19 + TypeScript + Vite, libsodium (XChaCha20-Poly1305 + Argon2id),
IndexedDB, vite-plugin-pwa. Хостинг — GitHub Pages.

## Команды

```bash
npm install     # установка зависимостей
npm run dev      # дев-сервер (пустая оболочка)
npm run lint     # строгий ESLint
npm run typecheck# проверка типов (tsc)
npm run build    # production-сборка + service worker
```

## Структура (`src/`)

| Путь | Назначение | Модуль |
|------|-----------|--------|
| `app/main.tsx` | bootstrap: инициализация libsodium, монтирование | M0 |
| `app/di.ts` | composition root (подстановка адаптеров под порты) | M0+ |
| `core/crypto/` | CryptoService, KeyDerivation, Envelope | M1 |
| `core/storage/` | порт Repository + IndexedDB-адаптер, Manifest | M2 |
| `core/vault/` | VaultService (машина состояний), иерархия ключей, авто-лок | M3 |
| `core/registry/` | контракт модулей + реестр (`import.meta.glob`) | M4 |
| `core/shell/` | AppShell, провайдеры, роутинг/меню из контрактов | M4 |
| `core/transport/` | порт TransportTarget + файловый адаптер | M7 |
| `core/types/` | общие доменные типы (брендированные id) | M0 |
| `modules/<name>/` | модули-фичи по контракту `module.config.ts` | M6, M7 |

## Статус

**M0 · Scaffold — готов** (аудит пройден, замечания исправлены).
**M1 · CORE-crypto — готов.** Порты `CryptoService` (XChaCha20-Poly1305) и
`KeyDerivation` (Argon2id) + libsodium-адаптеры, формат `Envelope` с бинарной
сериализацией, генерация recovery-кода (160 бит, Crockford base32). Покрыто
тестами (19 шт.): round-trip, отклонение подделанного тега, уникальность nonce,
детерминизм KDF, формат/энтропия recovery-кода. Крипта собрана в `app/di.ts`.
**M2 · CORE-storage — готов.** Порт `Repository` + IndexedDB-адаптер (через `idb`):
блобы заметок, зашифрованный манифест, открытая `VaultMeta`. zod-схемы
(`Manifest`, `VaultMeta`) валидируют недоверенные данные при чтении с диска.
Хранит только байты, без крипто-логики. Покрыто 9 тестами на `fake-indexeddb`:
put/get/delete/list блобов, round-trip манифеста и VaultMeta (с PIN и без),
отклонение повреждённой записи.
**M3 · CORE-vault — готов.** `VaultService` (машина состояний
setup/unlock·фраза/PIN/recovery/enablePin/changePassphrase/lock/requireKey),
иерархия ключей (случайный DEK + обёртки под фразу/recovery/PIN через Argon2id),
`lockController` (авто-лок по бездействию и сворачиванию). DEK живёт только в
замыкании сервиса и обнуляется при lock; промежуточные ключи затираются
(`memzero`). PIN-обёртка стирается после N неудач → `recoveryOnly`. Argon2id
вынесен в **Web Worker** (UI не блокируется; в Node — прямой адаптер). Покрыто
15 тестами: полный цикл, неверный секрет → отказ, лок-аут PIN, changePassphrase
меняет только обёртку под фразой, DEK не утекает в персист, авто-лок.
**M4 · CORE-registry + shell — готов.** Контракт модулей `ModuleContract` +
`defineModule`; реестр `loadModules` (`import.meta.glob` по
`modules/*/module.config.ts`, без правок ядра); `AppShell`/`Shell` собирают из
контрактов роутинг (react-router 7), меню (по `menu.order`) и провайдеры.
Покрыто 6 тестами: заглушка-модуль появляется в меню и по маршруту, порядок по
`order`, провайдеры оборачивают дерево.
**M5 · CORE-vault-ui — готов.** Реактивный `vaultStore` (useSyncExternalStore)
поверх волта; `VaultGate` монтирует модули только при `unlocked`. Экраны:
Setup (фраза + подтверждение, валидация), однократный показ recovery-кода с
обязательным подтверждением и предупреждением о невосстановимости, Unlock
(фраза/PIN/recovery, PIN скрыт в `recoveryOnly`), кнопка блокировки + авто-лок
по бездействию. Покрыто 12 тестами (стор в node + гейт в jsdom/testing-library):
первый запуск→Setup, существующий→Unlock, recovery один раз→подтверждение
открывает приложение, слабая фраза и неверный секрет → ошибка.
**M6 · FEAT-notes — готов.** Первый модуль-фича (`src/modules/notes/`,
подхватывается реестром): `NoteSchema`/`Note`, `NoteRepository` (шифрование
заметок и манифеста ключом волта поверх `Repository`), markdown-рендер с
**санитайзингом DOMPurify** (защита от XSS через тело заметки), UI `NotesList`
и `NoteEditor` (правка + превью), маршруты `/notes` и `/notes/:id`. Покрыто 14
тестами: CRUD, **блоб на диске зашифрован** (заголовок не виден в шифртексте),
манифест обновляется, операции невозможны при locked-волте, вырезание
script/onerror/`javascript:`, рендер списка и загрузка редактора.

**M7 · FEAT-export-import — готов.** Порт `TransportTarget` + `fileTransport`
(скачивание/загрузка одного файла), формат `VaultExport` (магия + версия) с
кодеком JSON+base64 и zod-валидацией (чужой/битый файл → понятная
`TransportError`). Use-cases `buildVaultExport`/`restoreVaultExport` работают на
уровне шифртекста (ключ волта не нужен для экспорта). UI `/transfer` с
предупреждением о замене. Покрыто 8 тестами: round-trip кодека, отклонение
не-JSON/чужого magic/неполного файла и **e2e**: экспорт → файл → импорт на
другом волте → кодовая фраза → все заметки на месте; импорт заменяет, а не
смешивает данные.

**M8 · CORE-pwa — готов.** Манифест с иконками (PNG 192/512 + maskable),
service worker (Workbox) прекэширует код/оболочку/иконки → офлайн работает,
включая разблокировку и заметки; `navigateFallback` отдаёт SPA-маршруты офлайн.
Обновление по согласию (`registerType: 'prompt'`) с баннером `PwaUpdater`.
Финальный строгий CSP (без инлайн-скриптов — проверено сборкой). Деплой на
GitHub Pages: `.github/workflows/deploy.yml` (build с `BASE_PATH`, SPA-фолбэк
`404.html`, `.nojekyll`).

**Все модули v1 (M0–M8) готовы.** Сквозной сценарий: установить как PWA →
создать волт → войти → вести зашифрованные markdown-заметки (и задачи —
демо-модуль) → перенести волт файлом → работать офлайн. Хранилище обобщено до
коллекций (RFC): новый доменный модуль добавляется без правок ядра.
План — в `../План_реализации_модули.md`.

Команды: `npm run dev | build | lint | typecheck | test`. CI — `.github/workflows/ci.yml`.

### Безопасность доставки (CSP)
- Строгий CSP инжектится **только в прод-сборку** (`prodCspPlugin` в `vite.config.ts`),
  чтобы не ломать HMR в dev. Включает `script-src 'self' 'wasm-unsafe-eval'`
  (обязательно для WASM libsodium) и `style-src 'self'` без `'unsafe-inline'`.
- `frame-ancestors` в `<meta>` браузеры игнорируют, поэтому от кликджекинга стоит
  JS-защита (frame-busting) в `src/app/main.tsx`. Для заголовочного CSP/HSTS нужен
  хостинг с поддержкой заголовков (GitHub Pages их не отдаёт).

### Замечания по окружению
- ESM-сборка `libsodium-wrappers-sumo` сломана (импортирует отсутствующий
  `./libsodium-sumo.mjs`). Обход: alias на CJS-сборку в `vite.config.ts`, версия
  **запинена точно** (`0.7.16`), импорт локализован в `src/core/crypto/sodium.ts` —
  это единственная точка, которую нужно тронуть при обновлении/фиксе апстрима.
- Бандл крупный (~1.2 MB) из-за инлайна WASM-крипты — нормально для M0;
  code-split/ленивая загрузка — задача обвязки M8.
