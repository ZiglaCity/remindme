# Runtime and database compatibility

Checked October 18, 2026. Exact direct package versions belong in `package.json`; transitive resolutions belong in `package-lock.json`. Recheck support before deployment or major upgrades.

## Selected foundation

- Node.js 22 LTS across web and planned worker, npm 11.21.1 (selected after an npm 11.4.1 dependency resolver crash). Local Node is 22.13.1; CI resolves a current major-22 patch. Use an up-to-date patch in production.
- Next.js 16.4.2 App Router, React, strict TypeScript, Tailwind, ESLint 9, Prettier, Vitest 4.1.11, and Playwright. The initial Vitest 3 selection was replaced after audit findings; 4.1.11 supports the available Node 22 runtime.
- Drizzle with `pg` over PostgreSQL TCP in both Node runtimes. Use Neon pooled URLs for ordinary traffic and an optional direct migration URL. Keep provider TLS parameters; do not disable certificate verification.
- Planned Azure Functions runtime 4.x, Node programming model 4.x, Node 22. Adapter configuration and actual worker startup verification belong to Phase 6.
- Better Auth's documented Drizzle PostgreSQL adapter is selected for Phase 2. Pin/test its release then rather than installing unused auth/provider dependencies now.

## Official evidence

- [Node release schedule](https://nodejs.org/en/about/previous-releases): Node 22 LTS; review remaining support before production.
- [Next installation](https://nextjs.org/docs/app/getting-started/installation): Node 20.9 minimum, satisfied by Node 22.
- [Azure Node reference](https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-node) and [runtime support](https://learn.microsoft.com/en-us/azure/azure-functions/functions-versions): Node versions, model/runtime distinctions, and plan constraints. Recheck student-subscription availability before provisioning.
- [Better Auth installation](https://better-auth.com/docs/installation): documented Next.js handlers and Drizzle PostgreSQL adapter.
- [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql) and [Neon](https://orm.drizzle.team/docs/connect-neon): node-postgres integration including Neon TCP.
- [node-postgres transactions](https://node-postgres.com/features/transactions): transaction statements must use the same checked-out client, not unrelated pool queries.

## Verification limits

The integration test checks rollback and concurrent `FOR UPDATE SKIP LOCKED` against `TEST_DATABASE_URL`. It fails explicitly when no isolated test database is configured. Local PostgreSQL testing does not establish live Neon connectivity from Vercel/Azure.

No product migration is needed until the auth schema exists. Migration commands/configuration are prepared now; first schema generation/application is a Phase 2 gate. Actual Azure startup remains a Phase 6 gate.

## Tooling adjustments

The host npm 11.4.1 crashed in Arborist peer resolution while updating Vitest. npm 11.21.1 resolved the same update successfully via a workspace-cached invocation; the host installation was not changed. Use npm 11.21.1 for reproducible installation.

ESLint 9 is retained for the selected Next.js plugin ecosystem compatibility, although npm reports that line as unsupported. Review lint tooling before production. Remaining audit findings in Next lint glob dependencies and Drizzle Kit tooling have no safe nonbreaking upstream fix in the selected stable releases; do not downgrade Next or Drizzle based on audit --force suggestions. The final `npm audit --omit=dev` reports zero production vulnerabilities. The full audit reports nine development-tool findings (four moderate, five high), with no critical findings after the Vitest update. Recheck both reports before release. Installed React, JSX accessibility, and import ESLint plugins declare ESLint peers through major 9, so forcing ESLint 10 would bypass their compatibility contracts.

## Phase 2 dependency verification — October 18, 2026

Better Auth and its standalone Drizzle adapter are pinned to 1.7.10. Installed peer ranges accept Next 16, Drizzle 0.45.4, and pg 8; application type checks and the real PostgreSQL auth tests verify this selected combination.

The full audit still reports the nine existing tooling findings (four moderate, five high). After installing Better Auth, `npm audit --omit=dev` includes the four moderate Drizzle Kit/esbuild findings because Better Auth declares Drizzle Kit as an optional peer. This changes the audit classification from Phase 1's zero-production report; it is not a new auth vulnerability. The inspected production auth route trace contains zero Drizzle Kit files. This does not eliminate the advisory in the installed migration tool; review it again before deployment, and do not expose migration/development servers publicly or force a breaking downgrade to an obsolete kit release.

## Phase 3 time handling — October 18, 2026

Pinned @js-temporal/polyfill 0.5.1 for explicit IANA time-zone/DST disambiguation on Node 22. Server conversion, fixed-clock unit tests, PostgreSQL transactions, and the production build are verified. The dependency installation reports the same nine previously documented tooling advisories; no forced dependency downgrade was applied. Browser tests use a separate Next.js output directory to coexist with a developer server.

## Phase 4 Gemini — October 18, 2026

Pinned the official @google/genai SDK 2.30.0 with server-configured `gemini-3.8-flash`. Live structured parsing and clarification passed using the configured key on Node 22.13.1. SDK retries are explicitly disabled and requests have a 25-second deadline. Installation reports the same nine existing tooling advisories.

## Phase 5 SMTP — October 19, 2026

Pinned Nodemailer 10.1.6, which supports Node >=20 and bundles TypeScript definitions. Verified on the selected Node 22 runtime. SMTP authentication/TLS verification, unit checks, PostgreSQL delivery integration checks and the application production build pass. The package installation reports the same nine existing tooling advisories. Delivery code has no Next.js runtime dependency and is ready for the separate Phase 6 adapter.

## Phase 6 worker — October 19, 2026

Selected Azure Functions programming model v4 / runtime v4 / Node 22 from current Microsoft documentation. Pinned SDK 4.16.5 and build-only esbuild 0.28.2. The independent artifact bundles shared runtime code and has its own minimal SDK lockfile; locked production installation and plain Node 22 loading passed. The loader correctly warns that it is outside a Functions host, so this establishes package loading rather than a real timer startup. Root dependency installation reports the same nine tooling findings; the minimal worker SDK installation reports zero. No Azure subscription, Core Tools host or deployed runtime was verified; deployment is explicitly deferred.
