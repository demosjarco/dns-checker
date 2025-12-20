# AI Agent Guide

## Repo Map (Qwik on Cloudflare Workers/Pages)

- Entrypoints: worker [src/entry.cloudflare-workers.ts](src/entry.cloudflare-workers.ts) proxies to built Pages bundle [src/entry.cloudflare-pages.tsx](src/entry.cloudflare-pages.tsx) rendered via SSR [src/entry.ssr.tsx](src/entry.ssr.tsx). Dev-only client entry [src/entry.dev.tsx](src/entry.dev.tsx); preview/server entries in `src/entry.preview.tsx` and `src/entry.ssr.tsx`.
- Root shell: [src/root.tsx](src/root.tsx) with `QwikCityProvider`, manifest only when !dev.
- Routes: layout/loaders in [src/routes/layout.tsx](src/routes/layout.tsx); page shell in [src/routes/index.tsx](src/routes/index.tsx); CSP plugin in [src/routes/plugin@csp.ts](src/routes/plugin@csp.ts).
- UI pieces: record form [src/components/record-search.tsx](src/components/record-search.tsx); instances list [src/components/instance-table.tsx](src/components/instance-table.tsx); map [src/components/map.tsx](src/components/map.tsx); head [src/components/router-head.tsx](src/components/router-head.tsx).
- Data/infra: Drizzle schema [db/index.ts](db/index.ts); DO [do/locationTester.mts](do/locationTester.mts); helpers [db/extras.ts](db/extras.ts); types/env [src/types.ts](src/types.ts).

## Running & Builds

- Dev SSR: `npm run dev` (Vite SSR with inspector). Starts app on port 5173 and Chrome-DevTools inspector on 9229—verify those ports aren’t already in use (some devs keep the server running outside the IDE). SSR start: `npm run start`. Wrangler dev with scheduled: `npm run serve`.
- Agent automation: first check whether the dev server is already live (prefer the built-in port/proc check; fallback to opening the site in a browser with DevTools to see if it responds). If it isn’t running, offer to start `npm run dev` (or the appropriate task) before asking the user for anything else.
- Builds: `npm run build` (Qwik prod), `npm run build:preview` (SSR bundle), `npm run build:server` (Cloudflare Pages server bundle), `npm run preview`/`preview:lhci` to serve built app, `npm run build:types` (wrangler types + tsc noEmit), `npm run clean`/`preclean` for artifacts.
- Migrations: `npm run build:db` (drizzle-kit), `npm run deploy:db` (wrangler d1 migrations apply PROBE_DB --remote). Format via `npm run postbuild:db`.

## Cloudflare Specifics

- Bindings: `PROBE_DB` (D1), `LOCATION_TESTER` (DO namespace), `CF_API_TOKEN`, `CF_ACCOUNT_ID`, optional `GIT_HASH`, `SQL_TTL` (cache TTL). Constant `PROBE_DB_D1_ID` reused across components.
- Worker `fetch` hands off to asset bundle; logic lives in loaders/components. Wrangler flags: `nodejs_compat`, `global_fetch_strictly_public`, `enable_request_signal`, `request_signal_passthrough`; cron hourly (`0 * * * *`); assets bound as `ASSET` dir `dist`.
- CSP: [src/routes/plugin@csp.ts](src/routes/plugin@csp.ts) sets nonce in `sharedMap` (@nonce); allows self/data/blob, OSM tiles, inline styles, nonce’d scripts; disabled in dev/localhost.

## Database (D1 + Drizzle)

- Tables in [db/index.ts](db/index.ts).
- Logging helper: [db/extras.ts](db/extras.ts) `DebugLogWriter` for Drizzle logger.
- Access pattern: loaders use `drizzle(platform.env.PROBE_DB.withSession())` with `SQLCache` (TTL from `SQL_TTL`) and snake_case casing; stored via `noSerialize` in loader for Qwik.

## Durable Object & Cron

- DO `LocationTester` [do/locationTester.mts](do/locationTester.mts): On alarm (every GMT midnight) it self-verifies location; nukes itself and deletes DB row if moved or missing.
- Scheduled sync [src/entry.cloudflare-workers.ts](src/entry.cloudflare-workers.ts): hourly reconcile DO colos vs D1 `instances`. Deletes stale DOs (nuke + D1 delete) and spawns new ones for missing IATA using Cloudflare LB regions + `iata-location` data. Creation attempts capped (~900 usable requests; attempts computed per missing IATA). Successful spawn locks colo via storage and inserts row; failures nuke DO.

## Frontend

- Qwik SSR entry points are under `src/entry.*.tsx`; root layout/theme is in `src/root.tsx`. Follow existing component organization under `src/components/`.
- Prefer `routeLoader$` for data that is read-only in the UX (dropdown filters, etc.); use `server$` when mutating or when a loader cannot be used.
- In `routeLoader$`, use `resolveValue()` to consume other loaders’ cached values to avoid re-running loader code across component chains (not available in `server$`).
- For faster TTFB, a `routeLoader$` can return a function that returns the data so the rest of the page can render while the value resolves; use for long-running tasks.
- All server-side contexts (routeLoader$, routeAction$, routeHandler$, server$, etc.) can access Cloudflare bindings. Prefer `routeLoader$` when the data shape is fixed for the page (better caching). Use `server$` when the UX lets users change what loads (search, date filters, etc.).
- Qwik runs everything inside each `layout.tsx` on every nested route/component beneath it—good for auth/guards but can spam network/DB calls if heavy logic lives there.
- Qwik supports named layouts: define `layout-<name>.tsx` alongside the default layout and opt a route into it by suffixing the route file with `@<name>` (e.g., `layout-narrow.tsx` + `index@narrow.tsx`).
- Loader caching pattern: a `routeLoader$` runs once and `resolveValue()`/`useLoader()` calls reuse that cached value across nested layouts/components (e.g., shared `useServerTimeLoader` consumed in root layout, child layout, and footer).
- Map [src/components/map.tsx](src/components/map.tsx): Leaflet in `useVisibleTask$`; custom CF pin `/images/cf-pin.svg`; refits bounds when data/size changes but respects user zoom.

## UX Verification

- For any UI/UX change, open the running app with the `chrome-devtools` browser tools and continuously inspect the UI (desktop and mobile) as you work; do not rely solely on code review.
- Validate that new visuals do not regress existing screens: check for clipping/overflow, misalignment, scroll/resize behavior, and interactive affordances (hover/focus/active states, keyboard nav where applicable).
- After implementing changes, re-run a quick pass in `chrome-devtools` to ensure previous layouts and flows still render and behave as before; capture before/after screenshots if a comparison is needed.

## Conventions & Risks

- TS ESM (`type`="module"), path aliases `~` and `~db`. Keep loader data shapes aligned across InstanceTable and Map (uppercase IATA, hex `doId`).
- CSP nonces available in `sharedMap`; ensure new assets/requests remain CSP-compliant (add domains if needed).
- Request caps: DO spawn loop assumes ~900 usable requests/hr; avoid extra per-IATA calls. Nuking is the failure path; don’t leave DOs orphaned in D1.
- Caching: layout sets `staleWhileRevalidate` 7d, `maxAge` 5s; Drizzle `SQLCache` keyed by D1 id—keep TTL in sync with env `SQL_TTL`.
- Map/instances: if loader errors, UI renders banner; propagate similar FailReturn patterns for new loaders.
