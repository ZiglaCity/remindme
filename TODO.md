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
- Update README, environment examples, and operational notes as behavior or configuration changes.
- Record external checks as pending until performed; a mock or successful local build does not prove a deployed integration works.
- Do not put credentials, real reminder contents, or private deployment values in this file or test fixtures.

## Progress tracker

| Phase | Outcome | Status |
| --- | --- | --- |
| 1 | Repository, runtime, database foundation | Not started |
| 2 | Authentication and ownership boundaries | Not started |
| 3 | Manual reminder CRUD and durable schedules | Not started |
| 4 | Confirmed AI parsing and optional voice capture | Not started |
| 5 | SMTP delivery, attempts, and retries | Not started |
| 6 | Independently deployed Azure timer worker | Not started |
| 7 | Complete mobile UI and installable PWA | Not started |
| 8 | Production deployment and operational hardening | Not started |
| 9 | Reproducible documentation and handoff | Not started |

## Decisions to settle during implementation

These are unresolved details, not changes to the locked product decisions. Record the chosen behavior and its tests before implementing dependent code.

- [ ] D1 — Verify current official Node.js LTS, Next.js, Better Auth, Drizzle/Neon, and Azure Functions compatibility. Pin compatible versions and one package manager/lockfile; do not guess runtime support from memory.
- [ ] D2 — Specify the schedule anchor after deadline edits and reopening. Proposed: retain original `created_at` as the formula anchor and omit thresholds at or before the operation's clock time. If choosing a new anchor, document it explicitly rather than silently changing the PRD's formula.
- [ ] D3 — Choose a time-zone library with explicit DST disambiguation. Proposed: require clarification for nonexistent or repeated local times, rather than silently shifting a deadline.
- [ ] D4 — Define catch-up behavior for delayed notifications, including multiple due thresholds for one reminder and deadlines already passed during an outage. Preserve overdue work, bound processing, and document any suppression/coalescing policy before implementing it.
- [ ] D5 — Define reopen behavior, idempotent repeated completion/deletion, past-deadline reopening, and archive support. Archiving must cancel work if exposed; do not add an archive UI without a product need.
- [ ] D6 — Define title/source/description limits, optional priority values, pagination limits, rate limits, retry intervals and cap, queue batch/concurrency limits, and lease duration. Keep operational limits configurable with safe bounds.
- [ ] D7 — Choose a database transaction-capable connection strategy for both runtimes. Validate that the driver actually supports the worker's row locks and multi-statement transactions.
- [ ] D8 — Choose durable rate-limit storage suitable for serverless instances; process-local counters alone cannot enforce a shared limit.
- [ ] D9 — Confirm small-tester registration/access policy and SMTP recipient safeguards given intentionally unverified email/password addresses. Do not add insecure account linking or recovery shortcuts.
- [ ] D10 — Preserve existing reminder instants when changing time-zone preferences. Proposed V1: changes affect new reminders only; any date-only reinterpretation requires a separate explicit action and transactional rescheduling.

## Phase 1 — Repository and foundation

Expected files: root package/TypeScript/lint/format configuration, `src/app/`, `src/lib/env/`, `src/lib/db/`, `drizzle.config.ts`, `migrations/`, `tests/`, `.env.example`, `.gitignore`, CI configuration, and `README.md`.

### Repository and runtime

- [ ] Verify repository status and applicable repository instructions before implementation; preserve PRD and license.
- [ ] Resolve D1 and record runtime/package-manager choices and compatibility sources.
- [ ] Scaffold Next.js App Router with strict TypeScript and a minimal Tailwind styling foundation.
- [ ] Establish server-only module boundaries so database, auth, Gemini, and SMTP secrets cannot enter client bundles.
- [ ] Add scripts for development, production build/start, lint, type checking, unit/integration/E2E tests, migration generation, and migration application.
- [ ] Add formatting, dependency lockfile, runtime version configuration, and ignores for secrets, local settings, build output, reports, and dependencies.
- [ ] Configure Vitest and Playwright with an initial meaningful application smoke check.
- [ ] Configure CI for clean install, lint, type checks, applicable tests, and build; distinguish tests requiring external configuration.

### Environment and database

- [ ] Add Zod environment validation separately for web, worker, and shared server settings. Avoid requiring SMTP or Gemini secrets in runtimes that do not use them.
- [ ] Add placeholder-only `.env.example` covering database/direct migration URL if needed, Better Auth, OAuth, Gemini, SMTP, sender, and public application URL.
- [ ] Define explicit local, test, preview, and production environment separation.
- [ ] Set up a development Neon database and an isolated integration-test database/branch; never reset production data in tests.
- [ ] Resolve D7, configure Drizzle, and verify a real connection with bounded timeout behavior.
- [ ] Establish migration generation/review/application workflow and an initial versioned migration where needed. Never use schema push as the production release process.
- [ ] Document local startup, required credentials, migration commands, and how to run checks.

Exit gate:

- [ ] A clean checkout installs, starts locally, passes foundation checks, and builds.
- [ ] Development database connectivity and migration execution are verified; missing external credentials are recorded as blockers.

## Phase 2 — Authentication and user isolation

Expected files: `src/lib/auth/`, auth schema and migration, preference schema/repository, `src/app/api/auth/[...all]/route.ts` or the documented equivalent, auth pages, protected app layout, auth integration tests.

### Authentication

- [ ] Integrate Better Auth's documented Next.js and Drizzle adapter; generate/review its supported user, session, account, and verification table schema as applicable.
- [ ] Add versioned auth and `user_preferences` migrations; reference the actual Better Auth user ID type rather than assuming auth IDs are UUIDs.
- [ ] Implement email/password registration, sign-in, sign-out, validation messages, and session persistence.
- [ ] Configure Google OAuth with environment-specific origins, provider credentials, and documented callback URLs.
- [ ] Prevent automatic linking merely on matching email strings; explicitly configure and test provider/account collision behavior.
- [ ] Verify supported password hashing and production cookie settings: HttpOnly, Secure, and appropriate SameSite.
- [ ] Enforce sessions on the server for protected pages and APIs; handle expired/revoked sessions consistently.
- [ ] Add auth rate limiting and verify trusted-origin/CSRF handling for cookie-authenticated mutations.
- [ ] Document that email/password addresses are unverified and no self-service password recovery exists in V1.

### Preferences and ownership infrastructure

- [ ] Detect browser IANA time zone during onboarding, validate it server-side, and ask the user to review the value; use an explicit reviewed fallback if detection fails.
- [ ] Persist preferences idempotently, including accounts created through OAuth.
- [ ] Add a server session helper and repository conventions that require authenticated owner identity.
- [ ] Standardize validation, unauthorized, forbidden/not-found, conflict, and sanitized internal error responses without revealing record existence unnecessarily.
- [ ] Build a reusable two-user integration fixture; test direct server access as well as HTTP handlers.

Exit gate:

- [ ] Registration, password sign-in/out, reload persistence, and protected route rejection pass.
- [ ] Google OAuth is verified in a suitable configured test environment; account collisions do not cause unsafe linking.
- [ ] Preferences are isolated and unauthenticated/cross-user access is rejected. Extend these tests to every reminder path in Phase 3.

## Phase 3 — Reminder CRUD and deadline handling

Expected files: reminder/notification/attempt schemas and migration, `src/lib/validation/`, `src/services/reminders/`, `src/services/scheduling/`, `src/repositories/`, reminder/settings Route Handlers, basic manual form and list/detail screens, unit/integration tests.

### Data model and invariants

- [ ] Create `reminders` with UUID ID, owner FK, title, nullable description/source text/priority, `due_at` TIMESTAMPTZ, original local `due_date`, deadline type, IANA zone, status, completion timestamp, schedule version, timestamps, and nullable soft-delete timestamp.
- [ ] Create `scheduled_notifications` with reminder FK, threshold, version, scheduled instant, status, attempt count, retry time, processing timestamp, sent timestamp, provider ID, sanitized error code, and timestamps.
- [ ] Create `notification_attempts` for immutable attempt outcomes and sanitized errors; refine claim fencing fields in Phase 6 if needed.
- [ ] Add database checks for valid statuses, deadline types, thresholds, and nonnegative counters; enforce unique `(reminder_id, schedule_version, threshold_percent)`.
- [ ] Index owner/status/deadline queries, due pending/retry work, stale processing work, and attempt-history lookup.
- [ ] Associate queue and history ownership through the reminder FK; enforce ownership joins whenever returning either to an app user.
- [ ] Review migration SQL, apply it to development/test databases, and test constraints directly.

### Deadline and scheduling domain

- [ ] Resolve D2–D6 and D10 where they affect this phase; document resulting domain rules.
- [ ] Implement strict request schemas for create/edit/status/settings operations with length and format limits; reject unexpected ownership/status fields.
- [ ] Convert explicit local date/time and IANA zone to a UTC instant without using the host's local zone.
- [ ] Convert date-only input to 23:59 local time while preserving `date_only`, local date, and interpretation zone.
- [ ] Validate impossible dates, invalid IANA zones, leap days, offset boundaries, DST gaps/overlaps, and ambiguous local times.
- [ ] Implement pure threshold calculation: `created_at + p * (due_at - created_at)` for p = 0.50, 0.75, 0.90; use one injected operation clock and documented precision/boundary rules.
- [ ] Skip schedule times at or before now; allow past deadlines as overdue reminders with no new queue records.
- [ ] Verify the PRD's example: October 20 18:00 to October 30 18:00 yields October 25, 28, and 29 at 18:00.

### Services, APIs, and basic usable UI

- [ ] Implement atomic reminder + schedule creation with rollback on failure.
- [ ] Implement owned active/completed lists, detail lookup, stable ordering, bounded pagination, overdue state, and optional next-notification summary.
- [ ] Implement title/description edits without schedule regeneration.
- [ ] Implement deadline edits with a transaction, reminder locking/version increment, cancellation of obsolete unsent work, and new future schedule records.
- [ ] Implement completion and soft deletion that invalidate outstanding work transactionally; workers must also reject obsolete processing claims.
- [ ] Implement reopening according to D5 with a fresh version and no duplicate eligible work.
- [ ] Protect against concurrent edits/status changes with documented locking or optimistic concurrency behavior.
- [ ] Implement the PRD reminder API routes, settings GET/PATCH, and server ownership checks in every query.
- [ ] Build basic authenticated manual creation, active list, detail/edit, complete/reopen/delete, completed list, and time-zone settings so this phase can be tested without AI/email.
- [ ] Require explicit confirmation for deletion and display actionable validation/save failures without losing form input.

### Verification

- [ ] Unit-test deadline conversion, DST policy, thresholds, exact-now boundaries, short/past deadlines, rescheduling, and status transitions with a fixed clock.
- [ ] Integration-test transactional rollback, uniqueness, deadline replacement, title-only edits, completion/deletion cancellation, reopening, and concurrent mutations.
- [ ] With two users, test read/list/edit/complete/reopen/delete/settings/history isolation, including known foreign UUIDs and attempted owner-ID injection.
- [ ] Run manual CRUD E2E flows and prove persisted schedules match expected UTC instants.

Exit gate:

- [ ] Manual reminder workflows work with real database persistence, correct deadlines, transactional schedule replacement, and passing ownership tests.
- [ ] AI and SMTP availability are not required for manual CRUD.

## Phase 4 — AI parsing and voice input

Expected files: `src/services/ai/`, parse schemas, `src/app/api/ai/parse/route.ts`, confirmation/clarification UI, speech recognition hook/control, provider fixtures and tests.

- [ ] Select a supported Gemini SDK/model using current official documentation; keep model selection/configuration server-side.
- [ ] Define strict structured parse output: title, optional description/explicit priority, local deadline fields, deadline type, relevant zone, and clarification state/question.
- [ ] Send current date/time and the user's persisted IANA zone as context; interpret relative dates in that zone.
- [ ] Treat reminder text as untrusted data, validate provider output with Zod, and revalidate all confirmed fields independently on save.
- [ ] Add protected parsing with request limits, durable rate limiting from D8, bounded provider timeout/retries, and sanitized errors.
- [ ] Preserve original input through parsing, clarification, provider errors, manual fallback, and confirmation edits.
- [ ] Handle missing dates/times, ambiguous weekdays, vague phrases such as “morning,” and DST ambiguity through clarification rather than silently inventing a deadline.
- [ ] Show an editable confirmation form and save only after explicit user confirmation; parsing never writes reminders or triggers notifications.
- [ ] Implement manual creation fallback for unavailable, rate-limited, malformed, and timed-out responses.
- [ ] Add feature-detected browser speech recognition, start/stop states, editable transcription, and cleanup on navigation/unmount.
- [ ] Request microphone access only on user action; explain unsupported browsers, permission denial, and recognition errors while retaining text input.
- [ ] Test valid/malformed/provider-error responses, relative dates with a fixed clock, clarification, input preservation, and no mutation during parse.
- [ ] E2E-test parse → correction → confirmation → persisted reminder using deterministic provider fixtures; separately record a real Gemini smoke check.
- [ ] Manually verify supported voice capture and unsupported/denied fallbacks on representative browsers.

Exit gate:

- [ ] Text and supported voice input produce an editable, validated, explicitly confirmed reminder; provider failures leave manual creation usable.

## Phase 5 — Email delivery

Expected files: `src/lib/email/`, `src/services/notifications/`, attempt repository, email templates, guarded CLI test command, email tests, SMTP setup documentation.

- [ ] Configure Nodemailer from validated SMTP settings; validate port/TLS combinations and keep provider-specific behavior outside domain logic.
- [ ] Implement escaped HTML and plain-text templates with title, deadline, interpretation zone, threshold context, and safe application links.
- [ ] Resolve recipient from the persisted reminder owner; never accept an arbitrary recipient from an application request.
- [ ] Check active/not-deleted status and schedule version immediately before delivery.
- [ ] Implement success/failure recording, attempt counts, timestamps, provider message IDs, and sanitized operational logs.
- [ ] Classify transient, permanent, and uncertain errors; define bounded configurable exponential backoff and final failure behavior.
- [ ] Ensure sent/cancelled/terminal-failed work is not retried and retry writes cannot resurrect cancelled schedules.
- [ ] Set connection/socket/send timeouts compatible with the planned worker lease and invocation budget.
- [ ] Provide a CLI or documented non-public test procedure requiring an explicitly configured test destination; no public scheduler trigger endpoint.
- [ ] Mock SMTP to test recipient isolation, escaped content, time-zone/threshold context, success, permanent failure, retry exhaustion, and inactive/version-mismatched reminders.
- [ ] Send a live test email with test credentials and record SMTP acceptance, recipient receipt, and persisted outcome separately.
- [ ] Document SMTP limits, credential rotation, and the crash-after-acceptance duplicate-send window; do not promise exactly-once delivery.

Exit gate:

- [ ] A controlled live test reaches the intended recipient with recorded outcome; mocked failure/retry/isolation tests pass.

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
- [ ] Implement and document D4 catch-up behavior after missed runs, including already-overdue reminders.
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
