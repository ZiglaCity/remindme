# RemindMe

A personal reminder app in development. See [requirements](./prd.md), [confirmed decisions](./docs/decisions.md), and the [phased plan](./TODO.md).

Phases 1–3 provide the database foundation, authentication, manual reminder CRUD, and durable schedules. Phase 4 adds Gemini text interpretation, clarification, editable confirmation, optional browser voice capture, and manual fallback. See [reminder behavior](./docs/reminders.md) and [text/voice setup](./docs/ai.md).

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

Phase 5 adds SMTP delivery, persisted outcomes, bounded retries and a guarded `npm run smtp:check` command; see [email configuration and live checks](./docs/email.md). Automatic queue processing requires the Phase 6 Azure scheduler. Vercel/Azure deployment, live Google OAuth and representative physical microphone checks remain pending. Manual reminder workflows do not require Gemini or SMTP.

The Phase 6 worker is implemented locally with safe batch claims, catch-up coalescing, bounded recovery and a separate Azure timer artifact. Run `npm run worker:build` to prepare it, or `npm run worker:check` for read-only queue status. See [worker operation and deployment checkpoint](./docs/worker.md). Azure setup/deployment was deferred by the owner; automatic hosted delivery is not running yet.

Phase 7 adds the redesigned desktop/mobile application, owner-scoped dashboard/search/filtering, and installable PWA metadata with a private-safe offline shell. See [UI, installation and cache behavior](./docs/ui-pwa.md). Native device installation and production HTTPS checks remain pending; ordinary development mode intentionally does not register a service worker.

The owner-requested recurrence extension supports daily/weekly/monthly reminders, selected weekdays, intervals and end dates. Every occurrence retains advance 50/75/90 check-ins; Mark complete stops the whole series. Saved details now open read-only with an explicit Edit action. See [recurrence behavior and operation](./docs/recurrence.md). Apply migrations `0004`–`0005` and rebuild the worker before running this version; automatic recurrence/email still requires the deferred worker deployment.
