# RemindMe implementation plan

Source of truth: [prd.md](./prd.md), version 1.0. Plan created October 18, 2026.

## Starting point and scope

Repository inspection found `prd.md`, a minimal `README.md`, and `LICENSE`. There is no application, package configuration, schema, migration, or test suite yet. No implementation conflicts were found. This document plans the work; it does not indicate that external services have been configured or tested.

Build V1 in the PRD's order: correctness, user isolation, scheduling, delivery, usability, then polish. Keep Next.js App Router, TypeScript, Zod, Better Auth, Drizzle, Neon PostgreSQL, Gemini, browser speech recognition, Nodemailer/SMTP, Azure Functions, and Vercel as the agreed stack.

Exclude billing, shared workspaces, calendar integration, SMS/push, recurring reminders, native apps, autonomous AI actions, email verification, password reset, full offline synchronization, and a separate Express server.

## How we will work through this plan

- Work through phases sequentially; split each phase into small, reviewable changes.
- A checked task means implemented and verified. Record partial work or blockers in the progress log instead of checking it prematurely.
- Establish a usable manual reminder flow before adding AI or email. Add basic functional screens in earlier phases; Phase 7 completes the UI and PWA.
- Use an injectable clock, real PostgreSQL for transaction/concurrency tests, mocked AI/SMTP for automated tests, and dedicated test accounts for live checks.
- Run relevant tests, lint, type checks, and applicable builds at each phase gate. Fix regressions before proceeding.
- Keep new tests focused on risky behavior; prioritize implementation and avoid expanding unrelated test matrices (owner preference).
- Update README, environment examples, and operational notes as behavior or configuration changes.
- Record external checks as pending until performed; a mock or successful local build does not prove a deployed integration works.
- Do not put credentials, real reminder contents, or private deployment values in this file or test fixtures.

## Progress tracker

| Phase | Outcome                                         | Status                                      |
| ----- | ----------------------------------------------- | ------------------------------------------- |
| 1     | Repository, runtime, database foundation        | Complete                                    |
| 2     | Authentication and ownership boundaries         | Implemented; live Google OAuth pending      |
| 3     | Manual reminder CRUD and durable schedules      | Complete                                    |
| 4     | Confirmed AI parsing and optional voice capture | Implemented; live microphone checks pending |
| 5     | SMTP delivery, attempts, and retries            | Complete                                    |
| 6     | Independently deployed Azure timer worker       | Not started                                 |
| 7     | Complete mobile UI and installable PWA          | Not started                                 |
| 8     | Production deployment and operational hardening | Not started                                 |
| 9     | Reproducible documentation and handoff          | Not started                                 |

## Confirmed implementation decisions

The owner confirmed D1–D10 on October 18, 2026. The full policies and acceptance tests are preserved in [docs/decisions.md](./docs/decisions.md). These decisions govern implementation where they refine PRD behavior.

- D1: verify official compatibility; pin exact dependencies and one lockfile. See [compatibility evidence](./docs/compatibility.md).
- D2: preserve original creation anchor on edits/reopening; omit thresholds at or before now.
- D3: date-only means 23:59 local; ambiguous/nonexistent DST times require clarification.
- D4: coalesce due thresholds to the most advanced; audit cancellation reasons. Cancel unsent threshold work after the deadline as `deadline_passed`.
- D5: completion/deletion are idempotent; deletion is soft; reopening retains creation anchor; no archive UI in V1.
- D6: title 160, description 2,000, source 4,000 characters; priority low/normal/high (normal default); pagination 20/max 100; AI 10/min/user; auth 10/15min/key; SMTP delays 1/5/15/60 minutes, five attempts; batch 25, concurrency 5, lease five minutes; validate configurable bounds.
- D7: transaction-capable PostgreSQL driver in both runtimes; verify row locks using real PostgreSQL.
- D8: atomic PostgreSQL-backed shared rate limiting with expiry/cleanup and HTTP 429.
- D9: server-enforced tester allowlist by default; explicit all/public mode opens access; separately approved SMTP recipients; verified Google identities; no automatic email-only account linking.
- D10: profile time-zone changes affect new reminders only; existing deadlines, schedules, and interpretation zones remain unchanged.

Implementation follow-ups: select the DST library in Phase 3, implement and test each policy in its phase, and verify actual Azure startup in Phase 6. Compatibility verification does not imply deployment verification.

## Phase 1 — Repository and foundation

Expected files: root package/TypeScript/lint/format configuration, `src/app/`, `src/lib/env/`, `src/lib/db/`, `drizzle.config.ts`, `migrations/`, `tests/`, `.env.example`, `.gitignore`, CI configuration, and `README.md`.

### Repository and runtime

- [x] Verify repository status and applicable repository instructions before implementation; preserve PRD and license.
- [x] Record D1 runtime/package-manager choices and compatibility sources; verify installed versions with checks.
- [x] Scaffold Next.js App Router with strict TypeScript and a minimal Tailwind styling foundation.
- [x] Establish server-only module boundaries so database, auth, Gemini, and SMTP secrets cannot enter client bundles.
- [x] Add scripts for development, production build/start, lint, type checking, unit/integration/E2E tests, migration generation, and migration application.
- [x] Add formatting, dependency lockfile, runtime version configuration, and ignores for secrets, local settings, build output, reports, and dependencies.
- [x] Configure Vitest and Playwright with an initial meaningful application smoke check.
- [x] Configure CI for clean install, lint, type checks, applicable tests, and build; distinguish tests requiring external configuration.

### Environment and database

- [x] Add Zod environment validation separately for web, worker, and shared server settings. Avoid requiring SMTP or Gemini secrets in runtimes that do not use them.
- [x] Add placeholder-only `.env.example` covering database/direct migration URL if needed, Better Auth, OAuth, Gemini, SMTP, sender, and public application URL.
- [x] Define explicit local, test, preview, and production environment separation.
- [x] Set up a development Neon database and an isolated integration-test database/branch; never reset production data in tests.
- [x] Configure confirmed D7 using Drizzle/node-postgres and verify a real connection with bounded timeout behavior.
- [x] Establish migration generation/review/application workflow. No product tables exist yet; first auth migration is explicitly deferred to Phase 2. Never use schema push as the production release process.
- [x] Document local startup, required credentials, migration commands, and how to run checks.

Exit gate:

- [x] A clean lockfile installation succeeds; the app starts locally, passes foundation checks, and builds.
- [x] Development database connectivity and migration execution are verified; missing external credentials are recorded as blockers.

## Phase 2 — Authentication and user isolation

Expected files: `src/lib/auth/`, auth schema and migration, preference schema/repository, `src/app/api/auth/[...all]/route.ts` or the documented equivalent, auth pages, protected app layout, auth integration tests.

### Authentication

- [x] Integrate Better Auth's documented Next.js and Drizzle adapter; generate/review its supported user, session, account, and verification table schema as applicable.
- [x] Add versioned auth and `user_preferences` migrations; reference the actual Better Auth user ID type rather than assuming auth IDs are UUIDs.
- [x] Implement email/password registration, sign-in, sign-out, validation messages, and session persistence.
- [x] Implement Google OAuth with verified-claim checks, conditional UI, trusted origins, and documented callbacks.
- [ ] Configure real Google credentials and run the live OAuth/collision checks.
- [x] Disable automatic account linking and verify its configuration and the blocked account-management surface. Live matching-email provider collision behavior remains part of the Google gate.
- [x] Verify supported password hashing and production cookie settings: HttpOnly, Secure, and appropriate SameSite.
- [x] Enforce sessions and the D9 tester allowlist on the server for protected pages/APIs; handle expired/revoked sessions and non-approved accounts consistently.
- [x] Add PostgreSQL-backed atomic auth rate limiting (D6/D8), cleanup and HTTP 429; verify trusted-origin/CSRF handling for cookie-authenticated mutations.
- [x] Document that email/password addresses are unverified and no self-service password recovery exists in V1.

### Preferences and ownership infrastructure

- [x] Detect browser IANA time zone during onboarding, validate it server-side, and ask the user to review the value; use an explicit reviewed fallback if detection fails.
- [x] Persist preferences idempotently, including accounts created through OAuth.
- [x] Add a server session helper and repository conventions that require authenticated owner identity.
- [x] Standardize validation, unauthorized, forbidden/not-found, conflict, and sanitized internal error responses without revealing record existence unnecessarily.
- [x] Build a reusable two-user integration fixture; test direct server access as well as HTTP handlers.

Exit gate:

- [x] Registration, password sign-in/out, reload persistence, and protected route rejection pass.
- [ ] Google OAuth is verified in a suitable configured test environment; account collisions do not cause unsafe linking.
- [x] Preferences are isolated; unauthenticated, non-allowlisted, and cross-user access is rejected server-side. Verify Google identity claims and explicit public-access configuration. Extend ownership tests to every reminder path in Phase 3.

## Phase 3 — Reminder CRUD and deadline handling

Expected files: reminder/notification/attempt schemas and migration, `src/lib/validation/`, `src/services/reminders/`, `src/services/scheduling/`, `src/repositories/`, reminder/settings Route Handlers, basic manual form and list/detail screens, unit/integration tests.

### Data model and invariants

- [x] Create `reminders` with UUID ID, owner FK, title, nullable description/source text/priority, `due_at` TIMESTAMPTZ, original local `due_date`, deadline type, IANA zone, status, completion timestamp, schedule version, timestamps, and nullable soft-delete timestamp.
- [x] Create `scheduled_notifications` with reminder FK, threshold, version, scheduled instant, status, attempt count, retry time, processing timestamp, sent timestamp, provider ID, sanitized error code, nullable cancellation reason for D4 auditability, and timestamps.
- [x] Create `notification_attempts` for immutable attempt outcomes and sanitized errors; refine claim fencing fields in Phase 6 if needed.
- [x] Add database checks for valid statuses, deadline types, thresholds, and nonnegative counters; enforce unique `(reminder_id, schedule_version, threshold_percent)`.
- [x] Index owner/status/deadline queries, due pending/retry work, stale processing work, and attempt-history lookup.
- [x] Associate queue and history ownership through the reminder FK; enforce ownership joins whenever returning either to an app user.
- [x] Review migration SQL, apply it to development/test databases, and test constraints directly.

### Deadline and scheduling domain

- [x] Implement confirmed schedule anchors, DST rejection, status transitions, input/pagination limits, and preference-zone stability (D2/D3/D5/D6/D10). Persist D4 cancellation audit fields; catch-up execution remains Phase 6.
- [x] Implement strict request schemas for create/edit/status/settings operations with length and format limits; reject unexpected ownership/status fields.
- [x] Convert explicit local date/time and IANA zone to a UTC instant without using the host's local zone.
- [x] Convert date-only input to 23:59 local time while preserving `date_only`, local date, and interpretation zone.
- [x] Validate impossible dates, invalid IANA zones, leap days, offset boundaries, DST gaps/overlaps, and ambiguous local times.
- [x] Implement pure threshold calculation: `created_at + p * (due_at - created_at)` for p = 0.50, 0.75, 0.90; use one injected operation clock and documented precision/boundary rules.
- [x] Skip schedule times at or before now; allow past deadlines as overdue reminders with no new queue records.
- [x] Verify the PRD's example: October 20 18:00 to October 30 18:00 yields October 25 at 18:00, October 28 at 06:00, and October 29 at 18:00.

### Services, APIs, and basic usable UI

- [x] Implement atomic reminder + schedule creation with rollback on failure.
- [x] Implement owned active/completed lists, detail lookup, stable ordering, bounded pagination, overdue state, and optional next-notification summary.
- [x] Implement title/description edits without schedule regeneration.
- [x] Implement deadline edits with a transaction, reminder locking/version increment, cancellation of obsolete unsent work, and new future schedule records.
- [x] Implement completion and soft deletion that invalidate outstanding work transactionally; workers must also reject obsolete processing claims.
- [x] Implement reopening according to D5 with a fresh version and no duplicate eligible work.
- [x] Protect against concurrent edits/status changes with documented locking or optimistic concurrency behavior.
- [x] Implement the PRD reminder API routes, settings GET/PATCH, and server ownership checks in every query.
- [x] Build basic authenticated manual creation, active list, detail/edit, complete/reopen/delete, completed list, and time-zone settings so this phase can be tested without AI/email.
- [x] Require explicit confirmation for deletion and display actionable validation/save failures without losing form input.

### Verification

- [x] Unit-test deadline conversion, DST policy, thresholds, exact-now boundaries, short/past deadlines, and validation. Verify rescheduling/status transitions against PostgreSQL with an injected fixed clock.
- [x] Integration-test transactional rollback, uniqueness, deadline replacement, title-only edits, completion/deletion cancellation, reopening, and concurrent mutations.
- [x] With two users, test read/list/edit/complete/reopen/delete/settings/history isolation, including known foreign UUIDs and attempted owner-ID injection.
- [x] Run manual CRUD E2E flows and prove persisted schedules match expected UTC instants.

Exit gate:

- [x] Manual reminder workflows work with real database persistence, correct deadlines, transactional schedule replacement, and passing ownership tests.
- [x] AI and SMTP availability are not required for manual CRUD.

## Phase 4 — AI parsing and voice input

Expected files: `src/services/ai/`, parse schemas, `src/app/api/ai/parse/route.ts`, confirmation/clarification UI, speech recognition hook/control, provider fixtures and tests.

- [x] Select a supported Gemini SDK/model using current official documentation; keep model selection/configuration server-side.
- [x] Define strict structured parse output: title, optional description/explicit priority, local deadline fields, deadline type, relevant zone, and clarification state/question.
- [x] Send current date/time and the user's persisted IANA zone as context; interpret relative dates in that zone.
- [x] Treat reminder text as untrusted data, validate provider output with Zod, and revalidate all confirmed fields independently on save.
- [x] Add protected parsing with request limits, durable rate limiting from D8, bounded provider timeout/retries, and sanitized errors.
- [x] Preserve original input through parsing, clarification, provider errors, manual fallback, and confirmation edits.
- [x] Handle missing dates/times, ambiguous weekdays, vague phrases such as “morning,” and DST ambiguity through clarification rather than silently inventing a deadline.
- [x] Show an editable confirmation form and save only after explicit user confirmation; parsing never writes reminders or triggers notifications.
- [x] Implement manual creation fallback for unavailable, rate-limited, malformed, and timed-out responses.
- [x] Add feature-detected browser speech recognition, start/stop states, editable transcription, and cleanup on navigation/unmount.
- [x] Request microphone access only on user action; explain unsupported browsers, permission denial, and recognition errors while retaining text input.
- [x] Test valid/malformed/provider-error responses, relative dates with a fixed clock, clarification, input preservation, and no mutation during parse.
- [x] E2E-test parse → correction → confirmation → persisted reminder using deterministic provider fixtures; separately record a real Gemini smoke check.
- [ ] Manually verify supported voice capture and unsupported/denied fallbacks on representative browsers.

Exit gate:

- [ ] Text and supported voice input produce an editable, validated, explicitly confirmed reminder; provider failures leave manual creation usable.

## Phase 5 — Email delivery

Expected files: `src/lib/email/`, `src/services/notifications/`, attempt repository, email templates, guarded CLI test command, email tests, SMTP setup documentation.

- [x] Configure Nodemailer from validated SMTP settings; validate port/TLS combinations and keep provider-specific behavior outside domain logic.
- [x] Implement escaped HTML and plain-text templates with title, deadline, interpretation zone, threshold context, and safe application links.
- [x] Resolve recipient from the persisted reminder owner and enforce D9 explicit SMTP recipient approval immediately before sending; never accept an arbitrary recipient from an application request.
- [x] Check active/not-deleted status and schedule version immediately before delivery.
- [x] Implement success/failure recording, attempt counts, timestamps, provider message IDs, and sanitized operational logs.
- [x] Classify transient, permanent, and uncertain errors; define bounded configurable backoff (D6 defaults: 1/5/15/60 minutes) and final failure behavior.
- [x] Ensure sent/cancelled/terminal-failed work is not retried and retry writes cannot resurrect cancelled schedules.
- [x] Set connection/socket/send timeouts compatible with the planned worker lease and invocation budget.
- [x] Provide a CLI or documented non-public test procedure requiring an explicitly configured test destination; no public scheduler trigger endpoint.
- [x] Mock SMTP to test recipient isolation, escaped content, time-zone/threshold context, success, permanent failure, retry exhaustion, and inactive/version-mismatched reminders.
- [x] Send a live test email with test credentials and record SMTP acceptance, recipient receipt, and persisted outcome separately.
- [x] Document SMTP limits, credential rotation, and the crash-after-acceptance duplicate-send window; do not promise exactly-once delivery.

Exit gate:

- [x] A controlled live test reaches the intended recipient with recorded outcome; mocked failure/retry/isolation tests pass.

## Phase 6 — Azure scheduler and queue reliability

Expected files: `azure-functions/notification-scheduler/` entry point/package/host and local-settings example, reusable queue processor, claim/recovery repository, possible lease-field migration, integration/failure tests, deployment notes.

### Worker implementation

- [ ] Build a Next.js-independent shared processor and independently deployable Azure Functions adapter; verify packaging includes shared code and runtime dependencies without importing Next.js-only modules.
- [ ] Verify official runtime/plan support and configure the documented one-minute timer expression; include required storage coordination settings.
- [ ] Atomically claim a bounded due batch with transactions and `FOR UPDATE SKIP LOCKED` or an equivalently verified PostgreSQL strategy.
- [ ] Select both newly due work and retries whose effective eligibility time has arrived; never load the full queue.
- [ ] Use short claim transactions; avoid holding database locks while waiting for SMTP.
- [ ] Add claim ownership/fencing if necessary so an expired worker cannot overwrite a newer claim's result; add a reviewed migration for extra fields.
- [ ] Implement bounded concurrency, per-run time budget, connection/query timeouts, graceful exit, and backpressure.
- [ ] Recheck reminder status/deletion, schedule version, owner existence, recipient, and claim validity immediately before each send.
- [ ] Record outcomes through the Phase 5 delivery service and guarded state transitions; preserve cancellation when completion/edit races with delivery.
- [ ] Recover stale claims after a documented lease timeout and account for maximum SMTP duration; cap repeated crash recovery rather than retrying forever.
- [ ] Implement D4: send only the most advanced overdue threshold per reminder; cancel coalesced work with `coalesced_catch_up` and all unsent work after deadline with `deadline_passed`; record audit reasons transactionally.
- [ ] Log invocation/notification/reminder IDs, durations, attempts, queue age, and sanitized outcomes without reminder bodies or secrets.

### Failure and deployment verification

- [ ] Integration-test overlapping workers, unique claims, stale recovery, late stale-worker updates, retry eligibility, partial batch failure, and bounded processing.
- [ ] Test edit/complete/delete during claim and before send; verify old schedule versions cannot produce eligible future sends.
- [ ] Simulate database disconnect/wake-up delay, SMTP timeout, worker crash before send, and crash after SMTP acceptance before status persistence.
- [ ] Verify recorded sent work is skipped; document the residual SMTP acceptance window and post-final-check cancellation race.
- [ ] Verify subscription plan availability, region, storage requirements, outbound SMTP connectivity, and resource costs before provisioning.
- [ ] Deploy a development function with its own database/SMTP settings; verify real timer executions, Neon access, receipt, persisted status, and stale recovery.

Exit gate:

- [ ] Real due notifications are processed by the deployed timer independently of browser sessions, Vercel requests, or in-memory timers.
- [ ] Concurrency/recovery tests pass and duplicate-send limitations are documented accurately.

## Phase 7 — Application UI and PWA

Expected files: final app pages/components, responsive styles, manifest, icons, service worker, offline page, browser/E2E/accessibility checks.

- [ ] Complete `/`, `/login`, `/register`, `/app`, `/app/new`, `/app/reminders/[id]`, `/app/completed`, and `/app/settings`.
- [ ] Keep landing page minimal; prioritize capture, confirmation, deadline clarity, completion, and recovery from errors.
- [ ] Show date-only deadlines as dates, explicit date/time deadlines with useful zone context, overdue state, and next notification where useful.
- [ ] Complete loading, empty, saving, validation, provider-error, session-expired, offline, and retry states.
- [ ] Ensure mutations refresh displayed state correctly and repeated clicks do not accidentally duplicate submissions.
- [ ] Validate mobile layouts, touch controls, focus handling, labels, keyboard navigation, screen-reader announcements, and color contrast.
- [ ] Add a manifest with name/short name, colors, standalone display, required icons, and `start_url: /app`.
- [ ] Add a service worker that caches only explicitly allowed public/static assets and a generic offline fallback.
- [ ] Exclude private pages, auth/API responses, reminder data, and sensitive navigation responses from service-worker/CDN caching; review actual response headers.
- [ ] Version caches and remove obsolete caches safely; verify service-worker upgrades and logout/account-switch behavior on shared devices.
- [ ] Display a useful offline state without claiming offline edits are saved; recover when connectivity returns.
- [ ] Validate HTTPS installability and installed launch routing; test signed-out launch returns to authentication safely.
- [ ] Run complete user journeys on desktop/mobile browser configurations and manually verify installation on supported devices.

Exit gate:

- [ ] Full workflow is usable on mobile and desktop, PWA launches `/app`, and no private reminder data is exposed through caching across accounts.

## Phase 8 — Deployment and hardening

Expected files: production deployment configuration, CI/release workflow, production migration procedure, monitoring/recovery runbooks, smoke-test checklist.

### Provisioning and release

- [ ] Check current Vercel plan eligibility/limits, Neon limits, Azure subscription credits/expiry, Functions/storage/logging costs, Gemini quotas, and SMTP limits using current provider sources.
- [ ] Provision separate production Neon, Vercel, Azure Function/storage, OAuth, Gemini, and SMTP configuration; avoid unnecessary always-running infrastructure.
- [ ] Configure domain/HTTPS, canonical application/auth URLs, trusted origins, Google redirect URIs, production cookies, and appropriate security headers.
- [ ] Configure Vercel and Azure secrets independently; audit public variables and client bundles for leakage.
- [ ] Define database backup/restore capabilities and verify a restoration procedure in a non-production environment.
- [ ] Review and apply production migrations with a known release order; keep web/worker schema compatibility during independent deployments.
- [ ] Build/deploy web and worker separately; document rollback or forward-fix behavior for code and database changes.
- [ ] Verify production rate limiting and request limits across multiple serverless instances.

### Release checks and operations

- [ ] Run unit, database integration, authorization, email, worker concurrency/recovery, and critical Playwright suites.
- [ ] Verify real production email/password auth and Google OAuth with dedicated test accounts.
- [ ] Create/correct/save/edit a reminder and inspect persisted deadline, version, and schedule; verify complete/delete suppress outstanding work.
- [ ] Verify real timer execution, due selection, SMTP acceptance, recipient receipt, attempt history, and sent-state persistence.
- [ ] Verify provider-failure UI and that existing reminders survive temporary Gemini, database, worker, or SMTP outages.
- [ ] Verify PWA install/start route and authenticated cache isolation on the deployed origin.
- [ ] Configure sanitized logging and practical signals for timer silence, oldest due queue item, terminal failures, retry growth, and database errors.
- [ ] Configure available usage/credit alerts and document expected meters, limits, credit expiration, and who reviews them.
- [ ] Document credentials rotation, worker outage recovery, queue inspection, safe failed-item replay, and duplicate-delivery investigation.
- [ ] Remove dedicated smoke-test data safely and record results without using real user reminders for destructive tests.

Exit gate:

- [ ] Production passes critical acceptance checks with observed external integration results and no unresolved critical isolation, scheduling, or delivery defect.

## Phase 9 — Documentation and handoff

Expected files: expanded `README.md`, environment examples for both runtimes, focused `docs/` guides, completed release/progress evidence.

- [ ] Document architecture, directory layout, trust boundaries, service/repository responsibilities, and independently deployed runtimes.
- [ ] Document clean-checkout prerequisites, pinned runtime, installation, local web/worker startup, database setup, and all check commands.
- [ ] Document every environment variable, which runtime consumes it, whether secret/public, and environment-specific setup; include placeholders only.
- [ ] Document schema/migration generation, review, test application, production rollout, and recovery procedures.
- [ ] Document Better Auth/Google setup, callback URLs, linking policy, unverified-address limitation, and lack of password recovery.
- [ ] Document Gemini parsing, clarification, manual fallback, supported voice behavior, and known browser limitations.
- [ ] Document date-only/DST/time-zone behavior, schedule anchors, reopening, retry policy, catch-up policy, and SMTP duplicate/race limitations.
- [ ] Document SMTP setup and explicit-recipient test procedure, sender requirements, limits, and credential rotation.
- [ ] Document Vercel and Azure setup/deployment, timer/storage configuration, monitoring, and cost/credit considerations.
- [ ] Document moving the reusable worker to another scheduler host without changing reminder business logic.
- [ ] Document known V1 limitations and troubleshooting for login, AI failures, wrong local times, stuck claims, database wake-up, and email failures.
- [ ] Verify setup instructions from a clean checkout and perform a non-production recovery exercise using the runbook.
- [ ] Reconcile this checklist with PRD Definition of Done; record remaining issues explicitly rather than declaring unsupported success.

Exit gate:

- [ ] Another developer can reproduce, test, deploy, and troubleshoot the system using repository documentation.

## Final V1 acceptance checklist

- [ ] Email/password and Google OAuth work with secure persistent sessions and safe account linking behavior.
- [ ] Reminder, preference, notification, and history access is isolated per user, including direct API/server access.
- [ ] AI produces validated, editable data and requires confirmation; voice has reliable text fallback.
- [ ] Manual CRUD remains available when AI fails.
- [ ] Date-only, date/time, UTC persistence, IANA zones, relative dates, and DST policy pass tests.
- [ ] Persisted 50%/75%/90% schedules are transactional, versioned, and replaced correctly on deadline edits.
- [ ] Completion/deletion suppress pending work, and reopening follows documented rules.
- [ ] The real Azure timer claims bounded work safely, handles retries/missed runs, and recovers stale claims.
- [ ] Configurable SMTP delivers to the correct owner and records attempts/outcomes without leaking private content.
- [ ] Residual SMTP duplication and cancellation races are documented without exactly-once claims.
- [ ] The mobile-accessible PWA installs where supported, launches `/app`, and does not cache private data unsafely.
- [ ] Critical automated checks and production smoke tests pass; actual external checks have recorded evidence.
- [ ] Secrets stay out of Git/client bundles; costs, limitations, deployment, and recovery are documented.
- [ ] All explicit non-goals remain outside V1.

## Phase completion log

Append an entry after each completed phase or meaningful blocked checkpoint:

```text
Date / phase:
Completed tasks:
Files and migrations changed:
Decisions made (D1–D10 or new decision):
Checks run and results:
External checks performed / still pending:
Known limitations or blockers:
Next task:
```

Initial checkpoint: planning complete; implementation has not started. Next task: Phase 1 repository/runtime compatibility and foundation setup.

### October 18, 2026 — Phase 1 local foundation verified

- Completed: recorded confirmed D1–D10; scaffolded Next.js/TypeScript/Tailwind; added server-only boundaries, separate runtime environment schemas, Drizzle/node-postgres connections, bounded database settings, migration commands, placeholders, tests, formatting, and CI configuration.
- Files: root toolchain configuration and lockfile; `src/app/`, `src/lib/env/`, `src/lib/db/`, `scripts/db-check.ts`, `tests/`, `.github/workflows/checks.yml`, documentation, and the Next.js-generated `AGENTS.md` (retained as instructed by the framework).
- Compatibility: Node 22, npm 11.21.1, exact dependency pins. Patched Vitest to 4.1.11 after audit; npm 11.21.1 resolved the host npm 11.4.1 Arborist crash. See `docs/compatibility.md` for evidence and remaining tooling limitations.
- Passed: clean `npm ci` through the selected npm release; lint with no warnings after configuration cleanup; TypeScript; formatting; production build; seven unit tests; Chromium E2E smoke test (one passed); `git diff --check`.
- Audit: zero production dependency vulnerabilities. Full report retains nine development-tool findings (four moderate, five high); no critical findings. Do not use forced major downgrades as an automatic fix.
- Deferred by owner: no Neon database is available yet. `db:check` and the PostgreSQL integration test were attempted and reported missing configuration. Real connectivity, rollback, row-lock behavior, and CI execution have not been verified. Docker is installed locally but its engine is not running.
- Migrations: tooling/workflow is ready. First product migration is deliberately deferred to the Better Auth schema in Phase 2; no artificial table or applied migration is claimed.
- Remaining Phase 1 gate: provision development and isolated test Neon databases; privately configure `.env.local` and `.env.test.local`; run `npm run db:check` and `npm run test:integration`. The phase remains open until these checks pass.
- Next: complete that database gate, then begin Phase 2 authentication and server-enforced tester access. No auth, reminder, AI, SMTP, Azure, or production deployment functionality is claimed yet.

### October 18, 2026 — Phase 1 complete; Phase 2 implemented, live Google gate open

- Phase 1 completion: the owner's configured development connection passes `npm run db:check`. The separate TEST_DATABASE_URL passes real transaction rollback and two-client SKIP LOCKED tests. The first reviewed versioned migration is applied to development and integration-test databases.
- Phase 2 implementation: Better Auth 1.7.10 and its matching Drizzle adapter; email/password registration and sign-in/out; durable server-validated sessions; conditional Google provider/button; verified Google profile gate; automatic linking disabled; server-enforced allowlist; owner-approved `all` mode (`public` alias); protected pages; strict, isolated preferences; browser time-zone detection and explicit review; atomic PostgreSQL rate limits; bounded request bodies; private auth response serialization; no reset/verification workflows.
- Migration: `migrations/0000_clever_night_nurse.sql` and Drizzle metadata create user, session, account, verification, user_preferences, and rate_limits tables with FK/index/uniqueness rules.
- Passed: development DB connection/migration; 12 unit tests; 10 real PostgreSQL integration tests; two Chromium E2E tests including registration, reload persistence, preference isolation, sign-out, and sign-in. Lint, TypeScript, formatting, and the production build are verified in the final check pass.
- Security evidence: forged/missing sessions rejected; removed tester access denied; unlisted users denied by default and admitted in explicit all mode; owner-ID injection rejected; foreign Origin mutations rejected; credentials hashed; session response tokens omitted; HttpOnly/SameSite and HTTPS Secure cookie settings checked; concurrent limits tested across pools; exhausted account windows return HTTP 429 with Retry-After.
- External checks pending: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not configured. The Google provider mapping/configuration tests pass, but an actual Google exchange, consent-screen setup, and matching-email account collision require manual verification with real credentials. Phase 2 remains open for that gate. No deployment or later-phase integrations are claimed.
- Configuration: `.env.local` was read privately; credentials were not printed or copied into tracked files. Browser tests use dedicated port 3100, the test DB, temporary fixture accounts, and an overridden test-only secret/allowlist. Normal developer settings are not changed.
- Audit: the nine existing tooling findings remain. Better Auth's optional Drizzle Kit peer causes four moderate migration-tool findings to appear in the production-omitting-dev audit; no Drizzle Kit files appeared in the inspected production auth-route trace. See compatibility notes for the limitation rather than claiming a clean production audit.
- Next task: configure Google OAuth using `docs/authentication.md`, verify live sign-in/collision handling, close Phase 2, then begin Phase 3 manual reminders and durable scheduling.

### October 18, 2026 — Phase 3 complete

- Implemented manual create/list/detail/edit/complete/reopen/soft-delete flows and active/completed views. Added explicit deletion confirmation, overdue indicators, schedule/history display, strict pagination, and revision-conflict recovery that preserves drafts.
- Added reminders, scheduled_notifications, and notification_attempts with version/revision counters, FK ownership, validation/status checks, queue uniqueness, and due/retry/stale/history indexes. Reviewed and applied `0001_nosy_kid_colt.sql` to development and isolated test databases.
- Selected @js-temporal/polyfill 0.5.1. Date-only deadlines resolve to 23:59 in the reminder's IANA zone; invalid dates and missing/repeated local times are rejected for clarification. Existing instants/zones do not change with profile preferences.
- Scheduling uses the original creation anchor, 50/75/90 percent, integer-millisecond arithmetic, and future-only records. Creation and replacement are transactional. Completion/deletion cancel pending and processing work; sent history remains intact. Reopening uses a new version and the original anchor. No archive UI was added.
- Corrected the PRD's 75% example to October 28 at 06:00 for the October 20 18:00 → October 30 18:00 interval. The locked formula is unchanged; an explicit unit test verifies the arithmetic.
- Passed: 28 unit tests; 18 real PostgreSQL integration tests; public/auth browser flows plus the full reminder browser journey (three browser tests across the full run and targeted final rerun). The new reminder journey verifies persisted formula times, unchanged-title schedules, deadline replacement, stale draft preservation, immediate post-save completion, completed views, reopening, deletion cancellation/confirmation, and a second account's denied access.
- Database failure evidence: a scoped test trigger forces queue insert failure and proves both reminder creation and schedule replacement roll back fully. Concurrent edits produce one success and one conflict. Repeated completion/deletion preserve original state timestamps. Ownership tests cover HTTP and repository read/edit/complete/reopen/delete/history paths.
- Fixed a browser-observed race by sharing the just-saved revision with action controls immediately, rather than waiting for a server-page refresh. Stale edits from another tab remain rejected.
- Final checks: lint, TypeScript, formatting, unit tests, and production build pass. The browser test app has its own `.next-e2e` output and port 3100, so the owner's running development server is preserved. Tests blank AI/SMTP keys and use isolated fixture accounts/databases.
- Configuration evidence: local Gemini and SMTP settings are present; the owner reports a successful SMTP test. Phase 3 performs no AI interpretation or SMTP sends. Existing dependency-tool advisories remain documented. Live Google OAuth remains a separate Phase 2 external gate because its expected client credential variables are absent.
- Documentation: updated README, migration guide, decisions, corrected PRD example, and `docs/reminders.md` with API, time, concurrency, transaction, and verification behavior.
- Next task: Phase 4 — Gemini parsing, editable confirmation/clarification, manual fallback, and browser voice capture. Delivery and the timer worker remain Phases 5–6.

### October 18, 2026 — Phase 4 implemented; live microphone gate open

- Added natural-language capture, clarification answers, editable confirmation, and explicit-save behavior to New reminder. Original text survives errors and manual fallback and is persisted with confirmed reminders. Existing manual/edit workflows remain available.
- Added strict Zod provider output, fixed local date/time context from persisted preferences, Temporal calendar/DST validation, and independent save validation. Parsing treats user input as data and cannot create reminders or schedules.
- Protected `/api/ai/parse` with sessions/tester policy, same-origin checks, 32 KiB bodies, bounded text/history, PostgreSQL-backed ten-per-minute user limits, sanitized errors, a 25-second provider deadline and no automatic retries.
- Pinned official `@google/genai` 2.30.0; server-only model configuration defaults to `gemini-3.8-flash`. Two real synthetic provider requests passed: tomorrow at 3 PM across a UTC/Auckland date boundary, and clarification for tomorrow morning. `npm run ai:check` repeats these without database access or saved reminders.
- Added feature-detected browser speech recognition with click-to-start access, stop/listening states, editable transcription, permission/service-error messaging, text fallback and unmount cleanup. Physical microphone capture and representative browser permission behavior remain pending; the Phase 4 exit gate stays open for those hands-on checks.
- Verification kept focused per owner preference: four new unit cases (32 total pass), one expanded existing browser journey, lint, TypeScript, formatting and production build. The browser journey verifies real provider-unavailable behavior, retained text, deterministic clarification, no reminders before confirmation, corrected saved title/date, original source persistence, and continued manual CRUD/isolation. An initially ambiguous browser error selector was scoped and the rerun passed.
- Added `docs/ai.md`, environment/model setup, README status and compatibility notes. No migration was needed. Existing dependency tooling advisories remain unchanged. No SMTP delivery or Azure worker work is claimed.
- Next task: Phase 5 email delivery. Outstanding external gates: live microphone checks and the separate Phase 2 Google OAuth exchange.

### October 19, 2026 — Voice correction and Phase 5 complete

- Fixed premature microphone cutoff: enabled continuous recognition, separated native sessions from the user recording session, preserved accumulated text over early browser restarts, and allowed 15 seconds of inactivity after speech ends. Interim hypotheses replace prior hypotheses instead of duplicating text. Stop retains final results, shows a finishing state, and never restarts capture; navigation, permission denial and service failures release recognition and timers. Speech-service accuracy and physical-device behavior still need representative hands-on confirmation.
- Added pinned Nodemailer 10.1.6 with bundled types, strict SMTP/TLS settings, escaped HTML/plain-text reminder templates, safe application links, exact persisted-owner recipient approval, guarded SMTP diagnostics, delivery repository/service, and safe outcome logs.
- Added and applied reviewed `0002_noisy_lady_ursula.sql` to development and isolated test databases. Its nullable claim token fences delivery outcomes. One attempt UUID per token prevents concurrent duplicate execution. Cancellation clears tokens; stale writes cannot revive cancelled work. No database transaction stays open over SMTP.
- Implemented explicit SMTP acceptance, permanent/transient/uncertain failures, bounded attempt counts, D6 retry delays, retry eligibility and deadline limits. Persisted histories retain acceptance even when completion cancels an in-flight queue row. Stable Message-ID aids tracing without claiming SMTP deduplication or exactly-once behavior.
- Passed: 36 unit checks, four targeted PostgreSQL delivery integration cases, TypeScript, lint, formatting and production build. The targeted database checks cover owner recipient resolution, approval rejection, duplicate calls, inactive/replaced schedules, transient/permanent errors, early/exhausted retries, and completion during delivery. Voice checks cover corrected interim text, native restart continuity, silence timing, continued speech, explicit stop, final results and denial/disposal.
- Live evidence: SMTP TLS/authentication verified; the owner explicitly approved one test to the sole configured approved address. One connection-only verification failure occurred before any sending, then the synthetic delivery was accepted on its first send attempt and persisted with a provider message ID. The owner confirmed receipt in chat. The diagnostic reminder is completed with unused thresholds cancelled; no existing reminder was delivered by the test.
- Added `docs/email.md` for configuration, guarded send procedure, provider limits, rotation, timeouts, residual duplicate/cancellation windows, and Phase 6 boundaries; updated README, migration and compatibility notes. No public sending endpoint was added. Authentication fixes from the preceding turn were preserved.
- Next task: Phase 6 — independently deployed Azure timer, bounded queue claims, coalescing, lease recovery and worker failure handling. Automatic scheduled delivery is not enabled yet. UI redesign remains Phase 7.
