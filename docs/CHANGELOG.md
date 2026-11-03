# Changelog

Every development request and the resulting changes, **newest first**. Entries are never removed. The detailed learning explanation for each entry is in the **Development Log** part of the manual.

## 2026-11-03 — Entry #9: How to host on cPanel

**Original request:** "add a how to host in c panel"

**Summary:**
- **New `server.cjs`:** a startup file for cPanel's Setup Node.js App (Phusion Passenger). It switches on tsx's TypeScript loader and starts `src/index.ts` with a dynamic `import()`.
- **New Chapter 22, "Hosting on cPanel":**
  - Requirements and an architecture diagram.
  - Step 1: domain, AutoSSL and Force HTTPS.
  - Step 2: the code, from GitHub with a read-only deploy key or as a ZIP upload, kept outside public folders.
  - Step 3: Setup Node.js App fields and environment variables (`NODE_ENV`, `COOKIE_SECURE=true`, `DATABASE_PATH` outside the app, `LOG_REQUESTS`).
  - Step 4: installing with `npx pnpm@12 install --prod --frozen-lockfile` instead of the "Run NPM Install" button.
  - Step 5: start and test, then register the admin account first.
  - Also covers updating, backups, a troubleshooting table and the limits of shared hosting.
- **Testing note:** the chapter states clearly that the cPanel steps could not be tried on a real cPanel server.

**Files created:** `server.cjs`
**Files modified:** `README.md`, `docs/DOCUMENTATION-SOURCE.md`, `docs/CHANGELOG.md` (HTML and PDF regenerated)
**Files deleted:** none

**Tests performed:**
- `node server.cjs` with production-like settings: a fresh database was migrated, `/api/health` returned ok, registration returned `201` with an `HttpOnly; Secure; SameSite=Lax` cookie, and the page was served. The test process was stopped and its port freed.
- `pnpm typecheck`: no errors. `pnpm test`: 93/93 passed. `pnpm test:e2e`: 26/26 passed, with no console errors.
- `pnpm docs:build`: manual regenerated and verified.

**Documentation sections updated:** Preface (book layout), Chapter 9 (file tree), Chapter 11 (configuration files), Chapter 17 (pointer to Chapter 22), **new Chapter 22**, Development Log Entry #9, Glossary (cPanel, deploy key, dynamic import, Passenger).

## 2026-11-01 — Entry #8: Rename to "Aeto To-Do", logo theme, publish on GitHub

**Original requests:** "name the projext to aeto to do and create a new repo in minal-aetonet and push it in my git hub" · "change the theme to match the logo too" (Aeto logo attached)

**Summary:**
- **Rename:** the app is now **Aeto To-Do** (title, logo text, `package.json` name `aeto-to-do`, README, manual).
- **Theme from the logo:**
  - Colours: charcoal `#383745`, the orange gradient `#f58c5f → #ef5a35`, and cream `#f7f3ef`.
  - A charcoal top bar with an orange gradient line, and a charcoal login screen.
  - Orange buttons use `#cf4520` so white text keeps WCAG AA contrast.
  - A simplified orange swoosh mark (`public/img/aeto-mark.svg`) and a new favicon.
  - The manual uses the same colours.
- **Git:** the project got its own Git repository (branch `main`). The parent repository at `C:\` is not used, so nothing outside the project can be published.
  - Before the first commit, the file list was checked: 75 files, with `data/` (database and backup), `.env` and `node_modules` ignored.
- **GitHub:** installed the GitHub CLI with winget, and the user approved the browser login (account `minal-aetonet`). The **private** repository https://github.com/minal-aetonet/aeto-to-do was created and branch `main` pushed.
  - Git uses the GitHub CLI login for this repository only, through local config; the global git settings are unchanged.
  - Verified: visibility PRIVATE; the remote `main` equals the local commit `78b64a0`; 76 files on GitHub; 0 files from `data/`, `.env`, `node_modules` or `*.db`.

**Files created:** `public/img/aeto-mark.svg`
**Files modified:** `package.json`, `public/index.html`, `public/favicon.svg`, `public/css/styles.css`, `scripts/build-docs.ts`, `tests/app.test.ts`, `README.md`, `docs/DOCUMENTATION-SOURCE.md`, `docs/CHANGELOG.md` (HTML and PDF regenerated)
**Files deleted:** none

**Tests performed:**
- `pnpm typecheck`: no errors.
- `pnpm test`: 93/93 passed.
- `pnpm test:e2e`: 26/26 passed, with no console errors.
- Screenshots of the login screen, Dashboard and Tasks.
- Git ignore check before the first commit.
- `pnpm docs:build`: manual regenerated and verified.

**Documentation sections updated:** Preface (clone instructions), Chapter 3 (`package.json` name), Chapter 8 (new "The Aeto theme" section), Chapter 9 (folder name), Chapter 17 (new "Your code on GitHub" section; deployment path), Development Log Entry #8, Glossary (8 new Git and colour terms).

## 2026-11-01 — Entry #7: Different view types in the calendar

**Original request:** "add differnt view type in calander"

**Summary:**
- **New:** a Month / Week / Day / Agenda switcher on the Calendar view.
  - **Week:** 7 tall day columns; each chip also shows the status and subtask progress.
  - **Day:** a detailed list of one day, with "+ Add task on this day".
  - **Agenda:** the next 30 days, grouped by date, showing only days with tasks.
- **Navigation:** ‹ › move by the size of the current view, **Today** jumps back, and clicking a date opens it in the Day view.
- **Remembered:** the chosen view type is stored in `localStorage`.
- **On phones:** the week becomes a vertical list.
- **Frontend-only:** the existing `dueFrom`/`dueTo` API filters supply each view's date range.

**Files created:** none
**Files modified:** `public/index.html`, `public/css/styles.css`, `public/js/ui.js`, `public/js/app.js`, `scripts/e2e-smoke.ts`, `docs/DOCUMENTATION-SOURCE.md`, `docs/CHANGELOG.md` (HTML and PDF regenerated)
**Files deleted:** none

**Tests performed:**
- `pnpm typecheck`: no errors.
- `pnpm test`: 93/93 passed.
- `pnpm test:e2e`: 26/26 passed. A new step covers all four view types, ‹ › in Day view, the remembered view type after a reload, and clicking a date.
- Screenshots of Week, Day and Agenda on desktop, plus Week on a phone-sized screen.
- `pnpm docs:build`: manual regenerated and verified.

**Documentation sections updated:** Chapter 21 (a new section on the calendar's four view types: anchor date, `calendarRange`, `shiftCalendar`, rendering, `localStorage`), Chapter 11 (frontend functions), Chapter 13 (e2e steps), Chapter 15 (2 troubleshooting rows), Development Log Entry #7, Glossary (localStorage, pure function).

## 2026-11-01 — Entry #6: Admin assigns tasks, group and individual tasks, subtasks, separate views, "created by" for admins

**Original request:** "add a feature in admin to give a task to user and sepraste a dash board and calander like view too / add group task and inviuwal task too add a option to add task inside task add a view to only aadmin on who created a task"

**Summary:**
- **Assignments:** a new `task_assignees` link table (many-to-many) replaces the single owner column `tasks.user_id`.
  - Admins assign a task to one person (individual) or several people (group).
  - Normal users keep creating individual tasks for themselves.
- **Group tasks:** every member sees, edits and completes the same task and shares its checklist.
  - Only the creator or an admin can delete a group task.
  - Only admins change who it's assigned to.
- **Subtasks:** a checklist inside every task, via a new `subtasks` table and the endpoints `POST /api/tasks/:id/subtasks`, `PATCH /api/subtasks/:id` and `DELETE /api/subtasks/:id`.
- **Views:** Dashboard (7 cards including Group tasks, plus Overdue and Next-7-days lists), Tasks (with an Individual/Group filter), Calendar (month grid; "+" adds a task on that day) and Admin (users, plus all tasks with Type, Assigned to and Created by). They are switched with URL hash routing.
- **"Created by":** a new `tasks.created_by` column. The creator is included in API responses for admins only; normal users get `canDelete` instead.
- **New API features:** `GET /api/admin/tasks`, the `assigneeIds` field on create and update, the `kind`, `dueFrom` and `dueTo` filters, and `groupTasks` on the dashboard.
- **Data-loss bug found and fixed before it reached real data:**
  - The table rebuild in migration 0003 cascade-deleted all assignee rows, because Drizzle runs migrations inside a transaction, where SQLite ignores `PRAGMA foreign_keys=OFF`.
  - `runMigrations` now turns foreign keys off outside the transaction, runs `PRAGMA foreign_key_check`, and turns them back on. A regression test was added for this.
- **Real database:** backed up to `data/backups/todo-before-assignees-2026-11-01.db`, then migrated. All 7 tasks kept their creator and assignee.

**Files created:**
- Migrations: `src/db/migrations/0002_assignees_and_subtasks.sql`, `src/db/migrations/0003_drop_task_owner_column.sql`, `src/db/migrations/meta/0002_snapshot.json`, `meta/0003_snapshot.json`
- Subtask code: `src/services/subtask.service.ts`, `src/validators/subtask.validator.ts`, `src/routes/subtask.routes.ts`
- Tests: `tests/assignment.test.ts`, `tests/subtasks.test.ts`, `tests/migrations.test.ts`

**Files modified:**
- Database: `src/db/schema.ts`, `src/db/index.ts`, `src/db/migrations/meta/_journal.json`
- Services: `src/services/task.service.ts`, `dashboard.service.ts`, `auth.service.ts`
- Validators and routes: `src/validators/task.validator.ts`, `src/routes/task.routes.ts`, `admin.routes.ts`, `src/app.ts`
- Scripts: `scripts/seed.ts`, `scripts/e2e-smoke.ts`
- Frontend: `public/index.html`, `public/css/styles.css`, `public/js/api.js`, `ui.js`, `app.js`
- Tests: `tests/auth.test.ts`, `tests/dashboard.test.ts`
- Docs: `README.md`, `docs/DOCUMENTATION-SOURCE.md`, `docs/CHANGELOG.md`, and the regenerated HTML and PDF

**Files deleted:** none. The `tasks.user_id` column was removed by migration 0003.

**Tests performed:**
- `pnpm typecheck`: no errors.
- `pnpm test`: 93/93 passed across 9 files, 23 of them new.
- The regression test was confirmed to fail without the `runMigrations` fix and to pass with it.
- `pnpm test:e2e`: 25/25 browser steps passed with no console errors.
- Migration tests on a copy of the real database: the first run lost all 7 assignments; after the fix, all 7 were kept.
- Real database upgrade: 4 migrations applied, 7 tasks with 7 assignments and 7 creators, the `user_id` column removed, and the health check `ok`.
- Screenshots of all views and the assign form, plus a normal user's view, all checked against a temporary demo database.

**Documentation sections updated:**
- Preface (book layout), Chapter 1 (features), Chapter 2 (handler example)
- Chapter 7 (six tables, schema, composite key, new Drizzle helpers, migrations 0002/0003 and the data-loss fix)
- Chapter 8 (views and hash routing)
- Chapter 9 (file tree, decisions)
- Chapter 10 (flows using the viewer and assignees)
- Chapter 11 (task service, the new subtask service, validators, routes, frontend functions, `runMigrations`)
- Chapter 12 (Task object fields, new parameters and endpoints, `INVALID_ASSIGNEE`)
- Chapter 13 (test table: 93 tests, 25 e2e steps)
- Chapter 14 (security rows)
- Chapter 15 (5 troubleshooting rows)
- Chapter 16 (recipes: `deleteCompletedTasks` now uses the creator; the subtasks example became a comments example)
- Chapter 18 (roadmap)
- Chapter 20 (authorization code, registration code, roles table, Flow C)
- **New Chapter 21 — Teamwork: Assigning Tasks, Group Tasks, Subtasks and Views**
- Development Log Entry #6, Glossary (12 new terms)

## 2026-11-01 — Entry #5: Bug report "Route POST /api/auth/register was not found."

**Original request:** "Route POST /api/auth/register was not found."

**Summary:** No code change. The server on port 3000 was a stale process that Claude had started at 3:21 PM, during the initial build, for screenshots. An earlier stop command did not end it, so it was still running code from before the authentication routes existed (added 4:18 PM). Claude stopped the stale processes and started the server with the current code, which also ran the accounts migration on `data/todo.db`. Registration now works: the first account, *Minal Poudel* (`admin@gmail.com`), is the admin and owns the 6 earlier tasks.

**Files created:** none
**Files modified:** `docs/DOCUMENTATION-SOURCE.md`, `docs/CHANGELOG.md` (HTML and PDF regenerated)
**Files deleted:** none

**Tests performed:**
- Port and process inspection: the process started at 3:21 PM, before `auth.routes.ts` was created at 4:18 PM.
- Probes after the restart: `GET /api/auth/me` returned `401`, and `POST /api/auth/register` with an empty body returned `400` instead of `404`, without creating an account.
- Database check: the `users` and `sessions` tables exist, there is 1 admin account, and 0 ownerless tasks remain.
- Server log: the user's registration returned `201`, and `/api/admin/users` returned `200`.
- `pnpm docs:build`: manual regenerated and verified.

**Documentation sections updated:** Chapter 15 (new troubleshooting row for "Route … was not found" caused by an old process), Development Log Entry #5.

## 2026-11-01 — Entry #4: Question about the admin ID and password

**Original request:** "is the id password of admin"

**Summary:** No code change. There is no built-in admin account or default password. The first account registered becomes the admin, with the email and password chosen at registration. The optional `pnpm db:seed` demo account (`demo@example.com` / `demo-password-123`) is created only when no accounts exist. A read-only check of the real `data/todo.db` showed no accounts yet: the accounts migration will run on the next `pnpm start`, and 6 tasks are waiting for the first account.

**Files created:** none
**Files modified:** `docs/DOCUMENTATION-SOURCE.md`, `docs/CHANGELOG.md` (HTML and PDF regenerated)
**Files deleted:** none

**Tests performed:** a read-only inspection of `data/todo.db`. The existing tests covering "first account is admin" and "claims ownerless data" are part of the 70 passing tests. `pnpm docs:build` regenerated and verified the manual.

**Documentation sections updated:** Chapter 20 (new subsection "What is the admin's email and password?"), Chapter 15 (troubleshooting row), Development Log Entry #4.

## 2026-11-01 — Entry #3: Authentication and authorization

**Original request:** "add ahotrizastion and authetication and add it in doc too" (add authorization and authentication, and document them)

**Summary:**
- **Accounts:** register, log in, log out and `/api/auth/me`.
  - Passwords are stored as salted scrypt hashes (Node's built-in crypto, so no new dependencies).
- **Sessions:**
  - A 32-byte random token is kept in an `HttpOnly`, `SameSite=Lax` cookie (with `Secure` when `COOKIE_SECURE=true`).
  - Only the token's SHA-256 hash is stored, in a new `sessions` table.
  - Sessions last 7 days, and logout deletes them.
- **Authentication:** `requireAuth` protects every task, category, dashboard and admin route (`401` without a valid session).
- **Authorization:**
  - Tasks and categories have an owner (`user_id`), and every service query filters by the logged-in user. Other users' records answer `404`.
  - Category names are unique per user.
  - `requireRole('admin')` protects `GET /api/admin/users` (`403` for other users).
  - The first account becomes admin and claims all existing ownerless data.
- **Hardening:**
  - Hono `csrf()` middleware.
  - Login throttling: 5 failures per email within 15 minutes gives `429`.
  - The same error message, and similar timing, for an unknown email and a wrong password.
- **Frontend:**
  - Login/register screen, plus the signed-in user's name, an admin badge and a Log out button.
  - An admin-only Users dialog.
  - Automatic return to the login screen after a 401.
- **Seed script:** now creates the demo account `demo@example.com` / `demo-password-123`.

**Files created:**
- Migration: `src/db/migrations/0001_add_users_and_sessions.sql`, `src/db/migrations/meta/0001_snapshot.json`
- Helpers: `src/lib/password.ts`, `src/lib/login-throttle.ts`
- Auth code: `src/validators/auth.validator.ts`, `src/services/auth.service.ts`, `src/middleware/auth.ts`
- Routes: `src/routes/auth.routes.ts`, `src/routes/admin.routes.ts`
- Tests: `tests/auth.test.ts`, `tests/authorization.test.ts`

**Files modified:**
- Database and config: `src/db/schema.ts`, `src/db/migrations/meta/_journal.json`, `src/types.ts`, `src/config.ts`, `src/app.ts`, `src/index.ts`, `.env.example`
- Services: `src/services/task.service.ts`, `category.service.ts`, `dashboard.service.ts`
- Routes: `src/routes/task.routes.ts`, `category.routes.ts`, `dashboard.routes.ts`
- Scripts: `scripts/seed.ts`, `scripts/e2e-smoke.ts`
- Frontend: `public/index.html`, `public/css/styles.css`, `public/js/api.js`, `ui.js`, `app.js`
- Tests: `tests/helpers.ts`, `tasks.test.ts`, `categories.test.ts`, `dashboard.test.ts`, `app.test.ts`
- Docs: `README.md`, `docs/DOCUMENTATION-SOURCE.md`, `docs/CHANGELOG.md`, and the regenerated HTML and PDF

**Files deleted:** none

**Tests performed:**
- `pnpm typecheck`: no errors.
- `pnpm test`: 70/70 passed across 6 files. That is 30 new authentication and authorization tests, 1 new CSRF test, and the existing tests updated to run as a logged-in user.
- `pnpm test:e2e`: 18/18 browser steps passed with no console errors. The new steps cover:
  - the login screen;
  - registration validation and registering the first account (admin);
  - the admin Users list;
  - a second user in a separate browser who sees none of the first user's tasks;
  - logout, a refused wrong password, and logging back in.
- Upgrade test on a **copy** of the real `data/todo.db`:
  - the migration applied;
  - the first registered account received the 6 existing tasks;
  - `GET /api/tasks` without a cookie returned `401`.
- Screenshots of the login screen and the logged-in app.
- Issues handled:
  - drizzle-kit left out `ON DELETE cascade` on the new `user_id` columns. It was added by hand to the not-yet-applied migration.
  - Body-less requests need an `Origin` header to pass the CSRF check. The test helper now sends one, and the `curl` examples were updated.
- `pnpm docs:build`: HTML and PDF regenerated and verified.

**Documentation sections updated:**
- Preface (quick start, book layout)
- Chapters 1 (features, page load), 2 (route groups, handler example, `createApp`) and 4 (async note)
- Chapter 5 (401/403/429, cookies, logged-in "Try it" commands)
- Chapter 6 (onion diagram, middleware order, auth middleware, `csrf`)
- Chapter 7 (four tables, schema, migration 0001)
- Chapter 8 (two screens, frontend login)
- Chapter 9 (architecture, file tree, decisions)
- Chapter 10 (all flows now include auth and `userId`)
- Chapter 11 (new files, changed signatures, config, types)
- Chapter 12 (auth and admin endpoints, User object, error codes)
- Chapter 13 (test helper, test counts)
- Chapter 14 (security summary table)
- Chapters 15 (auth troubleshooting), 16 (recipes with `userId`, new ideas), 17 (`COOKIE_SECURE`, deployment checklist) and 18 (roadmap)
- **New Chapter 20 — Authentication and Authorization**
- Development Log Entry #3, Glossary (19 new terms)

## 2026-11-01 — Entry #2: Install the project with pnpm

**Original request:** "install it through pnpm"

**Summary:** Switched the project from npm to pnpm. Removed npm's lockfile and `node_modules`, reinstalled every package with pnpm, and added `pnpm-workspace.yaml`. The first install failed because pnpm tried to compile `better-sqlite3` from C++ source with node-gyp, and this computer has no C++ build tools. The package already ships prebuilt binaries, so it is now set to `allowBuilds: false`; `esbuild` stays allowed. `package.json` was cleaned up: removed npm's `allowScripts`, added `packageManager`, moved `tsx` to `dependencies`, removed the unused `build`/`start:prod` scripts and the `dotenv` package (Node's built-in `process.loadEnvFile` is used instead), and set `engines.node` to `>=22`.

**Files created:** `pnpm-lock.yaml`, `pnpm-workspace.yaml`

**Files modified:** `package.json`

**Files deleted:** `package-lock.json` (and the npm-created `node_modules/`, reinstalled by pnpm)

**Tests performed:**
- `pnpm add …` with `better-sqlite3: true` failed (node-gyp has no C++ build tools); diagnosed and fixed with `false`.
- Install succeeded and the lockfile passed pnpm's supply-chain checks.
- SQLite loads (`sqlite_version()` = 3.53.4); `tsx` 4.23.15 and TypeScript 7.0.2 run through pnpm.
- Every test listed in Entry #1 was run with pnpm and passed.

**Documentation sections updated:** Preface (quick start), Chapter 3 (npm vs pnpm, lockfile, `pnpm-workspace.yaml`), Chapter 15 (pnpm troubleshooting), Chapter 17 (pnpm deployment commands), Development Log Entry #2, Glossary (pnpm, lockfile).

## 2026-11-01 — Entry #1: Initial build of the Hono To-Do application and learning manual

**Original request:** Build a fully functional Hono To-Do application (Hono, TypeScript, Node.js, SQLite, Drizzle ORM, Zod, HTML/CSS/vanilla JavaScript, Vitest). It needs a dashboard, full task management, categories, search, filters and sorting, plus a professional interface with notifications and loading, error and empty states. Also create a complete beginner-friendly learning manual in HTML and PDF, generated from a Markdown source with `docs:build`, and keep a changelog.

**Summary:**
- **Backend:**
  - Hono app built in layers: routes → Zod validation → services → Drizzle/SQLite.
  - Central error handling.
  - Request-logging, security-header, body-limit and database-injection middleware.
- **API:** 13 endpoints covering health, tasks (list, get, create, edit, complete, reopen, delete), categories (list, create, edit, delete) and the dashboard.
- **Database:** `tasks` and `categories` tables with a foreign key (`ON DELETE SET NULL`), indexes, and a generated migration `0000_init.sql`.
- **Frontend:** a responsive single page with a dashboard, filters, a task list, create/edit and category dialogs, a confirmation dialog, toasts, and loading/error/empty states. It is XSS-safe because it renders with `textContent`.
- **Tests:** 39 Vitest tests and an 11-step browser smoke test.
- **Scripts:** migrate, seed, e2e smoke test, documentation generator.
- **Manual:** 19 chapters, a Development Log, a Glossary, and this change history.

**Files created:**
- Root: `package.json`, `tsconfig.json`, `drizzle.config.ts`, `vitest.config.ts`, `.env.example`, `.gitignore`, `README.md`
- Backend core: `src/index.ts`, `src/app.ts`, `src/config.ts`, `src/types.ts`
- Database: `src/db/schema.ts`, `src/db/index.ts`, `src/db/migrations/0000_init.sql`, `src/db/migrations/meta/*`
- Helpers: `src/lib/errors.ts`, `src/lib/dates.ts`
- Middleware: `src/middleware/request-logger.ts`, `database.ts`, `validate.ts`, `error-handler.ts`
- Validators: `src/validators/common.ts`, `task.validator.ts`, `category.validator.ts`, `dashboard.validator.ts`
- Services: `src/services/task.service.ts`, `category.service.ts`, `dashboard.service.ts`
- Routes: `src/routes/task.routes.ts`, `category.routes.ts`, `dashboard.routes.ts`
- Frontend: `public/index.html`, `public/favicon.svg`, `public/css/styles.css`, `public/js/api.js`, `ui.js`, `app.js`
- Tests: `tests/helpers.ts`, `tasks.test.ts`, `categories.test.ts`, `dashboard.test.ts`, `app.test.ts`
- Scripts: `scripts/migrate.ts`, `seed.ts`, `e2e-smoke.ts`, `build-docs.ts`, `lib/browser.ts`
- Docs: `docs/DOCUMENTATION-SOURCE.md`, `docs/CHANGELOG.md`, `docs/LEARN-HONO-COMPLETE.html`, `docs/LEARN-HONO-COMPLETE.pdf`

**Files modified:** none (new project)

**Files deleted:** none

**Tests performed:**
- `pnpm typecheck`: no errors. One error was found and fixed: the `AppDatabase` type was missing `$client`.
- `pnpm test`: 39/39 passed across 4 test files.
- `pnpm test:e2e`: 11/11 steps passed with no browser console errors. Two test-environment issues were found and fixed: the test viewport was too small, and there was no favicon.
- Manual run:
  - `pnpm db:seed` added 3 categories and 6 tasks.
  - `pnpm start` served `/api/health`, `/api/dashboard` and `/api/tasks` with the correct data.
  - An invalid `POST` returned a 400 with field details.
  - The request log printed correctly.
- Visual check: screenshots at desktop (1280 px) and phone (390 px) widths.
- `pnpm docs:build`: HTML and PDF generated, and the verification passed.
  - The first build hung. Text in the embedded search index (`</script>`, `<img onerror=…>`) broke out of its `<script>` tag and ran `alert(1)`, which blocked the page. Fixed by escaping `<` as `<`.
  - The generator now fails on any script error or dialog in the manual.
  - Code-font ligatures were disabled.

**Documentation sections updated:** All (initial version): Preface, Chapters 1–19, Development Log Entry #1, Glossary, Appendix.
