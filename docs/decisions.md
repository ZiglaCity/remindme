# RemindMe — Implementation Decision Register

**Status:** Confirmed by the project owner on October 18, 2026  
**Scope:** D1–D10  
**Rule:** Record each decision and its corresponding tests before implementing dependent functionality. If repository inspection reveals a compatibility or correctness issue, document the evidence and the smallest necessary adjustment before proceeding.

## D1 — Runtime and Dependency Compatibility

**Decision:** Verify compatibility from current official documentation before choosing versions.

- Verify supported Node.js LTS versions across the selected Next.js release, Better Auth, Drizzle, Neon driver and Azure Functions runtime.
- Select one package manager and commit its lockfile.
- Pin direct dependencies to explicit compatible versions.
- Use the same supported Node.js major version for the web application and worker where possible.
- Keep the Azure Functions runtime and programming model explicit in deployment configuration.
- Do not upgrade major dependencies without checking compatibility and rerunning tests.

**Acceptance tests**

- Clean installation succeeds using the committed lockfile.
- Type checking, linting and production builds succeed.
- The Azure worker starts in its configured runtime.
- Database migrations work in the documented environment.

## D2 — Notification Schedule Anchor

**Decision:** Retain the original reminder `created_at` as the schedule anchor when editing a deadline.

Calculate notification times using:

`created_at + threshold × (due_at − created_at)`

When the deadline changes:

1. Increment `schedule_version`.
2. Cancel the previous version's pending notifications.
3. Calculate the new thresholds using the original creation instant and updated deadline.
4. Omit thresholds at or before the current instant.
5. Create the new pending notifications transactionally.

Changing the title or description does not recalculate the schedule.

Reopening a reminder does not reset `created_at`; it uses the same anchor and the current deadline.

**Acceptance tests**

- Editing a deadline retains the original creation anchor.
- Past thresholds are not recreated as pending notifications.
- Repeated edits do not create duplicate threshold records.
- Old schedule versions cannot be delivered.

## D3 — Time Zones and Daylight-Saving Transitions

**Decision:** Use a maintained time-zone library with explicit daylight-saving disambiguation, selected after D1 compatibility verification.

- Persist actual deadlines as `TIMESTAMPTZ`.
- Retain the original local date, deadline type and relevant IANA time zone.
- Date-only deadlines default to 11:59 PM local time.
- Require clarification for nonexistent or repeated local times where the intended instant cannot be determined uniquely.
- Never silently shift a nonexistent time or arbitrarily choose between repeated times.
- Calculate notification thresholds using absolute instants.

**Acceptance tests**

- Date-only and date-time deadlines preserve their intended meaning.
- DST gaps and overlaps trigger the documented clarification behavior.
- UTC conversions and local displays agree.
- Server time-zone settings do not affect the result.

## D4 — Delayed Notifications and Catch-Up

**Decision:** Preserve overdue pending work, process it in bounded batches and suppress redundant notifications for the same reminder during catch-up.

For each active reminder:

1. Identify all due pending thresholds.
2. If only one threshold is due, process it normally.
3. If multiple thresholds are overdue and none has been sent, send **one catch-up email** identifying the most advanced overdue threshold and the deadline status. Mark the other overdue threshold records as `cancelled` with a documented reason such as `coalesced_catch_up`.
4. If an earlier threshold was already sent, send only the most advanced newly due threshold and coalesce the other overdue thresholds.
5. If the deadline has already passed, do not send stale percentage-threshold emails. Mark the reminder overdue in the UI and cancel unsent threshold notifications with reason `deadline_passed`.
6. Continue processing other eligible notifications within the configured batch limit.
7. Record every coalesced or suppressed notification for auditability.

**Acceptance tests**

- A brief scheduler outage does not lose due work.
- Several overdue thresholds do not generate a burst of emails.
- Already-sent notifications are not resent during catch-up.
- Reminders past their deadlines do not generate stale threshold emails.
- The queue continues processing when one notification fails.

## D5 — Completion, Reopening, Deletion and Archiving

**Decision:**

- Completing an active reminder sets `status = completed`, records `completed_at` and cancels pending notifications.
- Repeating completion is idempotent: it does not create duplicate effects or change the original completion timestamp.
- Reopening a completed reminder sets `status = active`, clears `completed_at` and regenerates future thresholds using the original `created_at` and current deadline.
- Reopening a reminder whose deadline is in the past is permitted, but it remains overdue and receives no new threshold notifications.
- Deletion is a soft-delete operation. Repeated deletion succeeds without duplicating effects.
- Deleted reminders cannot be reopened through normal application endpoints.
- Do not expose archive functionality in V1. Keep the status model extensible for a future archive feature.

**Acceptance tests**

- Repeated completion and deletion are safe.
- Reopening creates only eligible future notifications.
- Past-deadline reopening does not produce new emails.
- Deleted reminders cannot be modified through normal APIs.
- Concurrent state changes cannot normally cause a cancelled notification to be sent.

## D6 — Validation and Operational Limits

**Decision:** Use documented, configurable limits with safe defaults.

| Setting                 |                                     Initial default |
| ----------------------- | --------------------------------------------------: |
| Reminder title          |                                    1–160 characters |
| Description             |                              Up to 2,000 characters |
| Original input          |                              Up to 4,000 characters |
| Page size               |                                          20 records |
| Maximum page size       |                                         100 records |
| AI parsing rate limit   |                             10 requests/minute/user |
| Authentication attempts | 10 attempts/15 minutes/account or applicable IP key |
| SMTP retry delays       |                             1, 5, 15 and 60 minutes |
| Maximum SMTP attempts   |                                    5 total attempts |
| Worker batch size       |                                    25 notifications |
| Worker concurrency      |                                             5 sends |
| Processing lease        |                                           5 minutes |

Additional rules:

- Priority values are `low`, `normal` and `high`; default to `normal`.
- Retry and worker settings must be configurable through validated environment variables or shared configuration.
- Enforce sensible upper bounds even when operators change configuration.
- Ensure the lease duration exceeds the normal bounded processing time for an individual claimed item.
- Use a heartbeat or smaller claim batches if processing may exceed the lease.
- Apply rate limits to sensitive endpoints without blocking normal reminder management unnecessarily.

These are starting defaults, not universal capacity guarantees. Validate them against actual provider limits and workload before production use.

**Acceptance tests**

- Inputs at and beyond each length limit behave correctly.
- Pagination never exceeds its configured maximum.
- Rate limits work across separate serverless instances.
- Invalid configuration fails safely at startup.
- Worker execution remains bounded under a large queue.

## D7 — Transaction-Capable Database Connections

**Decision:** Use a PostgreSQL driver and connection strategy verified to support multi-statement transactions and row locking in both Vercel and Azure Functions.

- Use Neon-compatible pooled connections for ordinary application traffic where appropriate.
- Select the worker's connection strategy based on the actual transaction and locking requirements.
- Verify `SELECT ... FOR UPDATE SKIP LOCKED` support through the chosen driver.
- Use direct connections for migrations if required by the chosen tooling.
- Never assume that a database HTTP/query adapter supports all PostgreSQL transaction semantics.

**Acceptance tests**

- Reminder and notification creation is atomic.
- Schedule replacement is atomic.
- Concurrent worker invocations do not normally claim the same notification.
- Database connection failures roll back incomplete operations.
- Integration tests run against PostgreSQL-compatible infrastructure, not only mocks.

## D8 — Shared Rate Limiting

**Decision:** Use a durable, shared rate-limit mechanism rather than process-local counters.

For V1, prefer a PostgreSQL-backed rate-limit table or another explicitly selected shared store. Given the low expected user count, PostgreSQL is acceptable if its implementation uses atomic updates and suitable cleanup.

- Define keys by operation and user or IP as appropriate.
- Use an atomic operation to consume a limit.
- Expire old rate-limit records.
- Avoid logging sensitive request contents.
- Return HTTP 429 with a suitable retry indication when a limit is exceeded.

**Acceptance tests**

- Limits remain effective across different application instances.
- Simultaneous requests cannot trivially bypass a limit.
- Expired records stop affecting new windows.
- Rate limiting does not require a permanently running service.

## D9 — Tester Access and SMTP Recipient Safety

**Decision:** Keep public registration technically supported, but restrict actual access to a small tester group through an explicit allowlist until public access is intentionally enabled.

- Allowlist configured email addresses and/or approved Google identities.
- Enforce access policy on the server, not only in the UI.
- Do not send reminder emails to an email/password account's address until the address has been explicitly approved for testing.
- Never assume an unverified email/password address belongs to the registering user.
- Google OAuth identities must be validated through the provider's verified identity claims.
- Do not automatically link existing accounts based solely on matching email strings.
- Do not introduce password-reset shortcuts or insecure account recovery.

The SMTP recipient must be resolved from the authenticated user's stored account data, never from an arbitrary recipient supplied by a client request.

**Acceptance tests**

- Non-allowlisted users cannot access protected application features.
- An unverified email/password account cannot send arbitrary outbound email through the application.
- Users cannot override the notification recipient.
- Google OAuth account linking follows the chosen authentication framework's documented security behavior.
- Disabling the allowlist is an explicit configuration change, not an accidental deployment default.

## D10 — Changing Time-Zone Preferences

**Decision:** Changing a user's time-zone preference affects **new reminders only**.

- Existing time-specific reminder instants remain unchanged.
- Existing notification instants remain unchanged unless the deadline itself is explicitly edited.
- Existing reminders retain the time zone used when their deadlines were interpreted.
- Date-only reminders retain their original local-date intent and stored interpretation.
- Do not reinterpret date-only reminders merely because a user changes their profile time zone.
- If a future feature allows reinterpretation, require an explicit user action and transactional rescheduling.

**Acceptance tests**

- Changing a user's profile time zone does not change existing `due_at` values.
- Pending notification instants remain unchanged.
- New reminders use the updated time zone.
- Any future reinterpretation flow updates the deadline and schedule atomically.

---

# Implementation Gate

Before coding dependent functionality, Codex must:

1. Verify D1 against current official documentation.
2. Record these decisions in the project documentation.
3. Identify any conflict with the existing schema or implementation.
4. Add the relevant tests before or alongside implementation.
5. Keep the locked product scope unchanged unless a concrete technical blocker is documented.

The goal is to prevent silent policy changes during implementation, especially around deadline semantics, missed notifications, account isolation and delivery behavior.

## Owner amendment — October 18, 2026

D9 access configuration additionally accepts TESTER_ACCESS_MODE=all to allow everyone; public remains an equivalent alias. Default mode remains allowlist. This changes application admission only; SMTP recipient approval remains separate. The implementation and tests must cover all mode.

## D3 implementation selection — October 18, 2026

Use @js-temporal/polyfill 0.5.1 on the selected Node 22 runtime. Explicit IANA zone conversion uses reject disambiguation for DST gaps/overlaps, with integer UTC instants for schedule arithmetic. Unit tests cover those cases and host-zone independence. The PRD's 75% illustrative time was corrected to October 28 at 06:00 for a ten-day interval starting October 20 at 18:00; the confirmed formula itself is unchanged.
