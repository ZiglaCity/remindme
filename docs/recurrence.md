# Repeating reminders

Owner scope amendment, October 19, 2026. The original PRD excluded recurrence; the owner now explicitly includes it. The existing application design stays in place.

## What users can do

Choose **Does not repeat**, **Daily**, **Weekly** or **Monthly** in manual entry or editable AI confirmation. Intervals support every 1–365 days/weeks/months. Weekly rules support several weekdays; leaving them unchecked uses the first date's weekday. The first date must match a selected day. Monthly rules use the first date's day unless a day number is provided. An optional inclusive **Repeat until** date ends the series; otherwise it continues until completed/deleted.

“Join the research meeting every Sunday at 2 PM and bring progress notes” produces an editable weekly Sunday/14:00 draft and a description grounded in that transcript. The AI improves wording and retains supplied preparation/context; it must not invent an agenda, participants, location or links. Missing times and unsupported patterns (such as the second Tuesday each month or a fixed occurrence count) trigger clarification. There is one structured model call per interpretation and an explicit save.

After saving, the detail page shows read-only information. **Edit reminder** opens the form; **Save changes** closes it on success. Cancel discards unsaved edits. Save errors/conflicts preserve the form and its input.

## Confirmed notification and completion policies

- Repeats use the existing **50% / 75% / 90% advance check-ins**, not an additional notification at the occurrence time. The first interval begins at creation. Later intervals run from the previous calendar occurrence to the next one. Percentage arithmetic uses actual UTC elapsed milliseconds, so DST weeks can contain 167/169 hours while the event remains at 2 PM locally.
- **Mark complete stops the whole series**, cancels outstanding queue work and prevents automatic advancement. Delete soft-deletes the whole series. Reopen deliberately resumes the schedule: if its displayed date has passed, find the next future occurrence; do not replay missed dates. If the end date has passed, extend/remove it in Edit before reopening.
- Editing title/description/priority preserves the current recurrence anchor and queue. Pattern/time/date changes replace pending schedules transactionally. Changing only the end date preserves the current interval anchor. Removing repeat returns the reminder to the original one-off scheduling policy. Historical rows/attempts remain available.
- Existing one-off reminders retain their creation anchor, schedule formula, completion/reopen and ownership rules. Existing records default to no recurrence; the additive migrations do not rewrite their deadlines or notifications.

## Calendar boundaries

The first date/time is validated with the existing strict calendar/DST rules. Automatic future occurrences stay in the reminder's stored IANA zone, independent of later profile-zone changes. At a future spring-forward gap, move the occurrence forward by the gap; at a fall-back overlap use the earlier instant once. The following occurrence returns to the original local time. These future-repeat rules are an explicit extension to D3, not a change to one-off or first-date validation.

Monthly day 31 uses February 28/29, then returns to March 31; day 30 uses February's last day then March 30. “Last day of every month” is represented as day 31 with that clamp. Weekly interval boundaries begin on Monday and include selected weekdays on each active week, starting at the first occurrence. End dates are inclusive local dates. Dates beyond year 9999 end the supported series.

## Durable advancement and outages

The existing worker selects active repeating reminders whose current occurrence is due, including those whose current notifications are already all sent/failed/cancelled. It locks the reminder first, cancels outstanding old work, computes the next future calendar occurrence, advances the cursor/revision/schedule version and inserts its three queue rows **in one PostgreSQL transaction**. The immutable creation timestamp is retained; a separate `occurrence_anchor_at` stores the current interval start. Unique reminder/version/threshold keys and `FOR UPDATE SKIP LOCKED` prevent concurrent duplicate advancement. Insertion failure rolls back the cursor and cancellations too.

After downtime, skip fully elapsed occurrences rather than replaying them. For the next future occurrence, retain its due check-ins; normal worker coalescing sends at most the latest due threshold, then future thresholds normally. Future work is considered on the next worker invocation if advancement consumed the current reminder's batch slot. Ended series become completed atomically. Current claim-token fencing still prevents a late old worker from reviving cancelled/replaced work; the residual in-flight SMTP cancellation window is unchanged.

This is a bounded cursor with historical notification/attempt records, not a calendar/event attendance ledger. Only the current occurrence is materialized ahead of time. Displayed deadlines move when the worker advances them, and marking complete applies to the entire series.

## Operation and verification

Migrations `0004` and `0005` add nullable recurrence JSON, the interval anchor, validation constraints and a partial due index. Apply through the existing migration procedure before serving this version. `npm run worker:build` includes the same recurrence code in the independent worker artifact.

The Azure deployment remains deferred by the owner. A running worker is required for automatic advancement and email; browser visits do not run a hidden scheduler. No live SMTP send is part of recurrence verification.

Focused checks cover calendar/DST/month-end calculations, actual PostgreSQL concurrent advancement, fresh percentage schedules, whole-series completion, downtime, ended series and rollback on next-queue insertion failure. The browser reminder journey verifies AI repeat confirmation, faithful description persistence, read-only saved details, explicit editing and the existing one-off lifecycle. Physical voice accuracy and live model interpretation are separate provider/device gates.
