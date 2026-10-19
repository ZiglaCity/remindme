# Notification worker

Phase 6 supplies a shared queue processor and a separate Azure Functions Node.js v4 adapter. The project owner requested local implementation because no Azure subscription is configured yet. **No Azure resources or deployed timer are claimed.** Core Tools/Azurite host execution, subscription/region eligibility, cloud SMTP connectivity and a deployed end-to-end timer check remain pending.

## Queue behavior

`claimBatch` locks a bounded group of reminder rows with PostgreSQL `FOR UPDATE SKIP LOCKED`, using the same reminder-before-notification lock order as editing and delivery. It considers due notifications, eligible retries, invalid/outdated work and expired processing leases. A reminder with a fresh claim is excluded from another send wave. Child reads are capped at 100 rows per selected reminder; normal V1 mutations leave at most three outstanding thresholds in the current version. No full queue is loaded into application memory.

For each selected reminder, invalid versions, completed/deleted reminders and past deadlines are cancelled with recorded reasons. Among scheduled-due thresholds, only the highest percentage survives; lower ones are cancelled as `coalesced_catch_up`, including lower retry work when the highest threshold is backing off. This applies whether earlier notifications were sent or none were sent. The highest surviving threshold must satisfy its own retry time before it is claimed. Future thresholds stay pending.

Claims get a random token and database processing timestamp. The Phase 5 service checks token, state, deadline, recipient approval and lease immediately before SMTP. Duplicate invocation of a token cannot start another persisted attempt. Late results cannot replace a newer token or revive a cancelled row. A late confirmed SMTP acceptance may refine that old attempt's `worker_lease_expired` uncertainty in history, while leaving the replacement claim untouched.

## Recovery, limits and shutdown

The default lease is 300 seconds (validated range 300–1800). Expired processing work increments `recovery_count`; the default maximum is three recoveries (configurable 1–10). A stale `sending` attempt becomes `uncertain`, because the old worker may have reached SMTP before losing persistence. Recovery preserves the SMTP attempt count and applies the configured backoff when an attempt had begun. A crash before `beginAttempt` can be reclaimed immediately, but still counts against the separate recovery cap. Exhausted recoveries or attempts become terminal `failed` work. Nothing is recovered after its reminder deadline.

`WORKER_BATCH_SIZE` defaults to 25 examined reminders per invocation, capped at 100. Deliveries can never exceed that count. Coalescing/cancellation can update several threshold rows for one examined reminder. `WORKER_CONCURRENCY` defaults to five, capped at ten; a wave claims no more than its immediately available send slots. Concurrent workers may return a smaller batch when a candidate changes while being selected; the processor proceeds to other candidates within its per-run bound.

`WORKER_RUN_BUDGET_SECONDS` defaults to 240 (range 180–240). It is an admission budget: the last 120 seconds are reserved for draining in-flight work. Claims obtained after admission closes or shutdown begins are released only if their attempt has not started and their token still matches. No further waves start after cancellation. The Azure terminate hook requests shutdown; the local one-shot command handles SIGINT/SIGTERM. Abrupt host termination is still possible and uses lease recovery.

SMTP has a 60-second total deadline; PostgreSQL has connection, query and statement limits. `host.json` imposes a five-minute host timeout. A process kill or unusually slow sequence of successful queries can still interrupt persistence; the host timeout is the final bound, not an exactly-once guarantee. Claims are never queued behind multiple SMTP waves or kept in open database transactions during SMTP.

Operational events include invocation/notification/reminder IDs, queue age, attempt number, duration, counts and safe outcome categories. They omit reminder bodies, credentials, addresses and raw SMTP/SQL errors. `worker_invocation_failed` marks a failed host invocation; `notification_interrupted` leaves that claim available for bounded lease recovery. A failure in one send does not prevent other sends in the wave from finishing. Configure alerts on repeated worker failures, failed notifications, old due work and stale claims before production.

## Build and local operation

From the repository root:

```powershell
npm ci
npm run db:migrate
npm run worker:build
npm run worker:check
npm run worker:once
```

`worker:check` is read-only and uses the default five-minute lease for its stale count. `worker:once` without arguments claims nothing and sends nothing. To deliberately process one real bounded batch using configured SMTP approvals:

```powershell
npx tsx scripts/worker-once.ts --send-approved
```

This operates on actual eligible reminders; use a dedicated development database and explicitly approved destinations. There is no public HTTP trigger. The one-shot command is an operational tool, not a scheduler or substitute for the Azure timer. Its local `APP_URL` falls back to `NEXT_PUBLIC_APP_URL`; the deployed adapter requires explicit `APP_URL` and never requires web/auth/Gemini secrets.

`worker:build` emits `dist/notification-scheduler` with `worker.cjs`, `host.json`, a minimal package/lockfile and `.funcignore`. It bundles shared code, pg, Drizzle, Zod, Nodemailer and templates. Only the pinned Azure Functions SDK is a required external runtime dependency; optional `pg-native` is unused. The build rejects Next.js, Better Auth, server-only and Google SDK inputs. No local settings, environment files, root node_modules or credentials are copied.

Install the artifact's independent runtime dependency from its own directory:

```powershell
Set-Location dist/notification-scheduler
npm ci --omit=dev
```

The artifact is JavaScript for Node 22, with no root TypeScript paths or Next runtime dependency. A `bundle-manifest.json` records inputs for inspection and is excluded from publishing. SDK loading outside a Functions host falls back to its test mode; successful plain Node loading does not prove a real timer listener has started.

### Optional real local Functions host

Install **Azure Functions Core Tools v4** and **Azurite**, then start the storage emulator. Copy `azure-functions/notification-scheduler/local.settings.example.json` to `dist/notification-scheduler/local.settings.json` and fill it privately. Set a separate development/test database, SMTP configuration, explicit approvals and `APP_URL`. The example disables the timer using `AzureWebJobs.notificationScheduler.Disabled=true` so copying it does not immediately send mail.

After deliberately preparing due test reminders and approving the destinations, set that value to `false` and run `func start` from the artifact directory. The timer's six-field UTC NCRONTAB expression is `0 * * * * *`: once per minute. `runOnStartup=false` and `useMonitor=true`; `AzureWebJobsStorage` is required for monitoring/host coordination. Observe an actual timer invocation and database transition before claiming this host path is verified. Stop the host and restore the disabled setting after testing. Keep `local.settings.json` out of Git and cloud publication.

## Azure deployment checkpoint

The prepared target is Functions runtime 4 / Node 22 / programming model v4, with the SDK pinned to 4.16.5. Flex Consumption on Linux is a candidate hosting plan. Subscription/region support and quotas must be checked when an account is available, rather than inferred from general runtime support:

```powershell
az login
az account show
az functionapp list-flexconsumption-locations --runtime node --output table
az functionapp list-flexconsumption-runtimes --location <chosen-region> --runtime node
```

Before provisioning, select the subscription and a supported region near the development Neon project, check Node 22 availability and memory quota, and review the current compute/storage/logging charges. Keep always-ready instances off initially unless latency justifies their cost. A one-minute database poll can keep Neon compute active; do not assume a timer plus a free allowance has zero total cost. Verify outbound SMTP connectivity to the selected provider on port 587/465 and any provider login restrictions. No per-subscription cost or availability check has been performed yet.

Provision a development function app and separate host storage account, configure the runtime using that plan's supported settings, and initially disable the timer. Host storage is separate from Neon: Neon stores reminders/claims, while Azure storage coordinates the Functions host and monitored schedule. Set `AzureWebJobsStorage`, `DATABASE_URL`, `APP_URL`, SMTP settings/approvals and worker limits privately in Azure configuration or supported managed-identity/secret references. Do not copy Better Auth or Gemini secrets. Use a distinct app/host identity for development and production.

After installing the artifact's locked production SDK, publish from that directory:

```powershell
func azure functionapp publish <development-app-name> --no-build
```

Do not publish local settings or show host keys. Confirm the deployment contains only this worker package, apply the reviewed database migrations, verify credentials/SMTP connectivity in Azure, then deliberately enable the timer with one approved synthetic reminder. Verify real minute-driven execution, correct owner, acceptance, inbox receipt, persisted attempts/status, coalescing and stale recovery. Record those as separate checks. There is no deployed external verification yet.

## Failure limitations and recovery

SMTP acceptance before a crash can be followed by a retry and duplicate delivery; a repeated Message-ID is only a trace aid. A final state check can also race with completion/deletion after SMTP has begun. These limits remain documented in [email delivery](./email.md); neither Azure timer coordination nor claim tokens can retract accepted mail or provide universal SMTP idempotency.

For a database outage, the timer fails safely and logs a sanitized invocation failure. After connectivity returns, subsequent invocations reclaim eligible stale work within the recovery cap. For terminal `failed` records, investigate the safe error category, credentials, approval, deadline and history; do not blindly reset sent/uncertain work to pending. A worker crash before sending may waste one recovery slot; a crash after acceptance requires checking the recipient before any manual retry. Do not run migrations or edit queue statuses from a public endpoint.

Verified locally: independent bundle generation, locked artifact SDK installation and plain Node loading, timer registration via a deterministic adapter check, shared PostgreSQL claims/recovery and delivery behavior with synthetic senders, and read-only development queue inspection. Actual Core Tools host timing and deployed Azure execution remain pending.

Primary references: [Node programming model/runtime](https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-node), [timer monitoring/storage](https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-timer), [Flex Consumption](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-plan), [host timeouts](https://learn.microsoft.com/en-us/azure/azure-functions/functions-scale#timeout), [Core Tools](https://learn.microsoft.com/en-us/azure/azure-functions/functions-core-tools-reference), and [Azure CLI availability checks](https://learn.microsoft.com/en-us/cli/azure/functionapp).
