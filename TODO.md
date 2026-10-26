# RemindMe implementation plan

Source of truth: [prd.md](./prd.md), version 1.1 including the October 19 recurrence amendment. Plan created October 18, 2026.

## Starting point and scope

At the October 18 planning checkpoint, the repository contained `prd.md`, a minimal `README.md`, and `LICENSE`. The application, schema, migrations and checks have since been implemented. The tracker and dated evidence below describe current completion; the original starting snapshot is historical.

Build V1 in the PRD's order: correctness, user isolation, scheduling, delivery, usability, then polish. Keep Next.js App Router, TypeScript, Zod, Better Auth, Drizzle, Neon PostgreSQL, Gemini, browser speech recognition, Nodemailer/SMTP, Azure Functions, and Vercel as the agreed stack.

Exclude billing, shared workspaces, calendar integration, SMS/push, native apps, autonomous AI actions, email verification, password reset, full offline synchronization, and a separate Express server. Recurring reminders are included by the October 19 owner scope amendment.

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

| Phase | Outcome                                              | Status                                         |
| ----- | ---------------------------------------------------- | ---------------------------------------------- |
| 1     | Repository, runtime, database foundation             | Complete                                       |
| 2     | Authentication and ownership boundaries              | Implemented; live Google OAuth pending         |
| 3     | Manual reminder CRUD and durable schedules           | Complete                                       |
| 4     | Confirmed AI parsing and optional voice capture      | Chrome voice confirmed; denial checks pending  |
| 5     | SMTP delivery, attempts, and retries                 | Complete                                       |
| 6     | Independently deployed Azure timer worker            | Implemented locally; Azure deployment deferred |
| 7     | Complete mobile UI and installable PWA               | Implemented; physical device checks pending    |
| 7a    | Repeats, grounded descriptions and saved detail view | Verified locally; Azure delivery deferred      |
| 8     | Production deployment and operational hardening      | Not started                                    |
| 9     | Reproducible documentation and handoff               | Not started                                    |

## Review before Phase 8 - October 20, 2026

See [the requirements audit](./docs/pre-deployment-audit.md) for PRD mapping, verification evidence and exact remaining checks. This review does not authorize or begin deployment.

The owner confirmed Chrome voice and the repaired AI flow work. On October 20 the owner explicitly confirmed Google sign-in and installation on a physical phone have **not** been tested. Keep those gates open. Existing automated crash-state tests are not a substitute for real disconnect/transport/process-termination drills.

Before declaring every earlier gate complete:

- [ ] Run live Google sign-in, reload/sign-out and verified same-email linking checks using controlled accounts (Phase 2).
- [ ] Verify denied microphone access preserves text and manual creation in supported Chrome (Phase 4).
- [ ] Complete keyboard and screen-reader checks (Phase 7).
- [ ] Exercise actual isolated database disconnect/wake-up, stalled SMTP and process-termination recovery (Phase 6); use synthetic data and no real recipient sends.
- [ ] Install/launch/upgrade on physical Android/iOS devices (Phase 7); production HTTPS verification necessarily follows Phase 8 hosting.

Azure subscription/region/cost checks, a real Functions host/timer, automatic one-off/recurring delivery and production security/HTTPS checks remain explicit Phase 8 dependencies. They are not missing local UI features.

## Confirmed implementation decisions

The owner confirmed D1–D10 on October 18, 2026. The full policies and acceptance tests are preserved in [docs/decisions.md](./docs/decisions.md). These decisions govern implementation where they refine PRD behavior.

- D1: verify official compatibility; pin exact dependencies and one lockfile. See [compatibility evidence](./docs/compatibility.md).
- D2: preserve original creation anchor on edits/reopening; omit thresholds at or before now.
- D3: date-only means 23:59 local; the October 19 owner amendment interprets explicit “before [date]” without a clock time as the previous local day at 23:59. Ambiguous/nonexistent DST times require clarification.
- D4: coalesce due thresholds to the most advanced; audit cancellation reasons. Cancel unsent threshold work after the deadline as `deadline_passed`.
- D5: completion/deletion are idempotent; deletion is soft; reopening retains creation anchor; no archive UI in V1.
- D6: title 160, description 2,000, source 4,000 characters; priority low/normal/high (normal default); pagination 20/max 100; AI 10/min/user; auth 10/15min/key; SMTP delays 1/5/15/60 minutes, five attempts; batch 25, concurrency 5, lease five minutes; validate configurable bounds.
- D7: transaction-capable PostgreSQL driver in both runtimes; verify row locks using real PostgreSQL.
- D8: atomic PostgreSQL-backed shared rate limiting with expiry/cleanup and HTTP 429.
- D9: server-enforced tester allowlist by default; explicit all/public mode opens access; separately approved SMTP recipients; verified Google identities; verified Google same-email linking per the October 20 owner amendment; no linking from unverified claims.
- D10: profile time-zone changes affect new reminders only; existing deadlines, schedules, and interpretation zones remain unchanged.

Temporal and the confirmed domain policies are implemented. Actual Azure host startup and hosted delivery remain deferred to Phase 8. Compatibility and local verification do not imply deployment verification.

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
- [x] Configure real Google credentials and confirm the provider consent/token exchange reaches the app callback (owner evidence, October 20).
- [ ] Confirm live verified same-email sign-in and new Google-user sign-in after the October 20 linking/callback fix.
- [x] Enable owner-requested automatic linking for verified Google identities with the same email; preserve user ID/data/password login and reject unverified claims or different-email linking. Keep non-V1 account-management endpoints blocked. The live matching-email retry remains a Google gate.
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
- [ ] Google OAuth is verified in a suitable configured test environment; verified same-email linking preserves the existing identity and unverified claims cannot link.
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
- [x] Owner confirmed Chrome voice works and reported the unsupported Firefox path; retain the browser-capability explanation and text fallback.
- [ ] Manually verify permission-denied/reallowed capture on supported Chrome and retain text/manual fallback; broader device coverage is not established by the Chrome confirmation.

Exit gate:

- [x] Text and owner-confirmed Chrome voice feed editable, validated confirmation; provider failures retain manual creation. Seven synthetic live checks pass on the configured 3.5 Flash-Lite model.
- [ ] Close the remaining microphone permission-denied check above before declaring representative browser verification complete.

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

- [x] Build a Next.js-independent shared processor and independently deployable Azure Functions adapter; verify packaging includes shared code and runtime dependencies without importing Next.js-only modules.
- [x] Verify official runtime/plan support and configure the documented one-minute timer expression; include required storage coordination settings.
- [x] Atomically claim a bounded due batch with transactions and `FOR UPDATE SKIP LOCKED` or an equivalently verified PostgreSQL strategy.
- [x] Select both newly due work and retries whose effective eligibility time has arrived; never load the full queue.
- [x] Use short claim transactions; avoid holding database locks while waiting for SMTP.
- [x] Add claim ownership/fencing if necessary so an expired worker cannot overwrite a newer claim's result; add a reviewed migration for extra fields.
- [x] Implement bounded concurrency, per-run time budget, connection/query timeouts, graceful exit, and backpressure.
- [x] Recheck reminder status/deletion, schedule version, owner existence, recipient, and claim validity immediately before each send.
- [x] Record outcomes through the Phase 5 delivery service and guarded state transitions; preserve cancellation when completion/edit races with delivery.
- [x] Recover stale claims after a documented lease timeout and account for maximum SMTP duration; cap repeated crash recovery rather than retrying forever.
- [x] Implement D4: send only the most advanced overdue threshold per reminder; cancel coalesced work with `coalesced_catch_up` and all unsent work after deadline with `deadline_passed`; record audit reasons transactionally.
- [x] Log invocation/notification/reminder IDs, durations, attempts, queue age, and sanitized outcomes without reminder bodies or secrets.

### Failure and deployment verification

- [x] Integration-test overlapping workers, unique claims, stale recovery, late stale-worker updates, retry eligibility, partial batch failure, and bounded processing.
- [x] Test edit/complete/delete during claim and before send; verify old schedule versions cannot produce eligible future sends.
- [x] Model crash-before-send lease exhaustion, interrupted sending, late acceptance/fencing and uncertain SMTP DATA timeout outcomes in existing unit/PostgreSQL checks; verify sanitized simulated database failure.
- [ ] Exercise an actual isolated database disconnect/wake-up, a stalled SMTP transport and process termination before/after SMTP acceptance. State-machine fixtures do not prove real transport/process recovery.
- [x] Verify recorded sent work is skipped; document the residual SMTP acceptance window and post-final-check cancellation race.
- [ ] Verify subscription plan availability, region, storage requirements, outbound SMTP connectivity, and resource costs before provisioning.
- [ ] Deploy a development function with its own database/SMTP settings; verify real timer executions, Neon access, receipt, persisted status, and stale recovery.

Exit gate:

- [ ] Real due notifications are processed by the deployed timer independently of browser sessions, Vercel requests, or in-memory timers.
- [x] Local PostgreSQL concurrency/recovery checks pass and duplicate-send limitations are documented accurately. Actual host/network failure drills remain open above.

## Phase 7 — Application UI and PWA

Expected files: final app pages/components, responsive styles, manifest, icons, service worker, offline page, browser/E2E/accessibility checks.

- [x] Complete `/`, `/login`, `/register`, `/app`, `/app/new`, `/app/reminders/[id]`, `/app/completed`, and `/app/settings`.
- [x] Keep landing page minimal; prioritize capture, confirmation, deadline clarity, completion, and recovery from errors.
- [x] Show date-only deadlines as dates, explicit date/time deadlines with useful zone context, overdue state, and schedule history with delivery context.
- [x] Complete loading, empty, saving, validation, provider-error, session-expired, offline, and retry states. Expired-session recovery opens sign-in in another tab to preserve unsaved input.
- [x] Ensure mutations refresh displayed state correctly and repeated clicks do not accidentally duplicate submissions.
- [x] Implement mobile layouts, touch controls, focus handling, labels, keyboard focus outlines, status announcements, and readable contrast; inspect desktop/mobile screenshots and check horizontal overflow.
- [ ] Complete a hands-on keyboard/screen-reader audit on supported devices.
- [x] Add a manifest with name/short name, colors, standalone display, required icons, and `start_url: /app`.
- [x] Add a service worker that caches only explicitly allowed public/static assets and a generic offline fallback.
- [x] Exclude private pages, auth/API responses, reminder data, and sensitive navigation responses from service-worker/CDN caching; review actual response headers.
- [x] Version caches, remove obsolete caches safely, and verify explicit update activation; verify logout/account-switch behavior in the same browser context.
- [x] Display a useful offline state without claiming offline edits are saved; recover when connectivity returns.
- [x] Verify Chromium installability on trusted localhost, `/app` start URL, and signed-out authentication routing.
- [x] Run desktop workflow journeys and a mobile dashboard/capture/detail/offline/installability browser journey.
- [ ] Manually install/launch/upgrade on physical iOS/Android devices and verify production HTTPS installability after Phase 8 hosting.

Exit gate:

- [ ] Close the physical-device installation/accessibility checks above. Local browser workflow, `/app` routing, offline privacy and cross-account cache isolation are verified; native installed launch remains pending.

## Phase 7a — Owner recurrence amendment

Scope and policies: [docs/recurrence.md](./docs/recurrence.md). Keep the existing UI design. The owner explicitly selected advance 50/75/90 notifications and whole-series completion.

- [x] Add daily/weekly/monthly rules, intervals, selected weekdays, month-day intent and optional inclusive end dates to strict create/edit validation and persisted schema.
- [x] Review/apply additive development migrations with recurrence/interval-anchor constraints and an active-series due index; retain existing one-off data.
- [x] Implement local calendar generation, month-end recovery, future DST policy and bounded jumps across missed occurrences.
- [x] Extend the locked worker transaction to advance due series even when all old notifications are terminal; cancel old work, preserve original creation time, increment versions and insert new per-occurrence percentage schedules atomically.
- [x] Preserve one-off scheduling; apply whole-series completion/deletion and deliberate reopening; fence old claims and preserve notification/attempt history.
- [x] Add repeat controls to manual creation and AI confirmation, recurrence labels to saved details/dashboard and accurate repeating email context.
- [x] Teach the single-call AI parser to recognize repeat patterns and produce useful descriptions grounded in transcript facts; retain explicit confirmation/save and clarification for unsupported patterns.
- [x] Replace the always-open saved editor with read-only details and an explicit Edit reminder action; close after successful save and retain input on validation/conflict failures.
- [x] Complete focused PostgreSQL/browser regression checks and production web/worker validation; record outcomes below.
- [x] Verify live provider recurrence extraction/description and one-off interpretation regressions: all seven synthetic Gemini examples passed.
- [x] Owner confirmed physical Chrome voice works after rollback; AI parsing also works after the model switch. This is one-browser owner evidence, not a multi-device accuracy claim. Denied-access coverage remains in Phase 4.
- [ ] Verify automatic recurring delivery after the separately deferred Azure deployment (Phase 8); no local test proves hosted execution.

## Phase 8 — Deployment and hardening

Expected files: production deployment configuration, CI/release workflow, production migration procedure, monitoring/recovery runbooks, smoke-test checklist.

### Provisioning and release

- October 26 owner-led setup: Vercel is reachable at https://remindme-zigla.vercel.app and the supplied Azure export confirms a Node 22 Flex Function App in Germany West Central. Worker code, secrets and actual timer delivery are not yet evidenced. Follow [the deployment runbook](./docs/deployment.md); `.github/workflows/main_remindme.yml` uses the portal-created OIDC identity and deploys the standalone worker on main pushes or manual dispatch.

- [ ] Check current Vercel plan eligibility/limits, Neon limits, Azure subscription credits/expiry, Functions/storage/logging costs, Gemini quotas, and SMTP limits using current provider sources.
- [ ] Finish production service configuration. Owner selected the existing application Neon database; Vercel and Azure resources exist, but separate runtime secrets, worker code deployment and hosted delivery still need verification. Avoid unnecessary always-running infrastructure.
- [ ] Configure domain/HTTPS, canonical application/auth URLs, trusted origins, Google redirect URIs, production cookies, and appropriate security headers.
- [ ] Configure Vercel and Azure secrets independently; audit public variables and client bundles for leakage.
- [ ] Define database backup/restore capabilities and verify a restoration procedure in a non-production environment.
- [ ] Review and apply production migrations with a known release order; keep web/worker schema compatibility during independent deployments.
- [x] Build/deploy web and worker separately; document rollback or forward-fix behavior for code and database changes. Release `bc8530f` deployed successfully to Vercel and Azure October 26; see deployment runbook.
- [ ] Verify production rate limiting and request limits across multiple serverless instances.

### Release checks and operations

- [x] Run unit, database integration, authorization, email, worker concurrency/recovery, and critical Playwright suites. GitHub Checks passed on deployed release `bc8530f`.
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

- [x] Email/password works with persistent sessions, supported hashing, server enforcement and tested isolation.
- [ ] Google OAuth signs into the existing same-email user and creates new Google users in live testing; credentials/configuration alone do not close this gate.
- [x] Reminder, preference, notification, and history access is isolated per user, including direct API/server access.
- [x] AI produces validated, editable data and requires confirmation; voice has reliable text fallback.
- [x] Manual CRUD remains available when AI fails.
- [x] Date-only, date/time, UTC persistence, IANA zones, relative dates, and DST policy pass tests.
- [x] Persisted 50%/75%/90% schedules are transactional, versioned, and replaced correctly on deadline edits.
- [x] Completion/deletion suppress pending work, and reopening follows documented rules.
- [ ] The real Azure timer claims bounded work safely, handles retries/missed runs, and recovers stale claims.
- [x] Configurable SMTP delivers to the correct owner and records attempts/outcomes without leaking private content.
- [x] Residual SMTP duplication and cancellation races are documented without exactly-once claims.
- [ ] The mobile-accessible PWA installs where supported, launches `/app`, and does not cache private data unsafely.
- [ ] Critical automated checks and production smoke tests pass; actual external checks have recorded evidence.
- [ ] Secrets stay out of Git/client bundles; costs, limitations, deployment, and recovery are documented.
- [x] All explicit non-goals remain outside V1.

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

### October 19, 2026 — Phase 6 local worker implemented; Azure deferred by owner

- Owner confirmed there is no Azure setup yet and requested local completion. No subscription, storage account, hosting plan, deployed function, new outbound test email or external timer execution was created. The Phase 6 hosted-delivery exit gate remains open; UI redesign stays Phase 7.
- Added the shared bounded processor and reminder-first PostgreSQL `SKIP LOCKED` batch claims. Waves claim only immediately available send slots; examined reminders are capped per invocation. Due retries honor backoff, most-advanced overdue thresholds coalesce lower work, and inactive/deleted/outdated/past-deadline work is cancelled with reasons. SMTP stays outside transactions.
- Extended claim fencing with a final lease check and reviewed/applied `0003_young_zarda.sql` in development and isolated test databases. `recovery_count` caps repeated crashes, including before the first SMTP attempt. Interrupted sending attempts become uncertain; late acceptance updates only that attempt's history and cannot overwrite a newer queue claim. Normal SMTP attempt limits remain enforced.
- Added an independent Azure Functions v4 / Node 22 timer adapter, monitored `0 * * * * *` schedule, no startup run, host storage settings, five-minute host timeout, termination signal, private local-settings example disabled by default, and safe structured logs. Pinned SDK 4.16.5 and build-only esbuild 0.28.2 after checking official Microsoft runtime guidance.
- Added `worker:build`, read-only `worker:check`, and guarded `worker:once` (no sending by default). The build bundles shared runtime code and rejects web-only dependencies; its minimal SDK package/lockfile, host configuration and `.funcignore` form the independent deployment artifact. Locked artifact installation and plain Node 22 loading passed; SDK test-mode warnings correctly indicate that this is not a running Azure/Core Tools host.
- Verification: 38 unit checks; four queue integration cases plus all four existing delivery cases passing across the targeted runs; TypeScript, lint, formatting and production web/worker builds. Queue checks cover overlapping selectors, unique claims, next-wave progress, coalescing, past-deadline cancellation, expired-claim rejection, recovery backoff/cap, late acceptance, concurrency/admission budget, partial SMTP failure, deletion and replaced versions. Fault injection verifies sanitized database failure and shutdown admission; interrupted-send fixtures represent crashes before/after SMTP acknowledgement persistence.
- Corrected a concurrency test's overstrict assumption that simultaneous selectors must fill both batches immediately: a candidate may change between selection and its locked recheck. The implementation safely returns a partial batch and proceeds to another candidate; the revised check verifies unique claims and eventual next-wave progress. A pre-existing Phase 5 formatting issue was normalized.
- Live development queue inspection was read-only: no due, processing, stale or failed work at that checkpoint. No real SMTP send was executed in this phase. Root tool advisories remain unchanged; the minimal artifact SDK installation reports zero findings.
- Added `docs/worker.md` with local/Core Tools setup, budget/lease semantics, package/publish steps, subscription/region/runtime/cost preflight and recovery limitations. The Azure CLI/Core Tools and Azurite are not installed here. Actual host timing, Neon cold-wake behavior from Azure, cloud SMTP connectivity, subscription costs and deployed receipt/history/recovery verification remain pending, explicitly separate from local fixtures.
- Next checkpoint: provision/sign into Azure when the owner is ready, verify region/runtime/costs, deploy the prepared artifact and close the external Phase 6 gate. Local implementation is ready for review; no active hosted scheduler is claimed.

### October 19, 2026 — Phase 7 UI/PWA implemented; device gates open

- Rebuilt landing, authentication and the protected application with an ivory/ink/coral design, self-hosted DM Sans, editorial headings, local SVG illustrations, desktop sidebar and mobile bottom navigation. Dashboard cards show real owner-scoped totals; search and date filters run before pagination with saved-zone/DST-aware day boundaries. Capture, editable confirmation, manual entry, details/schedule history, completed reminders, settings, loading, empty, error, not-found and access-denied screens share the design.
- Added focus movement for clarification/review, visible keyboard focus, mobile form sizes/touch targets, explicit duplicate-submit prevention during create navigation, session recovery in another tab and stale-confirmation clearing when source text changes. Server revisions, owner guards and explicit-save behavior remain enforced.
- Added standalone `/app` manifest, local PNG/maskable/Apple icons, settings installation controls, offline/update notices and an exact public-only service-worker cache. Navigations remain network-only with a generic offline fallback; no private HTML, API/RSC response, reminder data or mutation enters Cache Storage. Reviewed private response headers and made updates require an explicit click.
- Verification: 42 unit checks, lint, TypeScript, formatting and a production build pass. Browser checks cover registration/settings, full manual/AI-confirmation CRUD, server filtering/search, desktop/mobile overflow and screenshots, real Chromium installability (no reported errors), manifest/icons, cache allowlist, offline private navigation, logout/relaunch and account switching. After the final capture refinements, both the full reminder journey and PWA journey passed again (two tests, 4.4 minutes). An earlier isolated signup request returned 500; it did not recur in those following journeys, and no auth behavior change was made. Temporary diagnostics were removed. These are local browser checks, not physical-device installation or a full assistive-technology audit.
- Added `docs/ui-pwa.md`; native iOS/Android installation/upgrade, hands-on accessibility and deployed HTTPS installability remain open. Azure deployment remains deferred, so hosted scheduled delivery is still inactive. No site was published and no test email was sent.
- Owner-requested AI amendment: correct clear transcription mistakes from context; ask one focused question for uncertainty. “Before [date]” with no explicit clock becomes 23:59 on the previous local calendar day using server-side Temporal arithmetic; “by/on” retains that date's end, and midnight is the start of the named date. Review explains the adjustment and stays editable. One structured provider request per interpretation; no extra AI agent/action chain or notification-policy change. The default model uses its supported low thinking setting for extraction; custom model overrides retain provider defaults.
- Expanded `ai:check` with before/by/year-boundary, speech-error and midnight examples. Live verification remains pending: generation timed out and ultimately returned HTTP 504 through the session proxy, while a read-only models request succeeded. Local strict-output and year/leap-day boundary checks pass. No database writes or emails were produced by the live AI diagnostic.

### October 19, 2026 — Recurring reminders and saved-detail behavior implemented

- Owner explicitly expanded the original V1 scope to recurrence and confirmed two policies in chat: retain 50/75/90 advance notifications for every occurrence, and Mark complete stops the whole repeating reminder. Updated PRD to version 1.1, added D11, and documented the policies in `docs/recurrence.md` without changing the application’s visual direction.
- Added daily, weekly and monthly patterns, bounded intervals, selected ISO weekdays, explicit month-day intent and optional inclusive end dates. Calendar generation preserves the stored zone/local time, restores day 31 after shorter months, and applies documented future DST gap/overlap handling. Original creation timestamps and one-off behavior remain intact.
- Generated, reviewed and applied additive migrations `0004`/`0005` to development and the isolated test database. Recurrence JSON and a separate interval anchor are constrained; an active recurring-deadline index supports worker selection. No existing one-off deadline or notification was rewritten.
- Extended the reminder-first locked worker transaction to advance elapsed series even when every old notification is terminal. Cursor movement, cancellation, version/revision increments and fresh percentage schedules commit together. Long outages skip elapsed occurrences and use existing catch-up coalescing for the next future event. Completion/deletion stop the series; reopening is explicit and respects its end date. Original SMTP claim fencing and retry limits remain in place.
- Added recurrence fields to manual/AI confirmation, labels on cards/details, and accurate recurring interval context in email templates. AI descriptions summarize supplied event/preparation details in clear wording without invented facts; one structured provider request and explicit review/save remain required.
- Saved reminders now open read-only with Edit reminder. Successful edits close the form, Cancel discards edits, and validation/stale-revision errors preserve input. Corrected repeat-field label associations during browser verification; the final reminder journey passes for repeat confirmation/persistence, description persistence, hidden saved fields, explicit editing and the complete original one-off CRUD/isolation lifecycle. PWA/mobile/offline/privacy regression also passes.
- Verification: 45 unit checks; three new PostgreSQL recurrence checks and four existing queue checks pass. These verify concurrent advancement, per-occurrence percentage anchors, whole-series completion, advancement with all old notifications sent, missed dates/end boundaries and rollback after a forced next-queue insert failure. Tests exclude unrelated pre-existing test reminder IDs rather than assuming the isolated database is empty.
- Live Gemini verification: all seven synthetic examples pass, including Sunday 2 PM recurrence with progress-note description, local relative dates, vague-time clarification, before/by date boundaries, a clear speech typo and midnight. This closes the prior synthetic provider-timeout gate. It does not establish physical microphone accuracy.
- Final lint, TypeScript, formatting and production web/standalone-worker builds pass. No live SMTP email was sent and no new hosted scheduler was provisioned. Azure deployment and physical device/microphone checks remain separate pending gates.

### October 20, 2026 - Investigated upstream parsing failure and switched model

- Read the actual redacted provider error: 3.8 Flash returned HTTP 504 / DEADLINE_EXCEEDED even for a minimal prompt outside the parser; direct REST also timed out. Metadata succeeded. No evidence points to the recurrence schema causing this failure.
- Confirmed 2.5 Flash-Lite rejects this project as unavailable to new users. 3.5 Flash-Lite responds and has a documented free tier; changed the app/sample/local/smoke defaults to that stable model with supported low thinking. Quotas and sustained availability remain project/provider dependent; no billing settings changed.
- Retained strict date policies and added an explicit by-date prompt example after a candidate run confused by with before. All seven existing live synthetic checks pass on the final configuration. No actual owner transcript was sent, reminders saved or emails sent. Recording and repeating-event implementation are unchanged.

- Final validation: all 45 unit checks, TypeScript and focused lint pass. The single live recurrence check also passes using the final `.env.local` configuration without a model override.

### October 20, 2026 - Review of phases 1 through 7a

- Audited the PRD, decision register, TODO, auth/reminder/AI/delivery/worker/PWA implementation, migrations, CI and existing verification coverage. Added `docs/pre-deployment-audit.md` with a requirement/evidence map and remaining manual/external gates.
- Recorded the owner's Chrome voice/AI success and explicit confirmation that live Google OAuth and physical phone installation are untested. Reconciled completed local acceptance items without checking off external production behavior.
- Separated modeled worker crash/timeout recovery from unperformed real disconnect, stalled transport and process-kill drills. Azure remains deferred; no deployment or new SMTP send was attempted.

- Fresh audit results: 45 unit checks, 29 PostgreSQL integration checks, full lint, formatting, optimized production compilation with TypeScript/page generation, and standalone worker packaging pass. Browser public/auth/PWA journeys pass; a targeted reminder/recurrence CRUD rerun passes after adding the missing detail-navigation wait. Trace evidence showed the first run clicked a dashboard action before the detail route arrived; no application change was required.
- Remaining closure sequence: live Google OAuth/collision, denied/reallowed microphone, hands-on keyboard/screen-reader, isolated real failure drills, then physical PWA installation/upgrade when a trusted origin is available. The audit does not declare these complete or start Phase 8.

### October 20, 2026 - Owner-requested Google/password account association

- A real Google callback reached the app but returned `account_not_linked` under the former blanket disabled-linking policy. Owner explicitly requested verified same-email sign-in and automatic creation for new Google users; updated D9/PRD and authentication notes to match.
- Enabled implicit same-email linking with verified Google claims and preserved local password credentials/user IDs. New Google identities continue through framework user/session creation. Tester admission, CSRF/state/nonce checks and blocked general account-management endpoints remain in force.
- Fixed the HTTP adapter's attempt to JSON-parse empty redirects; preserve redirect status, Location and session/state cookies rather than emitting generic internal-error JSON. Added focused checks for redirect handling and actual callback/linking/new-user persistence with a synthetic Google exchange.
- Live existing-email/new-email Google sign-in remains pending the owner's retry; no real Google token exchange or user-account modification was performed by the automated tests.

- Final verification: 47 unit checks, nine existing auth integration checks and the new real callback/linking/new-user/rejection integration scenario pass. TypeScript and focused lint pass. Google exchange is synthetic in automated checks; the owner must start a fresh live sign-in rather than reload the old callback code.

### October 26, 2026 — Owner-led deployment preparation and public checks

- Owner provisioned Azure `remindme` in Germany West Central after the Students region policy blocked East US 2, and supplied the production Vercel URL. The resource export confirms Linux Flex / Node 22 / HTTPS-only / 2048 MB; it does not establish worker publication, runtime secrets or timer execution.
- Live read-only checks passed for the website, login, signed-out redirect, session endpoint, PWA manifest and service worker. Private cache headers are present. The prepared security headers still need web redeployment. Azure responds with its default welcome page, which cannot prove timer health.
- Reviewed earlier local deployment changes: removed redundant untracked `vercel.json`, retained `.vercelignore`, security headers, accurate delivery-status flag and corrected Google-linking settings copy. Production rebuilding cleared generated `next-env.d.ts` drift. No application secrets or installed cloud tools were added.
- Added a manual-only GitHub OIDC worker deployment workflow, plus `docs/deployment.md` covering separate runtime environment settings, exact production Google callback, artifact packaging, existing-database policy, release order, recipient approvals, monitoring, recovery and remaining smoke checks. The owner must configure the GitHub/Azure identity and run deployment; no cloud login or publication was performed.
- Read-only existing application database inspection found six reviewed migrations applied, three due notifications and no processing/stale/failed notifications. Review outstanding reminders before enabling the timer. No row was changed or email sent.
- Verification: production web build (including TypeScript), standalone worker build, lint, all 47 unit tests, formatting and diff whitespace checks pass. Windows sandbox child-process restrictions required rerunning builds/tests outside the sandbox; the reruns passed. Integration/browser suites were not rerun for these configuration/docs changes; hosted credentials, timer/SMTP and physical PWA checks remain open.

### October 26, 2026 — Worker and web deployed

- Fetched the portal-created OIDC workflow, corrected it in place to build/publish only `dist/notification-scheduler`, and reused its existing identity secret names. Preserved automatic main-branch deployment and manual dispatch; no duplicate deployment workflow or new local cloud tools were introduced.
- Committed/pushed release `bc8530f`. Azure worker deployment and Vercel deployment both succeeded; GitHub Checks passed, including unit/integration, web/worker builds and critical Playwright journeys. The working tree was clean after release.
- Owner confirmed all worker app settings are saved in Azure with `AzureWebJobs.notificationScheduler.Disabled=false`. Live website probes confirm the deployed security headers, microphone permission policy, signed-out redirect and private no-store response.
- Read-only database observation after deployment found fresh deadline/occurrence cancellations and a new pending occurrence schedule, consistent with hosted timer execution and recurring advancement. No manual sending process or direct database mutation was used. No new SMTP attempt was observed at that checkpoint; receipt and hosted recurring email remain open.
- Requested an owner-created six-minute synthetic reminder, actual inbox confirmation, production Google sign-in/physical PWA results, and Vercel `EMAIL_DELIVERY_ENABLED=true` redeployment. These owner/account/device checks remain pending; successful deployments are not recorded as completion of those acceptance gates.
