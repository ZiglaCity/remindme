# Authentication and tester access

Phase 2 uses Better Auth 1.7.10 and its matching Drizzle adapter. The framework owns hashing, signed HttpOnly cookies, session storage, expiry, OAuth state, and callbacks. There is no separate session system.

## Configure local access

Set these privately in `.env.local`:

- `DATABASE_URL`: development Neon connection URL, preserving provider TLS parameters. Prefer explicit `sslmode=verify-full`; current pg warns that the meaning of `require` will change in a future major release.
- `BETTER_AUTH_SECRET`: high-entropy random secret, at least 32 characters. Keep separate secrets per environment.
- `BETTER_AUTH_URL`: the app's exact canonical origin, normally `http://localhost:3000` locally. This is **not** a Neon Auth endpoint: this app hosts Better Auth itself at `/api/auth` and uses Neon for PostgreSQL storage.
- `NEXT_PUBLIC_APP_URL`: the application URL; contains no secrets.
- `TESTER_ACCESS_MODE=allowlist`: default, denies access unless the stored account email matches `TESTER_EMAIL_ALLOWLIST` (comma-separated, trimmed, case-insensitive exact addresses).
- `TESTER_ACCESS_MODE=all`: explicitly enables registration and application access for everyone. `public` is an equivalent compatibility alias. An unknown mode fails validation.

Restart the development server after environment changes. An empty allowlist denies registration/login/application access. Account admission is checked at creation/session creation and every protected application/API operation; removing an address also blocks an existing session from application features. SMTP recipient approval is separate and will be enforced by the Phase 5 delivery implementation.

Run `npm run db:migrate`, then `npm run dev`. Visit `/register`, create an account with a 12–128 character password, and review the detected time zone under `/app/settings`. If browser detection fails, the visible UTC fallback requires review. New users receive preferences idempotently on first account/settings access, including after OAuth. Profile time-zone changes only update preferences; they do not reinterpret existing reminders.

## Google OAuth

Set both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to enable the Google button. Configure the consent screen/test users and these exact callbacks in Google Cloud:

- Local: `http://localhost:3000/api/auth/callback/google` (or the exact origin in `BETTER_AUTH_URL`).
- Deployment: `https://<your-domain>/api/auth/callback/google`.

Only Google's verified email claims are accepted, and the same access policy applies. Automatic account linking is disabled, including accounts with matching email strings. A collision must not merge accounts; use the originally registered method. There is no V1 account-linking/recovery UI. An actual Google callback requires real credentials and a consent-screen test account; unit/profile-gate tests do not prove the external OAuth exchange works.

## Security boundaries

- Production cookies are Secure, HttpOnly, and SameSite=Lax. Use HTTPS in production. Client-side cookie caching is disabled, so protected operations validate durable sessions.
- Origin/CSRF checks are explicitly enabled, including in tests; allowed origins derive from the configured canonical auth URL. Settings mutations require an exact Origin match.
- Auth request bodies are limited to 16 KiB and settings bodies to 1 KiB by actual streamed bytes, not just Content-Length.
- The HTTP auth adapter exposes only V1 sign-in/up/out, session, Google callback, and error paths. JSON responses omit tokens, password fields, and session device metadata; framework Set-Cookie behavior stays intact. Non-V1 reset/recovery/token/account-management endpoints are not exposed.
- API errors use sanitized messages and protected data responses use `Cache-Control: no-store`. Application pages require server authorization; layout redirects alone are not the authorization boundary.
- Preference repositories accept only a trusted server owner identity. Settings payloads are strict and cannot provide a user ID.
- Email/password addresses remain unverified. Approval for testing does not prove ownership. Password reset and verification emails are intentionally absent.

## Shared rate limiting

An atomic PostgreSQL upsert consumes each window. Counters are capped and keys are HMAC digests. Two application instances cannot independently reset a shared count. Windows reset at expiry; each consume also deletes up to 100 records expired more than a day ago, avoiding a permanent cleanup service.

Email sign-up/sign-in share ten attempts per normalized account address per 15 minutes, which prevents forwarded-IP spoofing from bypassing the account limit. Better Auth also uses the same atomic store for its endpoint/IP limits (ten sensitive requests per 15 minutes; general limit 100/minute). Configure/verify trusted hosting proxy headers before production; the account limit does not depend on trusting a client-supplied IP. HTTP 429 includes a retry indication. Failed database access fails the request rather than bypassing rate limits.

## Tests

Set `TEST_DATABASE_URL` to an isolated PostgreSQL database in `.env.test.local` or `.env.local`. There is no application-URL fallback. Integration tests apply versioned migrations and create unique fixture users, delete only their own users, and leave schema/history intact.

`npm run test:integration` covers sessions, hashing, cookies, sign-out, access revocation, origin checks, preferences, account-linking configuration, Google claim validation, and shared atomic limits across separate pools. Live Google exchange is a separate manual gate.

`npm run test:e2e` starts a dedicated server on port 3100 against `TEST_DATABASE_URL`, with generated fixture identities and an overridden test-only secret/allowlist. It does not reuse a running development server or change `.env.local`. Fixture accounts are removed afterward. Google is disabled in this deterministic browser run. CI uses disposable PostgreSQL for these checks.

Official references: [Next.js integration](https://better-auth.com/docs/integrations/next), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [core schema](https://better-auth.com/docs/concepts/database), [atomic custom rate limits](https://better-auth.com/docs/concepts/rate-limit), and [Google](https://better-auth.com/docs/authentication/google). The installed Next.js authentication guide also documents per-render React cache for session lookup; this is not a cross-request session cache.
