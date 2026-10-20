# App design and PWA

Phase 7 gives RemindMe a cohesive ivory/ink/coral interface with self-hosted DM Sans body typography, editorial serif headings, a desktop sidebar and mobile bottom navigation. The same design covers landing, sign-in/registration, active/completed reminders, capture/clarification/confirmation, editing, schedules and settings. Decorative illustrations and icons are local SVG/CSS; no third-party image/font requests or client secrets are required. DM Sans ships with its Open Font License in `src/app/fonts/OFL.txt`.

Dashboard counts are real owner-scoped database aggregates, not sample statistics. Search and All/Today/Upcoming/Overdue filtering run on the server across the owner's data before pagination. Search treats `%`, `_` and backslash literally. Today/upcoming boundaries use the persisted profile IANA zone and calendar-day arithmetic, including DST. Each reminder still displays its stored interpretation zone; viewing preferences do not change existing deadlines.

Natural-language entry retains the original text and explicit review/save step. Clarification and review receive keyboard focus when ready. Manual creation remains available without Gemini. Saving disables the form, and a successfully created reminder stays disabled during navigation to prevent another click creating a duplicate. Status actions retain the existing optimistic-revision and cancellation protections. Loading, empty/search-empty, provider errors, validation, conflicts and offline states use the same visual language.

Expired-session responses offer sign-in in a separate tab, preserving the current draft in memory while the user authenticates again. Editing the source text discards the previous AI confirmation so stale extracted details cannot be saved against a changed transcription. Before-date interpretation is explained on the review screen; see [AI interpretation rules](./ai.md).

The recurrence amendment retains this design and adds repeat controls/labels only. Saved details now open read-only; Edit reminder explicitly opens the editor and successful saving closes it. See [repeat scheduling and completion behavior](./recurrence.md).

## Installation

The App Router manifest is `/manifest.webmanifest`: name/short name, `start_url: /app`, standalone display, scope `/`, matching theme/background colors, and PNG 192/512 icons plus a full-bleed 512 maskable icon. Apple touch metadata and a 180-pixel icon are included. The brand's SVG is the source for the raster assets.

Settings contains **Install RemindMe**. When the browser supplies an install prompt, it opens only on a user click. Other browsers receive useful installation guidance: on iOS/iPadOS, Safari → Share → Add to Home Screen; elsewhere, use the browser's install option. Installation needs HTTPS in deployment or a browser-trusted localhost origin. Support and native dialogs vary by device/browser.

The service worker registers in production. The isolated browser-test server explicitly enables it too; ordinary `next dev` does not, avoiding a development worker becoming stale. To try the production PWA locally, run `npm run build`, then `npm start` (on an available port if the development server is running). Use HTTPS in deployment. Signed-out launch to `/app` goes through the normal authentication redirect.

## Offline privacy

`public/sw.js` precaches an exact allowlist: `/offline.html` and four public PNG icons. It never caches application pages, sign-in pages, auth/API responses, React Server Component responses, reminder bodies, user data or arbitrary URLs. No account-specific content enters Cache Storage. Public Next.js assets may use the browser's normal HTTP caching, but the worker adds no runtime application/asset cache.

Navigation always goes to the network with `cache: no-store`. On network failure, it returns a generic self-contained offline page with no user content. Other API/mutation requests keep normal network behavior and cannot be falsely reported as saved. An already open page announces connection loss while keeping its current unsaved input in memory; it makes no promise of persistence after closing/reloading. There is no offline database, background synchronization, push subscription or offline editing queue.

Private `/app`, `/api`, login/register and access-denied routes receive no-store headers. The server still enforces sessions, admission and owner scoping independently of the UI/service worker. The browser journey verifies actual API no-store responses, signed-out launch and a second account in the same browser context.

## Updates

Public cache names are versioned (`remindme-public-v1`). Bump the version in `public/sw.js` when the cached public assets change. Activation deletes only old `remindme-public-*` caches, preserving unrelated same-origin caches. The worker script itself is served with `Cache-Control: no-store` and registers with `updateViaCache: none`.

A waiting worker shows **A fresh version is ready. Save your edits first.** It calls `skipWaiting` only after the explicit **Update app** action, then reloads that tab on controller change. It does not silently reload a partially edited form. Because all worker caches are public-only, sign-out and account switches need no private cache purge; no private cache exists to preserve or accidentally reintroduce.

## Verification and remaining device checks

The focused Chromium journey uses temporary accounts and the isolated test database. It creates real reminders, checks server search/overdue filtering, inspects desktop and 390-pixel mobile layouts for horizontal overflow, captures screenshots, visits capture/edit, checks manifest/icons and cache contents, verifies offline navigation returns generic HTML, signs out, relaunches `/app`, then verifies a second account sees none of the first account's reminders. Existing registration/settings and complete manual/AI-confirmation CRUD browser journeys remain covered. Public-cache/update checks verify exact precaching, obsolete-cache cleanup, network-only private traffic and explicit update activation.

Desktop/mobile screenshots are produced under the ignored Playwright `test-results` directory. Typography, contrast, readable form sizes, 44-pixel mobile action targets, reduced-motion preference, accessible labels, status announcements, skip navigation and review focus are implemented. A real screen-reader/keyboard audit and physical iOS/Android installation/upgrade checks still require hands-on device verification; automated mobile viewport checks do not establish native installation behavior.

Scheduled email delivery remains inactive until the separately prepared Azure worker is deployed. The UI reports this honestly. Vercel/HTTPS hosting and production installability verification remain Phase 8 work; this phase does not publish a site or provision Azure.
