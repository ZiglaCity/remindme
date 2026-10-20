# RemindMe — Product Requirements & Technical Specification

**Document version:** 1.1 (October 19 owner recurrence amendment)\
**Status:** Ready for implementation  
**Product type:** Personal reminder and external-memory web application  
**Initial audience:** Owner and a small group of invited testers  
**Primary objective:** Build a reliable, installable reminder application that converts natural-language thoughts into scheduled reminders and delivers timely email notifications.

---

# 1. Product Overview

## 1.1 Vision

RemindMe is a minimal, mobile-first personal reminder application that allows users to capture tasks, deadlines and thoughts using natural language, either by typing or speaking.

The application interprets the user's input, extracts the relevant reminder information, allows the user to confirm or edit it, persists the reminder and automatically sends email notifications as the deadline approaches.

RemindMe should function as an external memory system: users should be able to record something once and trust the application to retain it and notify them at the appropriate times.

## 1.2 Problem Statement

Users often forget tasks, deadlines and intentions because their reminders are scattered across notes, messages, calendars and memory.

Traditional reminder applications can require too many manual steps to create a reminder. RemindMe reduces that friction through natural-language input and automatically calculated notification schedules.

## 1.3 Product Goals

1. Make reminder creation fast and intuitive.
2. Interpret natural-language descriptions into structured, editable reminders.
3. Persist reminders and notification schedules reliably.
4. Deliver reminder emails at 50%, 75% and 90% of the time between creation and the deadline.
5. Support multiple independent users with secure data isolation.
6. Provide email/password authentication and Google OAuth.
7. Work as an installable Progressive Web App (PWA).
8. Minimize hosting costs and avoid unnecessary always-running infrastructure.
9. Maintain clear separation between the frontend, business logic, database and scheduled processing.

## 1.4 Non-Goals

The following are explicitly outside the initial release:

- Paid plans, subscriptions or billing.
- Team workspaces and shared reminders.
- Calendar synchronization.
- SMS, WhatsApp, push notifications or mobile-native applications.
- AI agents that independently change or complete tasks.
- Complex analytics or productivity dashboards.
- Email verification and password-reset workflows.
- A full offline-first synchronization engine.
- A dedicated Express API server.
- A custom email delivery service.

These features may be considered in later releases, but must not delay V1.

---

# 2. Target Users and Core Use Cases

## 2.1 Target Users

V1 is intended for the application owner and a small group of testers. The architecture must support multiple accounts from the beginning, even though the initial user base is small.

Every user must have an independent account, reminder collection, notification history and preferences.

## 2.2 Primary Use Cases

### Create a reminder using natural language

A user enters:

> Remind me to finish my DSA assignment by October 30 at 6 PM.

The application interprets the request, displays the proposed title and deadline, and allows the user to confirm or correct the result.

### Create a reminder using voice

A user speaks a reminder. Supported browsers convert speech into text, after which the normal parsing and confirmation flow applies.

### Receive deadline notifications

The system schedules notifications at 50%, 75% and 90% of the available time between reminder creation and its deadline.

### Edit a reminder

When a user changes a deadline, the application recalculates its pending notification schedule. Old pending notifications must not be sent.

### Complete or delete a reminder

Completing a reminder suppresses pending notifications. Deleting a reminder cancels its pending notifications and removes it from normal active views.

### Manage independent accounts

A user can register or sign in using email/password or Google OAuth. They must never be able to view, edit, complete or delete another user's reminders.

---

# 3. Functional Requirements

## 3.1 Authentication and User Accounts

Implement authentication using **Better Auth**, integrated with PostgreSQL through Neon.

Supported methods:

- Email and password.
- Google OAuth.

Requirements:

1. New users can register with an email address and password.
2. Existing users can sign in with their credentials.
3. Users can sign in using Google OAuth.
4. Sessions must persist across page reloads and application navigation.
5. Users can sign out.
6. Protected application routes require an authenticated session.
7. Authentication must be enforced on the server, not only in the frontend.
8. Passwords must be securely hashed using the authentication framework's supported password-hashing implementation.
9. Session cookies must use appropriate `HttpOnly`, `Secure` in production, and `SameSite` settings.
10. No email verification or password-reset workflow is required in V1.
11. Do not automatically link accounts merely because their email strings match. Owner amendment (October 20): a verified Google identity with the same email links to the existing email/password user and signs in; otherwise Google creates a new user. Preserve the existing user ID, data and password login. Reject unverified Google claims and different-email linking; use the framework's configured provider-identity and session checks.
12. Never expose OAuth client secrets, password hashes, session tokens or authentication internals to the browser.

Because email verification is intentionally excluded, users can register with an email address they do not control. Document this limitation, and do not represent unverified addresses as verified identities.

A user who loses access to their password may have no self-service recovery route in V1. Do not implement an insecure recovery shortcut.

### Authentication pages

- `/login`
- `/register`
- `/auth/callback` if required by the OAuth integration.

Use Better Auth's documented routes and callbacks where applicable. Avoid building a parallel custom session system.

## 3.2 Reminder Creation

The application must support text-based reminder creation.

Example inputs:

- "Submit my assignment by Friday at 5 PM."
- "Pay my electricity bill on November 4."
- "Finish the project report by October 30 at 18:00."
- "Call my lecturer tomorrow morning."

The AI parser should extract:

- Title.
- Optional description.
- Deadline date.
- Deadline time, when supplied.
- Whether the deadline is date-only or time-specific.
- The relevant time zone.
- Optional priority, if explicitly stated.
- Any unresolved ambiguity that requires clarification.

Use the Gemini API for interpretation.

Validate AI output against a strict Zod schema before using it. The AI must never directly insert database records, send emails, mark reminders complete or manipulate notification schedules.

### Creation workflow

1. User enters or dictates reminder text.
2. Client submits the text to a protected server endpoint.
3. Server invokes Gemini with the current date, current time and user's IANA time zone.
4. Server validates the structured response.
5. If the deadline is ambiguous, ask the user a concise clarification question.
6. Show a confirmation form containing the title, description and deadline.
7. User can edit all parsed fields.
8. On confirmation, server validates the fields again.
9. Server creates the reminder and notification records transactionally.
10. The application shows a success state and the saved reminder.

Do not create a reminder automatically from uncertain AI output without user confirmation.

### AI failure handling

If Gemini is unavailable, rate-limited or returns invalid output:

- Preserve the user's original text.
- Display a useful, non-technical error message.
- Allow the user to retry.
- Offer a manual reminder form.

AI failure must never cause existing reminders or schedules to be lost.

## 3.3 Voice Input

Use browser speech recognition where supported.

Requirements:

- A microphone control starts and stops speech recognition.
- Recognized text appears in the normal reminder input field.
- Users can edit the transcription before parsing.
- Request microphone access only when necessary.
- Display an appropriate message when speech recognition is unavailable or permission is denied.
- Always retain text input as the fallback.

Do not require a separate speech-to-text provider in V1.

## 3.4 Deadline and Time-Zone Handling

Correct time handling is a core reliability requirement.

Store actual instants in PostgreSQL using `TIMESTAMPTZ`. Store the user's IANA time zone separately, for example `Africa/Accra`.

The application must not depend on the hosting server's local time zone.

### Time-specific deadlines

If the user specifies a date and time, interpret them in the user's configured time zone and convert the resulting instant to UTC for persistence.

For example, a deadline of October 30 at 6 PM in `Africa/Accra` must represent the corresponding UTC instant, not an unqualified local timestamp.

### Date-only deadlines

If the user supplies a date without a time, use **11:59 PM local time on that date** as the deadline.

Store the original date-only intent separately so the interface can display the deadline as a date without incorrectly suggesting that the user explicitly entered a time.

### Ambiguous and invalid times

- Ask for clarification when a date or time cannot be determined reliably.
- Reject invalid dates.
- Handle daylight-saving transitions correctly for time zones that observe them.
- If a local time does not exist or occurs twice due to a daylight-saving transition, apply a documented, deterministic policy and request clarification where appropriate.
- Do not silently interpret a date in the server's time zone.
- Do not infer a date from an ambiguous weekday without considering the current local date.

### User time-zone preference

Detect the browser's time zone during initial setup where possible. Allow users to review and change it in settings.

Changing a user's time-zone preference must not silently change the absolute instant of an existing time-specific deadline. Date-only reminders may require explicit recalculation if the user elects to reinterpret them in a new time zone.

## 3.5 Notification Scheduling

The default notification thresholds are confirmed as:

- 50% of the available time.
- 75% of the available time.
- 90% of the available time.

Let:

- \(t_c\) = reminder creation instant.
- \(t_d\) = reminder deadline instant.
- \(p\) = threshold expressed as a fraction.

Calculate each notification time as:

\[
t_p = t_c + p(t_d-t_c)
\]

For example, if a reminder is created on October 20 at 6 PM and is due October 30 at 6 PM, the notifications are scheduled for:

| Threshold | Scheduled time   |
| --------- | ---------------- |
| 50%       | October 25, 6 PM |
| 75%       | October 28, 6 AM |
| 90%       | October 29, 6 PM |

All calculations use actual instants, not differences between formatted date strings.

### Scheduling rules

1. Persist every scheduled notification in PostgreSQL.
2. Create the reminder and its notification records in a single database transaction.
3. Schedule only notifications that are still in the future when the reminder is created or rescheduled.
4. If the deadline is already past, do not create new notifications. Show the reminder as overdue.
5. If some thresholds have already passed, skip those thresholds and retain future ones.
6. Completing, deleting or archiving a reminder cancels its pending notifications.
7. Editing the deadline cancels old pending notifications and creates a new schedule.
8. Changing only the title or description does not require recalculating the schedule.
9. Repeated processing must not create duplicate scheduled records.
10. When a notification is due, check that the reminder is still active immediately before sending.
11. Notification preferences may be added later; V1 uses the default thresholds.
12. If the user edits a reminder after a notification has already been sent, do not attempt to retract that email.

For a reminder whose deadline is in the past, show an overdue state in the UI. Do not create an endless stream of overdue emails.

## 3.6 Reminder Management

Users must be able to:

- View active reminders.
- View a reminder's details.
- Create reminders.
- Edit title, description and deadline.
- Mark reminders complete.
- Reopen completed reminders if desired.
- Delete reminders.
- View completed reminders separately.
- See whether a reminder is overdue.
- See the next scheduled notification where useful.

Use a simple, readable interface. Avoid unnecessary dashboards, decorative gradients, excessive cards and complex animations.

### Suggested routes

- `/` — minimal public landing page.
- `/login` — login.
- `/register` — registration.
- `/app` — active reminders and primary application experience.
- `/app/new` — reminder creation.
- `/app/reminders/[id]` — reminder details and editing.
- `/app/completed` — completed reminders.
- `/app/settings` — profile, time zone and account preferences.

The installed PWA must open `/app` directly rather than the public landing page.

## 3.7 Email Delivery

Use Nodemailer with a configurable SMTP server.

The application must not depend on a proprietary email API. Nodemailer is the SMTP client, not the email delivery provider itself.

Requirements:

- Send a reminder email to the email address associated with the reminder's owner.
- Never send one user's reminder to another user's address.
- Include the reminder title, deadline, relevant time zone and notification context.
- Use a consistent sender name and configured sender address.
- Store SMTP credentials only in server-side environment variables.
- Record the delivery result.
- Retry temporary failures with bounded exponential backoff.
- Distinguish transient errors from permanent errors where possible.
- Record failed attempts and the final error category without logging secrets or full sensitive email contents.
- Provide a useful operational log for debugging delivery failures.

Use Gmail SMTP with an App Password for initial testing if the account supports it. Treat this as a testing configuration, not a guarantee of production-grade email delivery.

Email verification and password-reset messages are outside V1.

---

# 4. Technical Architecture

## 4.1 Technology Stack

| Layer                        | Technology                                                     |
| ---------------------------- | -------------------------------------------------------------- |
| Frontend and web application | Next.js App Router                                             |
| Language                     | TypeScript                                                     |
| Styling                      | Tailwind CSS or the existing project styling system            |
| Validation                   | Zod                                                            |
| Authentication               | Better Auth                                                    |
| Database                     | Neon PostgreSQL                                                |
| Database access              | Drizzle ORM                                                    |
| AI parsing                   | Gemini API                                                     |
| Background scheduler         | Azure Functions timer trigger                                  |
| Email                        | Nodemailer + SMTP                                              |
| Hosting                      | Vercel for Next.js; Azure for scheduled processing             |
| PWA                          | Web app manifest and service worker                            |
| Tests                        | Vitest or equivalent; Playwright for critical end-to-end flows |

Use a consistent, currently supported Node.js LTS version across the web application and Azure Function. Confirm that the chosen version is supported by the deployment targets before implementation.

Use the framework's supported runtime and configuration rather than relying on undocumented hosting behavior.

## 4.2 Deployment Responsibilities

### Vercel

Hosts:

- Next.js frontend.
- Public landing page.
- Authenticated application.
- Request-driven API routes.
- Reminder creation and management.
- Gemini interpretation requests.

Do not run persistent in-memory timers in Vercel functions.

### Neon

Stores:

- Authentication data.
- User preferences.
- Reminders.
- Notification queue.
- Notification delivery history.

Use Neon as the durable source of truth. The scheduler must tolerate connection delays and transient database failures, including compute wake-up delays.

Use a pooled connection string where appropriate for application workloads and a suitable direct connection for migrations when required by the database tooling.

### Azure Functions

Hosts a small Node.js timer-triggered function that:

1. Runs on a one-minute schedule.
2. Connects to Neon.
3. Finds due pending notifications.
4. Claims due records safely.
5. Checks reminder status and ownership.
6. Sends eligible notifications through Nodemailer.
7. Records delivery outcomes.
8. Schedules retries for transient failures.
9. Releases or recovers stale processing claims.
10. Exits cleanly.

Use a supported Azure Functions hosting plan appropriate for a small scheduled workload. Prefer consumption-based execution rather than a permanently running virtual machine or web server.

The function requires the Azure resources and storage configuration necessary for timer-trigger coordination. Include those in the cost review.

Do not assume the student's credit covers every resource at no cost. Confirm the subscription's available services, current pricing and consumption meters.

## 4.3 Why There Is No Separate Express Backend

A dedicated Express server would duplicate API infrastructure that Next.js already provides.

The frontend's API endpoints are request-driven, while Azure Functions handles scheduled background processing. This gives the application two separate runtime environments without the maintenance overhead of a second general-purpose API server.

A dedicated API server may be reconsidered only if future requirements justify it.

## 4.4 Repository Structure

Use a monorepo:

```text
remindme/
├── src/
│   ├── app/
│   │   ├── (marketing)/
│   │   ├── (auth)/
│   │   ├── app/
│   │   └── api/
│   ├── components/
│   ├── services/
│   │   ├── reminders/
│   │   ├── scheduling/
│   │   ├── notifications/
│   │   └── ai/
│   ├── repositories/
│   ├── lib/
│   │   ├── auth/
│   │   ├── db/
│   │   ├── email/
│   │   └── validation/
│   └── types/
├── azure-functions/
│   └── notification-scheduler/
├── migrations/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── public/
├── drizzle.config.ts
├── package.json
├── README.md
└── .env.example
```

Adapt the structure to the repository if implementation has already begun. Do not duplicate existing modules or replace working configuration without a reason.

The Azure function must have its own entry point and deployment configuration. Reuse shared scheduling and notification logic where practical, while keeping the function independently deployable.

---

# 5. Database Design

All reminder and notification records must be associated with a user.

Use PostgreSQL foreign keys, appropriate indexes and transactional writes. Use Better Auth's documented schema for authentication tables and reference its user ID from application tables.

## 5.1 User Preferences

Create a `user_preferences` table with fields such as:

- `user_id` — primary key and foreign key to the authentication user.
- `time_zone` — IANA time-zone identifier.
- `created_at`.
- `updated_at`.

The default time zone should be detected from the browser when possible and stored explicitly.

## 5.2 Reminders

Create a `reminders` table containing:

- `id` — UUID primary key.
- `user_id` — required foreign key to the authenticated user.
- `title` — required.
- `description` — nullable.
- `source_text` — original natural-language input, nullable.
- `due_at` — required `TIMESTAMPTZ`.
- `due_date` — original local calendar date.
- `deadline_type` — `date_only` or `date_time`.
- `time_zone` — IANA time zone used to interpret the deadline.
- `priority` — optional, with a small documented set of values.
- `status` — `active`, `completed` or `archived`.
- `completed_at` — nullable timestamp.
- `schedule_version` — integer incremented whenever the deadline schedule is regenerated.
- `created_at`.
- `updated_at`.
- `deleted_at` — nullable soft-deletion timestamp.

The database should enforce valid status values and required fields. Use indexes for user-specific active reminders and deadline queries.

## 5.3 Scheduled Notifications

Create a `scheduled_notifications` table containing:

- `id` — UUID primary key.
- `reminder_id` — required foreign key.
- `threshold_percent` — 50, 75 or 90.
- `schedule_version` — the reminder schedule version for which this notification was created.
- `scheduled_for` — `TIMESTAMPTZ`.
- `status` — `pending`, `processing`, `sent`, `failed` or `cancelled`.
- `attempt_count` — integer.
- `next_attempt_at` — nullable timestamp.
- `processing_started_at` — nullable timestamp.
- `sent_at` — nullable timestamp.
- `provider_message_id` — nullable.
- `last_error_code` — nullable.
- `created_at`.
- `updated_at`.

Enforce uniqueness for each reminder, schedule version and threshold combination.

Add indexes that efficiently locate pending notifications whose scheduled or retry times have arrived.

The worker must use a transaction and a concurrency-safe claiming strategy, such as `SELECT ... FOR UPDATE SKIP LOCKED`, so multiple overlapping executions do not normally process the same record simultaneously.

## 5.4 Notification Attempts

A separate `notification_attempts` table is recommended for operational history:

- `id`.
- `notification_id`.
- `attempted_at`.
- `result`.
- `error_category`.
- `error_message` — sanitized.
- `provider_message_id` — nullable.

This supports debugging and retry analysis without relying on overwritten fields in the queue.

## 5.5 Data Integrity

- Use UUIDs for application-generated entity IDs.
- Enforce foreign keys.
- Use database transactions for reminder creation and schedule replacement.
- Ensure all ownership-sensitive queries include the authenticated user's ID.
- Use migrations rather than manually changing production schemas.
- Never rely on client-side filtering for user isolation.
- Use soft deletion where it simplifies safe cancellation and auditability.
- Ensure deleting a reminder cancels its outstanding notifications.

---

# 6. Scheduler and Delivery Reliability

## 6.1 Timer Configuration

Configure the Azure Functions timer trigger to run every minute using the documented timer schedule format for the selected Azure Functions runtime.

The timer is a polling mechanism, not the authoritative schedule. PostgreSQL remains the source of truth for when notifications are due.

## 6.2 Claiming and Processing

For each invocation:

1. Connect to Neon with bounded connection and query timeouts.
2. Find due `pending` notifications and eligible retries.
3. Atomically claim a bounded batch.
4. Load the associated reminder and owner.
5. Skip and cancel work belonging to inactive, deleted or rescheduled reminders.
6. Verify the notification's `schedule_version` matches the reminder's current version.
7. Check that the user and destination email are available.
8. Send the email.
9. Record the result and delivery timestamp.
10. Retry transient errors according to the retry policy.
11. Recover stale processing records safely.
12. Finish without processing an unbounded amount of work in one invocation.

Do not load every notification into memory.

## 6.3 Retries

Use bounded exponential backoff for transient errors. For example, retry after approximately 1 minute, 5 minutes, 15 minutes and 1 hour, with a configured maximum attempt count.

The actual intervals should be configurable.

Permanent errors, such as an invalid destination address, should not be retried indefinitely. Record the failure for inspection.

## 6.4 Duplicate Prevention

Use database uniqueness constraints, concurrency-safe claiming and delivery-state checks.

SMTP does not generally provide a universal idempotency mechanism. There is an unavoidable failure window if the SMTP server accepts a message but the worker crashes before recording the successful send.

Therefore:

- Design for strong duplicate suppression.
- Record provider message IDs when available.
- Do not claim absolute exactly-once email delivery.
- Document the possible duplicate-send edge case.
- Ensure retries do not repeatedly send notifications already recorded as sent.

## 6.5 Missed Runs

If the timer is delayed or the function is temporarily unavailable, the next successful invocation should find overdue pending notifications and process them according to the retry and catch-up policy.

Do not discard a notification simply because its scheduled time has passed.

Avoid sending a large burst of old notifications without limits. Process a bounded batch per invocation and apply backpressure when the queue grows.

## 6.6 Editing and Completion Races

If a reminder is completed, deleted or rescheduled while the worker is processing a notification, the worker must recheck its state immediately before sending.

Where practical, minimize the race window with a final database check. Recognize that a state change can still occur after the final check and before SMTP accepts the message.

Once a message has been accepted by SMTP, the application cannot guarantee that it can be recalled.

---

# 7. API Requirements

Use Next.js Route Handlers for application APIs. All request payloads must be validated using Zod.

The following routes are illustrative contracts; adapt them to Better Auth's documented integration and the final routing structure.

| Method                | Route                          | Purpose                                   |
| --------------------- | ------------------------------ | ----------------------------------------- |
| Auth framework routes | `/api/auth/*`                  | Authentication and OAuth callbacks        |
| `POST`                | `/api/ai/parse`                | Interpret natural-language reminder input |
| `GET`                 | `/api/reminders`               | List the authenticated user's reminders   |
| `POST`                | `/api/reminders`               | Create a reminder and schedule            |
| `GET`                 | `/api/reminders/[id]`          | Retrieve one owned reminder               |
| `PATCH`               | `/api/reminders/[id]`          | Edit reminder details or deadline         |
| `POST`                | `/api/reminders/[id]/complete` | Complete a reminder                       |
| `POST`                | `/api/reminders/[id]/reopen`   | Reopen a completed reminder               |
| `DELETE`              | `/api/reminders/[id]`          | Delete an owned reminder                  |
| `GET`                 | `/api/reminders/completed`     | List completed reminders                  |
| `GET`                 | `/api/settings`                | Read user preferences                     |
| `PATCH`               | `/api/settings`                | Update preferences                        |

For every protected endpoint:

1. Resolve the session on the server.
2. Reject unauthenticated requests.
3. Validate all user input.
4. Verify ownership in the database query itself.
5. Return only data the user is authorized to access.
6. Return consistent error responses without exposing internal stack traces.

Do not expose an endpoint that allows arbitrary users to trigger the scheduler or inspect the global notification queue.

The Azure timer function should be an independently deployed worker, not an unauthenticated public endpoint.

---

# 8. Security and Privacy

Security requirements apply even during testing with only a few users.

## 8.1 Authentication

- Use Better Auth's supported session handling.
- Keep secrets server-side.
- Do not store passwords in plaintext.
- Apply reasonable login and AI-request rate limits.
- Use safe OAuth callback URLs.
- Do not trust client-supplied user IDs.

## 8.2 Authorization

Every reminder, notification and history query must be scoped to the authenticated user.

A user must not be able to access another user's records by changing a UUID in a URL or API request.

Add automated tests that attempt cross-user access for read, edit, completion and deletion operations.

## 8.3 Secrets

Never commit `.env` files or credentials.

Use deployment environment variables for:

- Database connections.
- Authentication secrets.
- Google OAuth credentials.
- Gemini API keys.
- SMTP credentials.
- Any required Azure configuration.

Do not expose secrets through `NEXT_PUBLIC_` variables.

## 8.4 Logging

Log useful operational metadata such as:

- Notification ID.
- Reminder ID.
- Attempt number.
- Processing duration.
- Result and sanitized error category.

Do not log passwords, session tokens, OAuth secrets, SMTP credentials or unnecessary personal reminder contents.

## 8.5 Abuse Protection

- Rate-limit authentication and AI parsing where practical.
- Apply request-size limits.
- Validate reminder lengths and input formats.
- Handle malformed AI responses.
- Avoid unbounded AI retries.
- Prevent unauthorized notification triggering.
- Configure appropriate production security headers.

---

# 9. Progressive Web App

The application must be installable as a PWA on supported browsers and devices.

Requirements:

- Valid web app manifest.
- Application name and short name.
- Appropriate icons in required sizes.
- Theme and background colors.
- Suitable display mode.
- Correct `start_url` pointing to `/app`.
- HTTPS deployment.
- A service worker for the required installability and caching behavior.

Do not cache private API responses, authenticated pages or reminder data in a way that could expose one user's information on a shared device.

V1 does not require full offline editing or background synchronization. The application should display a useful offline state and recover when connectivity returns.

The public landing page at `/` should remain lightweight and secondary to the application itself.

---

# 10. User Interface Requirements

Prioritize clarity and speed.

## Main application

The primary screen should include:

- A clear reminder input.
- A voice-input control when supported.
- A create/parse action.
- A list of active reminders.
- Deadline and overdue indicators.
- Easy completion controls.
- Access to completed reminders and settings.

## Reminder creation

Show the proposed title and deadline after parsing. The user must be able to correct the interpretation before saving.

## Visual direction

- Minimal, modern and mobile-first.
- Clear typography and spacing.
- Subtle borders and neutral surfaces.
- Avoid unnecessary gradients, decorative cards and excessive visual effects.
- Provide useful empty states, loading indicators and error messages.
- Ensure keyboard accessibility and appropriate color contrast.

Do not spend disproportionate time on landing-page polish before the reminder workflow is complete.

---

# 11. Configuration and Environment Variables

Create `.env.example` with placeholder values only.

Expected variables include:

```dotenv
# Database
DATABASE_URL=

# Better Auth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Gemini
GEMINI_API_KEY=

# SMTP
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=

# Application
NEXT_PUBLIC_APP_URL=
```

Include any additional variables required by the chosen Better Auth, Drizzle, Neon or Azure Functions configuration.

The Azure function must receive the database and SMTP configuration through its own deployment settings. Do not assume that Vercel environment variables are automatically available in Azure.

Keep local, preview and production settings separate.

Do not commit real credentials, `.env` files or production connection strings.

---

# 12. Deployment and Cost Strategy

## Vercel

Deploy the Next.js application to Vercel.

Use the Hobby plan for initial personal development and testing only while the project and usage remain eligible under its current terms and limits. Do not assume the plan is unrestricted or permanently free.

Check function limits, build limits, usage and plan eligibility before increasing traffic.

## Neon

Use Neon PostgreSQL as the persistent database.

Neon is preferred over Supabase for this project. Keep the database outside Azure to avoid consuming Azure credit on database hosting.

Do not assume that Neon compute never scales to zero. Design the application and scheduler to tolerate connection delays and transient database errors.

## Azure

Use Azure Functions for scheduled notification processing.

Before deployment:

1. Verify the Functions runtime and Node.js version.
2. Create the required function app and timer-trigger configuration.
3. Provision the required storage account.
4. Configure database and SMTP settings.
5. Confirm that the selected plan and required resources are available to the student subscription.
6. Review the cost of each provisioned resource.
7. Configure credit monitoring and usage alerts where available.
8. Deploy a test function and confirm that it runs.
9. Verify that it can connect to Neon and send a test email.

Avoid always-running virtual machines, unnecessary web apps, additional managed databases and services not required by V1.

Azure for Students provides a limited credit balance. The architecture must remain portable so the scheduled worker can be moved to another host if the credit is exhausted or expires.

## SMTP

Begin with a test SMTP account that supports the required sending behavior.

Before relying on it, verify:

- Authentication succeeds from the Azure environment.
- The sender address is accepted.
- Messages reach the intended recipients.
- Sending limits are adequate.
- Temporary SMTP failures are handled.
- Credentials can be rotated without changing application logic.

No email provider should be hard-coded into the business logic.

## Database and Scheduler Portability

Keep notification processing independent of Azure-specific business logic. Azure Functions should be an adapter around reusable scheduling and delivery services, allowing another scheduler runtime to be introduced later without rewriting reminder behavior.

---

# 13. Testing Requirements

Testing is part of implementation, not an optional final step.

## 13.1 Unit Tests

Test:

- Zod schemas.
- AI response validation.
- Date and time parsing.
- Date-only deadline conversion.
- Time-zone conversions.
- Threshold calculations.
- Past-deadline behavior.
- Notification schedule regeneration.
- Reminder status transitions.
- Retry policy calculations.

Use a fixed clock or injectable time source for deterministic scheduling tests.

## 13.2 Database Integration Tests

Test:

- Reminder creation and notification records are committed together.
- Invalid input creates no partial records.
- Editing a deadline cancels old pending notifications.
- Completed reminders have no eligible pending notifications.
- Deletion cancels outstanding work.
- Notification uniqueness constraints prevent duplicate scheduling.
- Concurrent worker executions do not normally claim the same notification.
- Stale processing claims can be recovered.

## 13.3 Authorization Tests

Create at least two test users.

Verify that user A cannot read, edit, complete, delete or inspect notifications belonging to user B, even when user A knows the record ID.

Test both API endpoints and any server-side data access paths.

## 13.4 Email Tests

Use a mocked SMTP transport for automated tests.

Verify:

- Correct recipient.
- Correct reminder details.
- Correct threshold context.
- Successful send records a sent status.
- Temporary failures are retried.
- Permanent failures stop retrying after classification.
- Duplicate processing does not normally send duplicate emails.
- A completed reminder is skipped before delivery.

Provide a safe manual test command or test procedure for sending a message to an explicitly configured test address.

## 13.5 End-to-End Tests

Verify the complete flows:

1. Register with email/password.
2. Log in and log out.
3. Sign in through Google OAuth in a suitable test environment.
4. Create a reminder using natural language.
5. Correct an AI-parsed deadline.
6. Save the reminder.
7. Confirm the notification schedule in the database.
8. Edit the deadline and verify schedule regeneration.
9. Complete the reminder and verify notification cancellation.
10. Verify cross-user isolation.
11. Install or validate the PWA and confirm its start URL.
12. Simulate a worker failure and verify recovery behavior.

## 13.6 Production Smoke Tests

After deployment:

- Verify authentication.
- Create and edit a test reminder.
- Confirm database persistence.
- Confirm the Azure timer is running.
- Confirm a due notification can be processed.
- Confirm the SMTP server accepts the message.
- Confirm delivery status is recorded.
- Check application and function logs for errors.

Do not use real user reminders for destructive test scenarios.

---

# 14. Implementation Roadmap

Build the application in the following order. Each phase must be testable before moving to the next.

## Phase 1 — Repository and Foundation

- Inspect the existing repository before changing files.
- Establish TypeScript, linting and formatting.
- Configure Next.js and the UI foundation.
- Configure environment validation.
- Set up Neon and Drizzle.
- Add versioned migrations.
- Confirm local development works.

**Exit criteria:** the app starts locally and connects to the development database.

## Phase 2 — Authentication and User Isolation

- Integrate Better Auth.
- Add email/password authentication.
- Add Google OAuth.
- Configure sessions and protected routes.
- Create user preferences.
- Add authorization helpers.
- Add cross-user security tests.

**Exit criteria:** multiple users can sign in independently, and cross-user access tests pass.

## Phase 3 — Reminder CRUD and Deadline Handling

- Implement reminder schemas and repositories.
- Add create, list, detail, edit, complete, reopen and delete operations.
- Implement date-only and date-time semantics.
- Add time-zone handling.
- Add schedule calculation functions.
- Persist reminders and notification records transactionally.

**Exit criteria:** reminder CRUD and schedule regeneration work without AI or email.

## Phase 4 — AI Parsing and Voice Input

- Integrate Gemini server-side.
- Validate structured responses with Zod.
- Add clarification handling.
- Add manual creation fallback.
- Add browser speech recognition where supported.
- Test malformed responses and provider errors.

**Exit criteria:** users can turn text or speech into a confirmed, correctly scheduled reminder.

## Phase 5 — Email Delivery

- Configure Nodemailer and SMTP.
- Implement notification templates.
- Add delivery status updates and attempt history.
- Add bounded retries and permanent-failure handling.
- Test recipient isolation.

**Exit criteria:** a manually triggered test notification reaches the intended recipient and its outcome is recorded.

## Phase 6 — Azure Scheduler

- Create the timer-triggered Azure Function.
- Configure a one-minute schedule.
- Implement bounded queue processing.
- Add concurrency-safe claiming.
- Add stale-claim recovery.
- Add status checks and schedule-version checks.
- Add retry and missed-run handling.
- Deploy and test the function against the development database.

**Exit criteria:** due notifications are processed without relying on in-memory timers or Vercel Cron.

## Phase 7 — Application UI and PWA

- Build the main reminder interface.
- Add creation and editing screens.
- Add active and completed views.
- Add settings.
- Implement the PWA manifest and service worker.
- Ensure the installed application opens `/app`.
- Check accessibility and mobile responsiveness.

**Exit criteria:** the complete reminder workflow works on desktop and mobile browsers.

## Phase 8 — Deployment and Hardening

- Deploy the Next.js app to Vercel.
- Configure production Neon credentials.
- Deploy the Azure Function.
- Configure production SMTP.
- Configure Google OAuth callback URLs.
- Run database migrations.
- Execute end-to-end and smoke tests.
- Verify logging and usage monitoring.
- Document recovery, migration and troubleshooting procedures.

**Exit criteria:** the production deployment passes all critical acceptance tests.

## Phase 9 — Documentation and Handoff

- Document local setup.
- Document all environment variables.
- Document database migrations.
- Document Azure deployment.
- Document Vercel deployment.
- Document SMTP setup.
- Document common failure scenarios.
- Document how to move the scheduler to another host.
- Document known V1 limitations.

**Exit criteria:** a developer can reproduce the environment and deploy the application using the repository documentation.

---

# 15. Definition of Done

V1 is complete when all of the following are true:

- [ ] Email/password authentication works.
- [ ] Google OAuth works.
- [ ] Email verification and password reset remain out of scope.
- [ ] Every user has isolated reminders and notification history.
- [ ] Natural-language parsing produces editable, validated data.
- [ ] Voice input works where supported, with text fallback.
- [ ] Date-only and time-specific deadlines behave correctly.
- [ ] The 50%, 75% and 90% notification schedule is persisted.
- [ ] Deadline edits replace the pending schedule correctly.
- [ ] Completion and deletion suppress pending notifications.
- [ ] The Azure scheduler processes due records.
- [ ] Scheduler retries and recovery are tested.
- [ ] Nodemailer sends through the configured SMTP server.
- [ ] Delivery attempts and outcomes are recorded.
- [ ] The PWA installs on supported browsers and opens `/app`.
- [ ] Vercel, Neon and Azure deployments are documented.
- [ ] Environment secrets are not committed.
- [ ] Critical authorization and scheduling tests pass.
- [ ] Cost monitoring and provider limitations are documented.
- [ ] The app remains usable when AI or email services temporarily fail.

---

# 16. Instructions for Codex

Treat this document as the source of truth for V1.

Before writing code:

1. Inspect the existing repository, package files, routes, schema, migrations and current implementation.
2. Identify which requirements already exist.
3. Produce a concise implementation plan with the intended files and migrations.
4. Identify any genuine conflicts with the existing codebase before changing it.
5. Preserve working code and configuration where possible.

During implementation:

- Use TypeScript consistently.
- Keep business logic out of React components and route handlers where practical.
- Use service and repository boundaries.
- Validate external input with Zod.
- Use transactions for reminder creation and schedule replacement.
- Keep all authorization checks server-side.
- Never use in-memory timers as the source of truth for scheduled reminders.
- Never let the AI directly mutate the database or trigger email delivery.
- Keep the Azure worker independently deployable.
- Avoid unnecessary dependencies and abstractions.
- Do not implement out-of-scope features.
- Do not substitute mocked implementations for production functionality without explicitly documenting the limitation.
- Do not claim a deployment or external integration works until it has been tested.

After each phase:

1. Run relevant tests.
2. Run linting and type checks.
3. Fix regressions before continuing.
4. Update the README and environment example when configuration changes.
5. Summarize completed work, remaining work and any blockers.

Do not build the entire application in one uncontrolled code-generation pass. Implement the roadmap incrementally, preserving a working application at each stage.

The priority order is **correctness, data isolation, reliable scheduling, reliable delivery, usability, and visual polish**.

---

# 17. Final Product Decisions

The following decisions are locked for V1:

- Next.js App Router and TypeScript.
- Vercel for the web application and request-driven API.
- Neon PostgreSQL for persistent data.
- Better Auth for email/password and Google OAuth.
- No email verification or password-reset workflow.
- Strict per-user ownership enforcement.
- Gemini for natural-language interpretation.
- Zod for validation.
- Browser speech recognition with text fallback.
- Azure Functions for scheduled background processing.
- A one-minute scheduler polling interval.
- Nodemailer over configurable SMTP.
- Notification thresholds of 50%, 75% and 90%.
- Explicit date-only and date-time deadline semantics.
- Persisted notification schedules with retries and recovery.
- PWA launch directly into `/app`.
- Recurring reminders follow the October 19 owner amendment below.
- No separate Express API server.
- No unnecessary paid services or always-running infrastructure.

**Product principle:** RemindMe must remain a trustworthy reminder system even when the AI provider, database connection, hosting platform or SMTP server temporarily fails. Existing reminders and their schedules must remain durable, recoverable and isolated by user.

# 18. Owner scope amendment — October 19, 2026

Recurring reminders are now included in V1, superseding the original recurrence exclusion. Support daily, weekly (including selected weekdays), monthly, configurable calendar intervals and an optional inclusive end date. Natural-language and voice transcripts can specify repeats, such as “every Sunday at 2 PM,” and the editable confirmation includes the repeat rule. Improve descriptions from supplied event context without inventing facts.

The owner confirmed that repeats retain **50% / 75% / 90% advance notifications** for every occurrence. The initial occurrence uses its creation anchor; each later occurrence uses the preceding scheduled occurrence as its interval anchor. **Mark complete stops the entire repeating reminder** and cancels future work. Deleted/completed series never restart automatically. Reopen is explicit. Original one-off reminder policies remain unchanged.

Use stored local calendar intent and IANA time zones, preserve month-day intent across shorter months, and define future DST handling. The worker advances occurrences and inserts schedules atomically under row locks, retains history, bounds catch-up after downtime, and avoids duplicate advancement across overlapping invocations. A recurring reminder whose previous notifications are already terminal must still advance at its deadline. Saved details are read-only until the user explicitly chooses Edit reminder; successful edits return to that view.

The full calendar, scheduling, outage and lifecycle policies are in [docs/recurrence.md](./docs/recurrence.md). This amendment authorizes the corresponding schema, worker, API, AI and form changes without a redesign of the application's visual style.
