# Manual reminders and durable schedules

Phase 3 provides manual creation, active/completed lists, detail/edit forms, completion, reopening, soft deletion, and owned notification history. Apply migrations with `npm run db:migrate` before running the updated app. No AI, speech recognition, SMTP sends, or scheduler are needed for these workflows. The UI states that email notifications are not yet enabled.

## Time and deadline policy

`@js-temporal/polyfill` 0.5.1 converts explicit calendar dates and local times using IANA time zones. Dates must be valid Gregorian dates in years 0001–9999. Inputs use `YYYY-MM-DD` and, for time-specific reminders, `HH:mm` (24-hour time). Numeric offset zones are not accepted as substitutes for IANA identifiers. UTC is supported.

Date-only reminders use 23:59 local time and retain the local calendar date and `date_only` intent. Lists display that date without suggesting the user entered a time. Time-specific reminders show the interpreted local date/time and zone. PostgreSQL stores actual instants as TIMESTAMPTZ.

Temporal conversion uses `disambiguation: reject`: missing/repeated local times, including entirely skipped dates, return a clarification error. The form preserves its fields and asks the user to choose a different time or explicitly enter UTC. There is no silent DST shift or arbitrary choice of offset. See [Temporal's official disambiguation rules](https://tc39.es/proposal-temporal/docs/zoneddatetime.html#static-from) and the [maintained polyfill](https://github.com/js-temporal/temporal-polyfill).

New reminders default to the persisted profile time zone. When the profile zone has not been reviewed, the browser form offers the detected browser zone for explicit confirmation. Changing profile preferences does not change existing reminder/schedule instants or zones. An edit without a time-zone field retains that reminder's stored interpretation zone.

## Schedule and mutation invariants

For each threshold 50, 75, and 90, calculate `created_at + threshold / 100 * (due_at - created_at)`. The original creation instant is retained across deadline edits and reopening. Calculations use integer milliseconds (BigInt intermediate arithmetic); fractional milliseconds round down. Thresholds at or before the operation clock are omitted. Past-deadline reminders are allowed, shown overdue, and receive no newly scheduled records.

The PRD's former example incorrectly placed the 75% notification at October 28, 18:00. For October 20, 18:00 → October 30, 18:00, the confirmed formula yields October 25, 18:00; October 28, **06:00**; October 29, 18:00. The example was corrected without changing the confirmed formula.

- Creation inserts the reminder and all eligible notifications in one PostgreSQL transaction.
- Every mutation locks the owned reminder row first. PATCH also requires `expectedRevision`; stale changes return HTTP 409. UI drafts survive the error until the user chooses to reload the saved version.
- Title/description/priority edits increment `revision` without replacing schedules. The form may submit unchanged deadline fields; unchanged intent/instant/zone does not regenerate a schedule.
- Explicit changes to deadline instant, local date, type, or interpretation zone cancel pending/processing work as `deadline_changed`, increment `scheduleVersion`, and insert eligible future thresholds transactionally. Sent/failed history remains intact. Completed reminders do not gain pending work when edited.
- Completion records a timestamp and cancels pending/processing work as `completed`. Repeating completion preserves its original timestamp/revision.
- Reopening clears completion state, increments the schedule version, and regenerates only future thresholds using the original anchor. Repeating reopen on an active reminder has no effect. Reopening overdue reminders is allowed and schedules nothing.
- Deletion sets `deletedAt`, cancels pending/processing work as `deleted`, and is idempotent for the owner. Deleted reminders disappear from normal views and cannot be edited or reopened. No archive UI/API exists in V1.
- Each reminder/version/threshold combination is unique. Queue rows reference reminders; attempt rows reference queue rows. User access to either history uses owner-scoped joins. History responses are limited to 100 records and omit provider credentials/message bodies.

Future delivery workers must check active/not-deleted state and the current schedule version immediately before sending, then fence delivery-state updates. Phase 3 cancels durable work; real SMTP races, catch-up coalescing, retries, and claim leases are implemented/tested in Phases 5–6. It does not claim email delivery or exactly-once sending.

## API contracts

All routes require a valid server session and current access policy. Mutations require the canonical application's Origin, JSON validated by strict Zod schemas, and a body no larger than 32 KiB. Ownership IDs and statuses cannot be supplied by a client. Responses use `Cache-Control: no-store`.

| Method | Route                          | Contract                                                                                   |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------ |
| GET    | `/api/reminders`               | Active list; `page` defaults 1, `pageSize` defaults 20 and is bounded 1–100                |
| GET    | `/api/reminders/completed`     | Completed list with the same pagination                                                    |
| POST   | `/api/reminders`               | Create fields and a full deadline; returns 201 and `{ reminder }`                          |
| GET    | `/api/reminders/[id]`          | Owned `{ reminder, notifications, attempts }`; missing/deleted/foreign IDs return 404      |
| PATCH  | `/api/reminders/[id]`          | `expectedRevision` and at least one changed title, description, priority, or full deadline |
| POST   | `/api/reminders/[id]/complete` | Optional `{ expectedRevision }`; idempotent target state                                   |
| POST   | `/api/reminders/[id]/reopen`   | Optional `{ expectedRevision }`; idempotent target state                                   |
| DELETE | `/api/reminders/[id]`          | Optional `{ expectedRevision }`; soft deletion                                             |

Creation example:

```json
{
  "title": "Submit assignment",
  "description": "Final review before submission",
  "priority": "normal",
  "deadline": {
    "type": "date_time",
    "date": "2026-10-30",
    "time": "18:00",
    "timeZone": "Africa/Accra"
  }
}
```

For date-only input use `{ "type": "date_only", "date": "2026-10-30", "timeZone": "Africa/Accra" }`, omitting `time`. Title is 1–160 trimmed characters, description up to 2,000, optional original source text up to 4,000, and priority is low/normal/high (normal default). Original source text is immutable through the edit endpoint. Lists are ordered by deadline, creation instant, and UUID for stable bounded pagination; results include next pending/processing notification time where applicable.

## Verification

- Unit tests use a fixed clock for threshold calculations, boundaries, leap dates, UTC conversion, DST rejection, date-only intent, and validation limits.
- PostgreSQL tests use isolated fixture accounts and apply real migrations. They verify uniqueness/check constraints, version replacement, unchanged-title schedules, cancellation of processing work, idempotency, overdue behavior, profile-zone stability, and concurrent stale revisions.
- An explicitly scoped test-only trigger forces queue insert failures. Both reminder creation and cancellation/replacement must roll back with no partial schedule. The trigger/function are removed in `finally`; only fixture users are deleted afterward.
- Two-user tests attempt read/edit/complete/reopen/delete/history access using known foreign UUIDs and forged owner fields. Both HTTP and repository boundaries are exercised.
- Playwright covers manual CRUD, persisted formula times, title-only edits, stale draft preservation, completion/reopening, deletion confirmation, and separate account access. Test app output uses `.next-e2e`, port 3100, isolated test credentials/accounts, and blank AI/SMTP keys so an existing developer server and provider availability do not control the result.
