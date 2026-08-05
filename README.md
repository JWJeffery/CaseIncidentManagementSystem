# FGSD Public Safety Records Management System

Monorepo for the unified FGSD Public Safety RMS. Formerly three separate
repos/prototypes (this repo, `Reunification`, and the parking/citation
module which doesn't exist yet) — consolidated here because the whole point
of the project is one coherent system sharing one Person/Incident/records-
classification model, not three tools that happen to be adjacent.

See the working design doc (`FGSD_PublicSafety_RMS_DataModel_Draft.md`,
shared separately with the District Safety Coordinator) for the full
architecture, entity list, legal/FERPA/LEU classification rules, and
identifier numbering scheme. This README covers repo structure only.

## Structure

```
packages/
  shared/            @fgsd/shared — Person/Incident numbering, records
                     classification, board-authority feature flags.
                     Node/CommonJS. Consumed by case-management directly;
                     see "Open question" below re: browser-side sharing.
  case-management/   Express + sql.js backend, port 3000. Case → Persons →
                     Notes → Violations → Documents. Formerly the
                     standalone CaseIncidentManagementSystem repo.
  reunification/     Client-side reunification card workflow (claimant
                     entry → SIS match/approval → reunifier handoff →
                     release). Formerly the standalone Reunification repo.
                     No backend — static files served via Python, port 8000.
  parking/           Express + sql.js backend, port 3001. Vehicle permits
                     (school-year auto-expiring), Citations (Administrative
                     live, Court board-gated), Towing (board-gated), DMV2U
                     query log, reporting.
  identity/          Express + sql.js backend, port 3002. Person / Vehicle /
                     Location master files, NCIC/LEDS-inspired structure.
                     parking's Vehicle references are wired to this
                     service (Phase 2, done); case-management is not wired
                     to it yet.
  console/           Express server, port 3003. Main launcher — a page
                     listing every module above with live up/down status
                     and a link to open it. Intentionally minimal for now;
                     will grow into a real dashboard later.
```

## Running things

```bash
npm install                    # installs all workspaces

npm run console                # starts the main launcher (start here)

npm run case-management        # starts the case-management Express server
npm run case-management:seed   # seeds case-management demo data

npm run reunification          # starts reunification's static file server
npm run reunification:test     # runs reunification's test suite

npm run identity:seed          # seeds identity demo data — do this FIRST
npm run identity               # starts the identity Express server

npm run parking:seed           # seeds parking demo data — requires identity
                                # to already be seeded and running (see below)
npm run parking                # starts the parking Express server
npm run parking:test           # runs parking's test suites
```

**Startup order matters as of the identity service wiring**: `parking`
now creates and looks up vehicle data through `identity`'s API rather
than a local table, so `identity` needs to be seeded and running before
`parking` is seeded or used. Recommended order: `identity:seed` →
`identity` (leave running) → `parking:seed` → `parking`.


## Open architectural question — flagging, not deciding silently

`packages/reunification` currently has **no build step**: `index.html`
loads `src/main.js` directly as a browser ES module via
`python3 -m http.server`. `packages/shared` is plain Node CommonJS.

That means `@fgsd/shared` is directly usable from `case-management`'s
Express backend and from reunification's **Node-run tests**, but **not**
from reunification's browser-side code as it exists today — browsers can't
resolve a bare `@fgsd/shared` import without either a bundler (esbuild,
Vite, etc.) or shared code published as a plain browser-loadable ES module
file.

This needs an explicit decision before shared entities (Person, Incident,
Field Contact, etc.) actually get used in Reunification's live UI, not
just its tests. Reasonable options, not yet chosen:

1. Add a lightweight bundler to `packages/reunification` (biggest change,
   most standard long-term).
2. Publish `@fgsd/shared`'s browser-relevant exports as a second,
   dependency-free ESM file the browser can load directly (no bundler,
   but two versions of the same logic to keep in sync).
3. Keep Reunification's browser code independent of `@fgsd/shared` for now
   and only share code at the API layer once Reunification gets a real
   backend (which the design doc's data model implies it will eventually
   need anyway, for concurrent multi-station live use during an event).

## Board-gated features

`packages/shared/src/featureFlags.js` gates any feature dependent on
proposed Board Policy ECD (court-track citations, towing). These are **not
board-approved**. They may be built, but must ship disabled by default.
See that file's header comment before touching the flags.
