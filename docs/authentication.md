# Authentication and account isolation

Phase 2 uses Better Auth 1.7.10 and its matching Drizzle adapter. The framework owns hashing, signed HttpOnly cookies, session storage, expiry, OAuth state, and callbacks. There is no separate session system.

## Configure local access

Set these privately in `.env.local`:

- `DATABASE_URL`: development Neon connection URL, preserving provider TLS parameters. Prefer explicit `sslmode=verify-full`; current pg warns that the meaning of `require` will change in a future major release.
- `BETTER_AUTH_SECRET`: high-entropy random secret, at least 32 characters. Keep separate secrets per environment.
- `BETTER_AUTH_URL`: the app's exact canonical origin, normally `http://localhost:3000` locally. This is **not** a Neon Auth endpoint: this app hosts Better Auth itself at `/api/auth` and uses Neon for PostgreSQL storage.
- `NEXT_PUBLIC_APP_URL`: the application URL; contains no secrets.

Registration and sign-in are public following the October 26 owner amendment. Legacy `TESTER_ACCESS_MODE` and `TESTER_EMAIL_ALLOWLIST` variables are ignored; no allowlist maintenance is needed. Every protected operation still requires a valid session and scopes records to that session's user ID. SMTP recipient approval remains independent.

On production Vercel, `VERCEL_PROJECT_PRODUCTION_URL` supplies the canonical HTTPS origin. Local/self-hosted environments use `BETTER_AUTH_URL`, falling back to `NEXT_PUBLIC_APP_URL` then localhost. Configured URLs are normalized to their origin so trailing slashes do not cause mismatches. Neither request Host nor Origin headers determine the trusted origin. CSRF, same-origin mutations, secure cookies and rate limits remain enabled. Domains configured in Neon Auth do not configure this app's self-hosted Better Auth instance.

Run `npm run db:migrate`, then `npm run dev`. Visit `/register`, create an account with a 12–128 character password, and review the detected time zone under `/app/settings`. If browser detection fails, the visible UTC fallback requires review. New users receive preferences idempotently on first account/settings access, including after OAuth. Profile time-zone changes only update preferences; they do not reinterpret existing reminders.

## Google OAuth

Set both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to enable the Google button. Configure the consent screen/test users and these exact callbacks in Google Cloud:

- Local: `http://localhost:3000/api/auth/callback/google` (or the exact origin in `BETTER_AUTH_URL`).
- Deployment: `https://<your-domain>/api/auth/callback/google`.

Owner amendment, October 20: only Google's verified email claims are accepted. Verified Google sign-in links to an existing account with the same email and retains that user ID, password login, preferences and reminder ownership. If no account exists, Better Auth creates the user/provider account and session. Returning Google sign-ins reuse the stored provider subject. Different email addresses are not linked, and no provider is configured as trusted to bypass verification. The existing Google profile hook rejects an unverified claim before linking or user creation. There is no separate V1 account-linking/recovery UI. A live callback must still be checked with the owner's Google account after this change.

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

`npm run test:e2e` starts a dedicated server on port 3100 against `TEST_DATABASE_URL`, with generated fixture identities and an overridden test-only secret. It does not reuse a running development server or change `.env.local`. Fixture accounts are removed afterward. Google is disabled in this deterministic browser run. CI uses disposable PostgreSQL for these checks.

Official references: [Next.js integration](https://better-auth.com/docs/integrations/next), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [core schema](https://better-auth.com/docs/concepts/database), [atomic custom rate limits](https://better-auth.com/docs/concepts/rate-limit), and [Google](https://better-auth.com/docs/authentication/google). The installed Next.js authentication guide also documents per-render React cache for session lookup; this is not a cross-request session cache.

## October 20 linking and callback correction

The owner explicitly replaced the earlier disabled-linking policy after a real Google callback returned `account_not_linked` for an existing password account. The pinned Better Auth version defaults to requiring a locally verified user before implicit linking. V1 intentionally has unverified password registration, so `requireLocalEmailVerified: false` is explicitly configured together with `enabled: true`, an empty trusted-provider list, `allowDifferentEmails: false` and the strict Google `email_verified === true` profile gate. This accepts Google ownership proof for the same email rather than requiring a local verification email. It preserves an existing password credential; V1's unverified-registration limitations still apply, including pre-registration risk when automatically associating an unverified local row. The framework marks the row verified after successful linking. The local-verification override is deprecated in the pinned framework and must be reviewed before a future framework upgrade.

The HTTP adapter also preserves empty OAuth redirect responses before attempting JSON sanitization: Better Auth may return a redirect with a JSON content type but no body. Attempting `response.json()` on that response previously produced the generic internal-error JSON. Redirect Location and Set-Cookie headers, including session/state cookies, must survive; thrown framework redirect APIErrors are normalized too. Ordinary JSON responses still remove tokens/password/session internals.

Automated OAuth checks use synthetic provider profiles and mock Google's authorization-code exchange only; they exercise real state cookies, callbacks, profile mapping, PostgreSQL linking/new-user creation and sessions. They do not use the owner's OAuth code, tokens or external Google identity. Real provider confirmation remains a separate owner checkpoint.
