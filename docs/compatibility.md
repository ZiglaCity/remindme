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
