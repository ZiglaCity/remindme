# RemindMe

A personal reminder app in development. See [requirements](./prd.md), [confirmed decisions](./docs/decisions.md), and the [phased plan](./TODO.md).

Phase 1 foundation is verified with Neon connectivity and real PostgreSQL transaction/locking tests. Phase 2 adds email/password accounts, Google OAuth configuration, server-enforced tester access, isolated time-zone preferences, and atomic shared rate limits. Phase 3 now provides manual reminder CRUD, explicit deadlines/time zones, and durable transactional schedules. See [reminder behavior and APIs](./docs/reminders.md).

## Local setup

1. Install Node.js 22 LTS and npm 11.21.1 (`npm install --global npm@11.21.1`); see [compatibility notes](./docs/compatibility.md).
2. Run `npm ci` using the committed lockfile.
3. Copy `.env.example` to `.env.local`. The public page needs no external credentials. Database commands need a real `DATABASE_URL`.
4. Run `npm run dev` and open http://localhost:3000.

Use a development Neon project/branch. Privately copy its pooled PostgreSQL URL, including TLS parameters, to `DATABASE_URL`. Set `DATABASE_DIRECT_URL` only if needed for migrations. Verify with `npm run db:check`; connection strings are never printed by this check.

## Checks

| Command                                      | Purpose                                                 |
| -------------------------------------------- | ------------------------------------------------------- |
| `npm run lint`                               | ESLint                                                  |
| `npm run typecheck`                          | TypeScript                                              |
| `npm run format:check` / `npm run format`    | Check/apply formatting                                  |
| `npm test`                                   | Unit tests                                              |
| `npm run test:integration`                   | PostgreSQL auth, reminders, transactions, and isolation |
| `npm run test:e2e`                           | Chromium public/auth journeys; dedicated test server    |
| `npm run build` / `npm start`                | Production build/server                                 |
| `npm run db:check`                           | Database connectivity                                   |
| `npm run db:generate` / `npm run db:migrate` | Generate/apply migrations                               |

Install the browser once with `npx playwright install chromium`. Set `TEST_DATABASE_URL` in `.env.test.local` or `.env.local` to an isolated PostgreSQL database. Integration tests apply migrations, create/clean unique fixture accounts and a temporary locking table, and never fall back to the application database. CI uses disposable PostgreSQL. Live Neon verification needs a separately configured test branch.

See [migration instructions](./migrations/README.md). Versioned migrations create auth/preferences/rate limits, then reminders and durable notification records. See [authentication setup and tests](./docs/authentication.md).

## Configuration and boundaries

Keep environment files and Azure local settings out of Git. Only `NEXT_PUBLIC_APP_URL` is intended for browser exposure. Web validation does not require SMTP/Gemini; worker validation needs database/SMTP without auth secrets. Database validation occurs on first use so the static public page builds without credentials.

`src/lib/db/server.ts` and `src/lib/env/server.ts` enforce Next.js server-only imports. Runtime-neutral connection/validation modules support trusted CLI and future worker code; never import connections into client components.

Tester access defaults to server-enforced allowlist mode. Set `TESTER_ACCESS_MODE=all` to explicitly allow everyone (`public` is an alias). SMTP recipient approval stays separate for Phase 5. Profile time-zone changes affect new reminders only.

Vercel and independent Azure deployment are later phases. Neon connectivity is verified; Google credentials and live OAuth exchange remain pending. AI parsing, SMTP delivery, and hosted deployment are not implemented. Configured Gemini/SMTP keys are not used by manual reminder workflows.
