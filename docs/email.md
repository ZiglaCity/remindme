# Email delivery

Phase 5 provides SMTP delivery and durable outcomes. It does not start an automatic scheduler: the independently deployed Azure timer is Phase 6. No public send/queue-trigger endpoint is exposed.

## Configuration

Set server-side `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and a plain email address in `EMAIL_FROM`. Port 465 requires `SMTP_SECURE=true`; ports 587/25 require `false` and mandatory STARTTLS. Certificate validation and TLS 1.2 or newer are required. Credentials are not needed by ordinary web/manual reminder flows.

Set `APP_URL` to the application origin for email links. The local diagnostic command also accepts `NEXT_PUBLIC_APP_URL` as a fallback; the independent worker requires `APP_URL` explicitly. Links are built from trusted HTTP(S) configuration and the stored reminder ID, never reminder text. User content is escaped in HTML, included in plain text, and cannot load files or remote content through Nodemailer.

`SMTP_APPROVED_RECIPIENTS` is a comma-separated list of exact addresses. It stays separate from account admission even in `TESTER_ACCESS_MODE=all`. The recipient comes from the reminder owner's persisted account and must pass approval immediately before delivery. The transport also enforces approval and sends to one envelope recipient. No client request supplies an outbound address.

`SMTP_MAX_ATTEMPTS` defaults to five, with a hard maximum of ten. `SMTP_RETRY_DELAYS_SECONDS` defaults to `60,300,900,3600`: 1, 5, 15, then 60 minutes. Values must be nondecreasing integers between one second and one day (at most nine entries). If more attempts are configured than delays, the final delay repeats. Retries at/after the reminder deadline are not scheduled.

## Delivery and reliability

The worker/guarded CLI claims a due notification and passes its ID and random claim token to the delivery service. One claim token can start only one persisted attempt, including concurrent duplicate calls. State changes lock the reminder before the notification, matching edit/completion/deletion. The service rechecks active/not-deleted state, schedule version, deadline, recipient and claim immediately before SMTP. It holds no database transaction open while sending.

Attempts record `sending`, `sent` (SMTP acceptance), `failed`, `uncertain`, or `blocked`, with safe error categories and provider message IDs. SMTP attempt counts increment before network delivery; a blocked preflight is audited without consuming an SMTP attempt. Completion/deletion and schedule replacement cancel outstanding rows and clear the token. Outcome writes cannot revive cancelled work or overwrite a newer token. Actual SMTP acceptance is still recorded in attempt history when completion races with an in-flight message.

Explicit 4xx responses retry; authentication/configuration problems and explicit 5xx responses terminate. A connection loss or timeout during/after DATA has an **uncertain** outcome and may retry within the same bounded policy. Errors and logs omit raw SMTP responses, credentials, addresses and reminder bodies. Logs contain notification ID, attempt number, outcome category and status.

Transport operations use a fresh connection with a 15-second DNS/TCP connection deadline, a 10-second greeting limit, a 20-second socket-idle timeout and a 60-second total deadline. The total deadline destroys the underlying socket, including after STARTTLS, so a timed-out promise does not leave an active connection sending in the background. The planned five-minute processing lease must also budget database work. Batch selection, delayed-work coalescing, stale claim recovery and Azure invocation budgets belong to Phase 6.

SMTP acceptance does **not** prove inbox receipt. SMTP offers no universal idempotency key: a crash after acceptance but before persistence, or a lost final acknowledgement, can cause a later retry to duplicate mail. A stable Message-ID per notification helps trace attempts but does not guarantee deduplication. A completion/edit can also race after the final state check; accepted mail cannot be recalled. There is no exactly-once guarantee.

## Guarded live check

1. Run `npm run db:migrate` to apply the additive `claim_token` migration.
2. Run `npm run smtp:check` to verify connectivity, TLS and authentication without sending mail.
3. Privately set `SMTP_TEST_RECIPIENT` to the intended address, also present in `SMTP_APPROVED_RECIPIENTS`. That exact address must already belong to a stored application account.
4. Run `npx tsx scripts/smtp-check.ts --send` explicitly to send **one** controlled test. It creates a clearly labelled synthetic reminder for that stored owner, makes only its 50% notification due, and uses the normal delivery service. It never selects existing reminders or retries in a loop.
5. The command records provider acceptance and a message ID in PostgreSQL, prints the synthetic reminder ID, and completes the diagnostic reminder so failures are not picked up by a future scheduler. Confirm inbox/spam receipt separately. Do not rerun an uncertain send until checking whether the first message arrived.

The command fails safely without a valid approved test recipient or existing account. Local commands do not establish Vercel/Azure SMTP connectivity. Gmail App Passwords are suitable for initial testing when supported by the account; sender restrictions, sending quotas and spam policy still apply. Do not assume a free Gmail account is a production delivery service.

Verified October 19, 2026: TLS/authentication passed, one explicitly approved test email was accepted by SMTP on its first delivery attempt, its outcome/message ID were persisted, and the recipient confirmed inbox receipt in chat. An earlier connection-only failure occurred during verification, before reminder creation or sending; no duplicate email was sent. The diagnostic reminder was completed and its unused thresholds cancelled.

For rotation, replace the credential in the private local/hosting secret store, restart/redeploy every process using it, verify authentication, then revoke the old credential at the provider. Never enable raw SMTP debug logging to diagnose a production account. Before deployment verify the provider's current account quotas, permitted sender identities, SMTP port access and usage terms.

References: [Nodemailer SMTP/TLS/timeouts](https://nodemailer.com/smtp), [Gmail setup](https://nodemailer.com/usage/using-gmail/), [SMTP response codes](https://www.rfc-editor.org/rfc/rfc5321.html#section-4.2).
