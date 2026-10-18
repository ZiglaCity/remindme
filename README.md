# RemindMe

A personal reminder app in development. See [requirements](./prd.md), [confirmed decisions](./docs/decisions.md), and the [phased plan](./TODO.md).

Phase 1 provides a Next.js public entry page, TypeScript/Tailwind, environment validation, Drizzle/PostgreSQL tooling, and test/CI configuration. Accounts and reminders are not implemented yet.

## Local setup

1. Install Node.js 22 LTS and npm 11.21.1 (`npm install --global npm@11.21.1`); see [compatibility notes](./docs/compatibility.md).
2. Run `npm ci` using the committed lockfile.
3. Copy `.env.example` to `.env.local`. The public page needs no external credentials. Database commands need a real `DATABASE_URL`.
4. Run `npm run dev` and open http://localhost:3000.

Use a development Neon project/branch. Privately copy its pooled PostgreSQL URL, including TLS parameters, to `DATABASE_URL`. Set `DATABASE_DIRECT_URL` only if needed for migrations. Verify with `npm run db:check`; connection strings are never printed by this check.

## Checks

| Command                                      | Purpose                                       |
| -------------------------------------------- | --------------------------------------------- |
| `npm run lint`                               | ESLint                                        |
| `npm run typecheck`                          | TypeScript                                    |
| `npm run format:check` / `npm run format`    | Check/apply formatting                        |
| `npm test`                                   | Unit tests                                    |
| `npm run test:integration`                   | Real PostgreSQL rollback/locking              |
| `npm run test:e2e`                           | Chromium smoke check, starts local web server |
| `npm run build` / `npm start`                | Production build/server                       |
| `npm run db:check`                           | Database connectivity                         |
| `npm run db:generate` / `npm run db:migrate` | Generate/apply migrations                     |

Install the browser once with `npx playwright install chromium`. Set `TEST_DATABASE_URL` in `.env.test.local` to an isolated PostgreSQL database. Integration tests create/drop a uniquely named table and never fall back to the application database. CI uses disposable PostgreSQL. Live Neon verification needs a separately configured test branch.

See [migration instructions](./migrations/README.md). The first product schema arrives with Better Auth in Phase 2; there is no artificial foundation table.

## Configuration and boundaries

Keep environment files and Azure local settings out of Git. Only `NEXT_PUBLIC_APP_URL` is intended for browser exposure. Web validation does not require SMTP/Gemini; worker validation needs database/SMTP without auth secrets. Database validation occurs on first use so the static public page builds without credentials.

`src/lib/db/server.ts` and `src/lib/env/server.ts` enforce Next.js server-only imports. Runtime-neutral connection/validation modules support trusted CLI and future worker code; never import connections into client components.

Tester access defaults to allowlist mode with separately approved SMTP recipients. Configuration is prepared; enforcement arrives with authentication and delivery before those features are exposed. Profile time-zone changes will affect new reminders only.

Vercel and independent Azure deployment are later phases. This scaffold does not establish live Neon, OAuth, Gemini, SMTP, or hosted deployment success.
