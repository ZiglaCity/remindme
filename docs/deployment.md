# Owner-led deployment

## Current evidence — October 26, 2026

The owner provisioned `remindme` in Germany West Central, using Linux Flex Consumption and Node 22. The supplied resource export shows HTTPS-only, no zone redundancy, no configured always-ready instances and **2048 MB** memory. This differs from the proposed 512 MB but is compatible; resizing is optional after observing memory use. Creation of a running Function App does not prove deployment of `notificationScheduler`, configured application secrets or scheduled email delivery. `appSettings: null` in this export is not proof that settings are absent: Azure exposes them separately.

Production website: https://remindme-zigla.vercel.app

Read-only HTTPS probes returned 200 for the landing page, login, manifest, service worker and signed-out session endpoint. `/app` redirected to `/login`; private/login/session responses had no-store caching. Manifest start URL is `/app`. Azure's root responded 200, which is not a timer health check. The deployed website did not yet return the security headers currently prepared in `next.config.ts`.

Still unverified: production credentials/Google login, AI parsing, persisted CRUD, physical PWA installation, the deployed worker package, cloud secrets/storage permissions, timer execution, SMTP receipt, recurring advancement, alerts and recovery. No cloud account was accessed, no real reminder was changed and no email was sent during this review.

Read-only inspection of the locally configured application database found all six reviewed migrations applied and three due notification rows, with no processing, stale or failed rows. This is not evidence that Azure points at the same database. Review outstanding reminders before enabling the timer; due rows can be coalesced, cancelled or sent according to their current reminder state and recipient approval.

## Release update

Release `bc8530f` was pushed October 26. [Azure deployment](https://github.com/ZiglaCity/remindme/actions/runs/40323215087), [full CI](https://github.com/ZiglaCity/remindme/actions/runs/40323215052) and Vercel deployment succeeded. Public production probes now confirm the prepared security headers are live. The portal-created OIDC workflow was corrected in place and reuses its existing identity secret names. The owner confirmed Azure runtime settings are saved with scheduling enabled. No new account login or local cloud-tool installation was performed.

Read-only database checks after deployment show fresh deadline/occurrence cancellations and a fresh pending occurrence schedule, consistent with timer processing and recurring advancement. Actual email receipt, production Google login, phone installation and the Vercel delivery-status flag remain pending owner verification. The earlier snapshot above describes the pre-release state.

## Where configuration lives

Azure does not receive `.env.local` from your laptop or Vercel. In **Function App → Settings → Environment variables → App settings**, enter the worker settings below and apply the changes. Azure exposes these values to the Node process through `process.env`; saving settings restarts the app. Enter plain values without surrounding quotes. Never commit environment files or upload local settings. Keep existing platform-generated storage/deployment/monitoring settings.

| Setting                                             | Vercel Production                                           | Azure worker                                                     |
| --------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`                                      | Existing application Neon URL, retaining its TLS parameters | Same application database URL                                    |
| `BETTER_AUTH_SECRET`                                | Private production secret, at least 32 characters           | Not needed                                                       |
| `BETTER_AUTH_URL`                                   | `https://remindme-zigla.vercel.app`                         | Not needed                                                       |
| `NEXT_PUBLIC_APP_URL`                               | `https://remindme-zigla.vercel.app` (public)                | Not needed                                                       |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`          | Configured Google credentials                               | Not needed                                                       |
| `GEMINI_API_KEY`                                    | Private Gemini key                                          | Not needed                                                       |
| `GEMINI_MODEL`                                      | `gemini-3.5-flash-lite`                                     | Not needed                                                       |
| `TESTER_ACCESS_MODE`                                | `all` for open signup; otherwise `allowlist`                | Not needed                                                       |
| `TESTER_EMAIL_ALLOWLIST`                            | Exact comma-separated emails when using allowlist mode      | Not needed                                                       |
| `SMTP_APPROVED_RECIPIENTS`                          | Approved email addresses for matching UI eligibility        | Same exact comma-separated email addresses                       |
| `EMAIL_DELIVERY_ENABLED`                            | `false` until hosted delivery is verified, then `true`      | Not used                                                         |
| `APP_URL`                                           | Not needed by web                                           | `https://remindme-zigla.vercel.app`                              |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Not needed by web                                           | Existing working SMTP credentials and sender                     |
| `SMTP_PORT`, `SMTP_SECURE`                          | Not needed by web                                           | `587` / `false` for STARTTLS, or `465` / `true` for implicit TLS |
| `AzureWebJobs.notificationScheduler.Disabled`       | Not applicable                                              | `false` for normal automatic scheduling                          |

Only `NEXT_PUBLIC_APP_URL` is intended for public exposure. Do not prefix secrets with `NEXT_PUBLIC_`. Vercel variable changes require a new deployment. Setting `EMAIL_DELIVERY_ENABLED=true` changes UI text only; the Azure disabled setting controls actual timer execution. Open signup does **not** open email delivery: unapproved recipients are still blocked. Do not use `all` or `*` for SMTP approvals.

Optional worker settings already default to: `WORKER_BATCH_SIZE=25`, `WORKER_CONCURRENCY=5`, `WORKER_RUN_BUDGET_SECONDS=240`, `WORKER_MAX_RECOVERIES=3`, `PROCESSING_LEASE_SECONDS=300`, `SMTP_MAX_ATTEMPTS=5`, `SMTP_RETRY_DELAYS_SECONDS=60,300,900,3600`. Keep the budget/lease constraints in the schema when adjusting them.

Keep Azure's configured `AzureWebJobsStorage` connection or identity-based `AzureWebJobsStorage__*` settings and the storage permissions needed by the monitored timer. The export separately references `DEPLOYMENT_STORAGE_CONNECTION_STRING`; retain that setting too. Deployment storage and host storage serve different purposes. Preserve `APPLICATIONINSIGHTS_CONNECTION_STRING` when provisioned. On Flex Consumption the runtime is configured by `functionAppConfig.runtime`; do not add legacy `FUNCTIONS_WORKER_RUNTIME`, `FUNCTIONS_EXTENSION_VERSION`, `WEBSITE_RUN_FROM_PACKAGE` or Oryx build settings.

## Production Google configuration

In your Google OAuth web client, register the exact redirect URI:

```text
https://remindme-zigla.vercel.app/api/auth/callback/google
```

Use the matching production client credentials in Vercel. If configuring JavaScript origins, use `https://remindme-zigla.vercel.app`. Retain localhost separately for local development. Start a new Google sign-in for each test; callback codes cannot be reused. Verify both existing-password same-email linking and a new Google user. Only Google-verified emails can link. See [authentication](./authentication.md).

## Deploy the worker through GitHub

No local Azure CLI or Core Tools installation is required. GitHub Actions checks out the source, bundles its shared dependencies and publishes only `dist/notification-scheduler`, not the website or local secrets.

1. Commit/push the reviewed changes and ensure **Checks** passes on that release commit. Check current database backup/restore availability before any migration. The owner selected the existing application database rather than creating a separate production database; do not run tests or schema resets against it.
2. In Azure **Deployment Center**, configure GitHub/OIDC for this repository and the intended release branch. The portal can create the managed identity, federated trust, app-scoped Website Contributor role and generated workflow. Its initial deployment may need correction because this repository root is a Next.js app.
3. The corrected `.github/workflows/main_remindme.yml` now reuses the three `AZUREAPPSERVICE_*` secret names from the portal-created workflow. There is no second worker deployment workflow. Those values identify the deployment identity; database/SMTP secrets stay in Azure, not in this build job. Do not create a second set of identity secrets unless replacing the connection.
4. Match the federated credential to the exact repository and branch used for the workflow. The workflow does not specify a GitHub environment; an environment-scoped federated subject will not match its branch-scoped token. The portal-generated file has been corrected in place to avoid duplicate deployments.
5. Configure all worker settings and set `AzureWebJobs.notificationScheduler.Disabled=false` once. Then push the reviewed release or run **GitHub → Actions → Deploy Azure worker → Run workflow** on the reviewed branch. This workflow runs on pushes to `main` and supports manual dispatch; no recurring setup or timer toggle is required. Build packages contain the pinned Azure SDK, bundled application dependencies, `host.json`, package/lock files and entry point `worker.cjs`. No remote build is needed.
6. Confirm deployment success and that Azure lists `notificationScheduler`. Do not use the Azure root page's HTTP 200 as proof. Verify timer host storage access and inspect Application Insights for host/startup errors.

If migrations are needed for a later release, review committed SQL first, verify backup/restore capability, apply using the existing migration procedure, then deploy compatible web and worker packages. Do not generate new migrations or run schema push as a deployment shortcut. The recurrence release requires migrations through `0005`. No automatic production migration is included in the deployment workflow.

## Enable delivery and close the release gate

- Before enabling, review existing active reminders in the app: enabling the worker can process all eligible outstanding reminders for approved recipients. Do not run a separate local sending worker during this check.
- Change `AzureWebJobs.notificationScheduler.Disabled` to `false` and apply. The timer runs every minute (`0 * * * * *`, UTC); user deadlines still use stored time zones. No timezone override is needed.
- Use one clearly labeled synthetic reminder owned by your approved email. For a reminder due 20 minutes after creation, its three percentage notifications fall approximately 10, 15 and 18 minutes after creation. Do not expect an immediate email. Delayed polling can coalesce missed thresholds into the highest eligible threshold.
- Observe `notificationScheduler` invocations, safe delivery logs, persisted attempt/sent state in the app and actual inbox receipt. SMTP acceptance alone does not prove receipt. Confirm the linked reminder opens the Vercel production site.
- Set Vercel `EMAIL_DELIVERY_ENABLED=true` only after successful hosted delivery and redeploy the reviewed website, including the prepared security headers. Check email/password login, Google linking/new-user login, AI preview, manual create/edit, completion/deletion, and approved recipient eligibility.
- Verify a synthetic recurring reminder advances at its deadline and gets fresh schedules; completion must stop the whole series. Real weekly recurrence cannot be declared verified merely from package deployment.
- Install the PWA from HTTPS on a physical supported phone, open `/app`, verify logout/account switching and offline fallback. No private reminder data should become available from an offline cache.
- Stop/complete synthetic reminders after checking; preserve evidence without deleting real user data. Record the release commit, observed invocations and receipt confirmation in TODO. Keep unobserved checks pending.

## Operations and rollback

Configure Application Insights alerts for failed `notificationScheduler` invocations and timer silence, and database/queue monitoring for old due work, retry growth, terminal failures and stale claims. Read-only `npm run worker:check` inspects the database configured locally; it does not establish the health of Azure's credentials or timer. Configure Azure budgets/credit-expiry alerts and review compute, storage and log ingestion. A one-minute poll can keep Neon active; student credits and provider free allowances do not guarantee zero cost.

For a worker incident, set the Azure disabled setting to `true` first. It stops future timer invocations, but an in-flight SMTP send may still complete. Inspect sanitized logs and notification history before replaying anything; SMTP can accept mail before persistence fails. Never blindly reset sent/uncertain rows to pending. Redeploy a known compatible release commit using the manual workflow. Vercel supports redeploying a compatible prior web release. Code rollback does not reverse database migrations; retain additive schema compatibility and use a reviewed forward fix or tested restore procedure for database recovery.

Rotate SMTP credentials in Azure, Gemini/Google/auth credentials in Vercel, and database credentials in both runtimes when needed. Auth-secret rotation invalidates sessions. Preserve platform storage identity permissions during changes. See [worker recovery](./worker.md), [email limitations](./email.md), [migrations](../migrations/README.md) and [pre-deployment audit](./pre-deployment-audit.md).

References: [Azure environment settings](https://learn.microsoft.com/en-us/azure/azure-functions/functions-app-settings), [portal/GitHub OIDC setup](https://learn.microsoft.com/en-us/azure/azure-functions/functions-how-to-github-actions), [deployment action](https://github.com/Azure/functions-action), [Flex hosting](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-plan).
