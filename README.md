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
  case-management/   Express + sql.js backend. Case → Persons → Notes →
                     Violations → Documents. Formerly the standalone
                     CaseIncidentManagementSystem repo.
  reunification/     Client-side reunification card workflow (claimant
                     entry → SIS match/approval → reunifier handoff →
                     release). Formerly the standalone Reunification repo.
                     No backend currently — static files served directly.
```

## Running things

```bash
npm install                    # installs all three workspaces
npm run case-management        # starts the case-management Express server
npm run case-management:seed   # seeds case-management demo data
npm run reunification          # starts reunification's static file server
npm run reunification:test     # runs reunification's test suite
```

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
