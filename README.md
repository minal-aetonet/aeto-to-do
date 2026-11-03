# Aeto To-Do

A full-stack team To-Do application built with **Hono**, **TypeScript**, **Node.js**, **SQLite**, **Drizzle ORM**, **Zod**, vanilla **HTML/CSS/JavaScript** and **Vitest**. It also comes with a complete beginner-friendly learning manual.

## 📘 The learning manual

- HTML: [`docs/LEARN-HONO-COMPLETE.html`](docs/LEARN-HONO-COMPLETE.html) (open it in any browser; it works offline)
- PDF: [`docs/LEARN-HONO-COMPLETE.pdf`](docs/LEARN-HONO-COMPLETE.pdf)
- Source: [`docs/DOCUMENTATION-SOURCE.md`](docs/DOCUMENTATION-SOURCE.md) · Changes: [`docs/CHANGELOG.md`](docs/CHANGELOG.md)

## Requirements

- Node.js 22 or newer
- pnpm (`npm install -g pnpm` or `corepack enable pnpm`)
- For `test:e2e` and `docs:build`: Google Chrome or Microsoft Edge (or set `CHROME_PATH`)

## Getting started

```bash
git clone https://github.com/minal-aetonet/aeto-to-do.git
cd aeto-to-do
pnpm install      # install dependencies
pnpm db:seed      # optional: demo account demo@example.com / demo-password-123 with example tasks
pnpm start        # start the server → http://localhost:3000
```

Open the app and click **Create one** to register. The **first account** becomes the administrator (and takes over any tasks created before accounts existed). Each user sees only the tasks assigned to them and their own categories.

**Features:** Dashboard, Tasks, Calendar and (admins only) Admin views · admins assign **individual** or **group** tasks · **subtasks** (checklists) inside every task · search, filters, sorting, categories, due dates · only admins see who created a task.

Use `pnpm dev` while developing: it restarts the server automatically when you save a file.

## Commands

| Command | Description |
|---|---|
| `pnpm start` | Start the server |
| `pnpm dev` | Start with automatic restart on file changes |
| `pnpm test` | Run the automated tests (Vitest) |
| `pnpm test:e2e` | Run the browser smoke test |
| `pnpm typecheck` | Check TypeScript types |
| `pnpm db:generate` | Generate a migration after changing `src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Add example data to an empty database |
| `pnpm docs:build` | Regenerate the HTML and PDF manual |

## Configuration

Copy `.env.example` to `.env` to change the settings:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `DATABASE_PATH` | `./data/todo.db` | SQLite database file |
| `LOG_REQUESTS` | `true` | Print one line per request |
| `COOKIE_SECURE` | `false` | Send the login cookie over HTTPS only — set `true` in production |

## Project structure

```text
src/        backend: index.ts (start), app.ts (Hono app), routes/, middleware/, validators/, services/, db/, lib/
public/     frontend: index.html, css/, js/
tests/      Vitest tests
scripts/    migrate, seed, browser smoke test, documentation generator
docs/       learning manual (HTML, PDF, Markdown source) and changelog
```

## Hosting

- **cPanel** ("Setup Node.js App"): use `server.cjs` as the application startup file and follow Chapter 22 of the manual.
- Other platforms (VPS, Railway, Render, Fly.io): see Chapter 17.

## Security

Accounts with scrypt-hashed passwords, `HttpOnly` session cookies, per-user data, an admin role, CSRF protection and login throttling — see Chapter 20 of the manual. Before deploying, use HTTPS with `COOKIE_SECURE=true` and register your own admin account first (Chapter 17).
