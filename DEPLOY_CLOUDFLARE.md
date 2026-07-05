# Публикация Notes Vault на Cloudflare Pages (с нуля)

Способ: **GitHub → Cloudflare собирает сам** при каждом `git push`. Всё бесплатно.

Проект уже подготовлен к Cloudflare:

- `public/_redirects` — SPA-фолбэк (прямой заход на `/notes/<id>` не даёт 404).
- `public/_headers` — настоящие заголовки безопасности (CSP + `frame-ancestors`,
  HSTS и др.) — то, что нельзя было на GitHub Pages.
- База сборки для Cloudflare — корень `/` (переменную `BASE_PATH` НЕ задаём;
  она нужна только старому деплою на GitHub Pages в подпапку).

> Если в папке остался служебный каталог `_broken_git_delete_me` — просто удалите
> его (это следствие того, что git нельзя запускать в песочнице; на вашем ПК всё ок).

---

## Шаг 0. Что понадобится (5 минут)

1. **Аккаунт GitHub** — https://github.com/signup (бесплатно).
2. **Аккаунт Cloudflare** — https://dash.cloudflare.com/sign-up (бесплатно).
3. **Git на компьютере** — https://git-scm.com/download/win (при установке всё
   оставляйте по умолчанию). Проверка в терминале: `git --version`.

---

## Шаг 1. Проверьте, что проект собирается (на вашем ПК, Windows)

Откройте PowerShell/терминал в папке `notes-vault` и выполните:

```
npm.cmd install
npm.cmd run build
```

Должна появиться папка `dist`. Если сборка прошла без ошибок — можно публиковать.
(`npm.cmd` вместо `npm` — на случай, если PowerShell блокирует `npm`.)

---

## Шаг 2. Создайте репозиторий на GitHub

1. Зайдите на https://github.com/new
2. **Repository name:** например `notes-vault`.
3. Приватный или публичный — на ваш выбор (**Private** тоже работает с Cloudflare).
4. Ничего не добавляйте (README/.gitignore/лицензию не отмечайте) — они уже есть.
5. Нажмите **Create repository**. Скопируйте адрес вида
   `https://github.com/ВАШ_ЛОГИН/notes-vault.git`.

---

## Шаг 3. Залейте код в репозиторий

В терминале, находясь **внутри папки `notes-vault`**:

```
git init
git add -A
git commit -m "Notes Vault: mobile + fixes, готово к Cloudflare Pages"
git branch -M main
git remote add origin https://github.com/ВАШ_ЛОГИН/notes-vault.git
git push -u origin main
```

При первом `push` GitHub попросит войти — согласитесь в открывшемся окне браузера.
После этого код окажется на GitHub.

---

## Шаг 4. Подключите репозиторий к Cloudflare Pages

1. Откройте https://dash.cloudflare.com → раздел **Workers & Pages**.
2. **Create** → вкладка **Pages** → **Connect to Git**.
3. Нажмите **Connect GitHub**, разрешите доступ к вашему репозиторию `notes-vault`.
4. Выберите репозиторий и нажмите **Begin setup**.

### Настройки сборки (важно — впишите ровно так):

| Поле | Значение |
|------|----------|
| **Project name** | `notes-vault` (станет частью адреса) |
| **Production branch** | `main` |
| **Framework preset** | `Vite` (или `None`) |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | оставить пустым (`/`) |

**Environment variables** → добавьте одну переменную:

| Name | Value |
|------|-------|
| `NODE_VERSION` | `22` |

> `BASE_PATH` НЕ добавляйте. Она нужна только для GitHub Pages (подпапка); на
> Cloudflare сайт живёт в корне.

5. Нажмите **Save and Deploy**. Cloudflare склонирует репозиторий, выполнит
   `npm run build` и опубликует папку `dist`.

Через 1–2 минуты появится адрес вида **`https://notes-vault.pages.dev`**.

---

## Шаг 5. Проверьте, что всё работает

Откройте выданный `*.pages.dev` адрес (лучше с телефона):

- Приложение открывается, можно создать волт (кодовую фразу), заметки, задачи.
- **Мобильный вид:** свайп от левого края или кнопка-бургер открывает меню;
  переключаются темы; экраны в одну колонку.
- **Прямая ссылка:** откройте, например, `.../calendar` и обновите страницу (F5) —
  должно грузиться без ошибки 404 (работает `_redirects`).
- **Установка PWA:** в браузере телефона меню → «Добавить на главный экран».
- **Заголовки безопасности** (по желанию, на ПК): DevTools → Network → выберите
  сам документ → Headers → должны быть `content-security-policy`,
  `strict-transport-security`, `x-frame-options: DENY`.

---

## Шаг 6. Обновления в будущем

Просто вносите изменения и пушьте:

```
git add -A
git commit -m "что изменил"
git push
```

Cloudflare сам пересоберёт и обновит сайт за пару минут. Пользователям PWA
предложит обновиться (у приложения включён режим обновления по согласию).

---

## Необязательно

- **Свой домен:** в проекте Pages → **Custom domains** → добавьте домен и следуйте
  подсказкам (Cloudflare выпустит HTTPS-сертификат автоматически).
- **Отключить старый деплой на GitHub Pages:** если он не нужен, удалите файл
  `.github/workflows/deploy.yml` (иначе при каждом push будет ещё и попытка
  деплоя на GitHub Pages, которая без настроенного Pages просто завершится с
  ошибкой — на Cloudflare это не влияет).

---

## Если что-то пошло не так

- **Сборка упала на Cloudflare:** откройте лог сборки в проекте Pages. Чаще всего —
  не задан `NODE_VERSION=22`. Добавьте и нажмите **Retry deployment**.
- **Белый экран / ассеты не грузятся:** убедитесь, что НЕ задавали `BASE_PATH`
  (иначе пути ведут в подпапку, которой на Cloudflare нет).
- **404 при обновлении вложенной страницы:** проверьте, что файл
  `public/_redirects` попал в репозиторий и в `dist` после сборки.
- **`git push` просит логин снова и снова:** установите
  [Git Credential Manager](https://git-scm.com/download/win) (идёт в комплекте с
  Git for Windows) и войдите через браузер.
