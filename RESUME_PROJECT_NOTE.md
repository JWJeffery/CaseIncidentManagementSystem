# Resume: FGSD Public Safety Records Management System

Paste this whole note at the start of a new conversation if Claude has lost context.

## What this is

Josh Jeffery (District Safety Coordinator, FGSD, josh@jwjeffery.org) is
consolidating three previously-separate school-safety prototypes — built
originally with a former collaborator, Lucy (dismissed) — into one coherent
Public Safety Records Management System. This is a distinct project from
the EOP/Annex/Protocol document suite (which has its own separate resume
note in Google Drive) and from the liturgical PrayerAppNew/Scriptorium
projects — do not conflate the three.

Scope has grown well beyond "connect three apps": Josh wants a real RMS on
the model of a mature CAD/police RMS system — Case Management, Reunification,
AAR (already deployed via Apps Script), Injury Reporting (replacing a
"garbage" legacy system), and a Parking/Citation/Towing module — all sharing
one Person/Incident/Case data model, with FERPA/LEU/records-classification
handled as a first-class architectural concern, not an afterthought.

## Repos (GitHub, user JWJeffery, 5-repo plan limit — currently at capacity)

- **CaseIncidentManagementSystem** — now the monorepo root. Public.
  - `packages/case-management/` — Express + sql.js backend, formerly
    standalone. Case → Persons → Notes → Violations → Documents. KGB policy
    library (26 seeded entries). Generates the Exclusion Notice form (see
    §4.5b of the design doc). **A real bug was found and fixed here**
    (2026-08-05): `POST /api/cases` was silently broken since it was
    written — see "Bugs found and fixed" below.
  - `packages/reunification/` — folded in from the (now-redundant)
    standalone Reunification repo. Client-side only, no backend yet.
    Claimant entry → SIS/Synergy match approval → reunifier handoff →
    release workflow. Real test suite (`npm run reunification:test`).
    Its dashboard (`dashboardItems` in `src/main.js`) was refined
    (2026-08-05) to cover the whole monorepo's status, not just
    Reunification — 41 items across 6 modules, grouped/collapsible.
    **Open question, unresolved:** browser code has no bundler, so
    `@fgsd/shared` (CommonJS) isn't importable from the live UI yet, only
    from Node-run tests. Needs a decision (bundler vs. duplicate
    browser-safe export vs. defer until Reunification gets a real backend).
  - `packages/identity/` (added 2026-08-05) — **Phase 1 of the identity
    cross-module work.** Standalone service, own database, own port
    (3002). Person/Vehicle/Location master files, NCIC/LEDS-inspired
    structure (lean canonical record + separate time-bound history
    records that reference it, rather than repeating identity data per
    module). No SSN collected — SIS ID covers both students and staff
    (Josh confirmed staff carry SIS IDs too). **Vehicle is plate-first,
    not VIN-first** — corrected same-day after Josh's direct pushback on
    the original VIN-anchored design ("VINs are long and cumbersome").
    Plate is required at vehicle creation; VIN is optional supplementary
    data. The underlying plate/ownership history model (separate
    time-bound records via `server/effectiveDating.js`, tested —
    `tests/effectiveDating.test.js`) is unchanged and still real — an old
    plate still resolves via lookup, it's just no longer the required/
    primary field. Location file seeded with the real 16-site FGSD
    building directory (some addresses intentionally left blank rather
    than guessed — see seed.js comment). Has a real, working, minimal UI,
    not API-only.

    **Phase 2 (vehicle wiring): DONE for `parking`, not started for
    `case-management`.** `parking`'s own `vehicles` table is now
    deprecated (left in db.js, unused). `routes/vehicles.js` is a proxy +
    flattener over Identity's API (`server/identityClient.js`, Node's
    built-in fetch, server-to-server — browser never calls Identity
    directly, no CORS question, parking's frontend URL contract unchanged).
    Response is flattened back to the flat shape the frontend already
    expected (plate/state/ownerName directly on the object), which is why
    the frontend needed almost no changes. New `vehicle_dmv_status` table
    holds the only vehicle data that's genuinely parking's own concern
    (selfReported/dmvVerified/enteredBy), keyed by Identity's vehicle id.
    `applications.js`'s approve() now creates the vehicle in Identity, not
    locally. `citations.js`'s print route fetches from Identity too (the
    one place outside vehicles.js that had touched the local table).
    `seed.js` now requires Identity to be seeded and running first — a
    real new operational sequencing requirement, checked up front with a
    clear error message rather than a confusing downstream failure.
    Person wiring (parking's `personId` fields, still free text) is
    NOT part of this — separate, later work, same as case-management's
    vehicle/person wiring. Decided: Phase 2 consumers should use live
    queries against this service, not local caches (the
    whole point collapses if each module keeps a stale copy) — the one
    exception under consideration is a short-lived, size-capped cache
    specifically for parking's Field Lookup, given its phone-in-a-lot,
    possibly-flaky-wifi use case.
  - `packages/parking/` (added 2026-08-05) — Vehicle, Parking Permit,
    Violation Code Library (13 entries seeded from proposed Board Policy
    ECD §4(A)-(M)), Citation (two-track: Administrative enabled today,
    Court board-gated), Tow (entire subsystem board-gated), DMV Query Log
    (fields sourced from District DMV2U Protocol 010 §8). Has a working
    UI (`public/js/app.js`, tabbed single-page app). Runs on port 3001
    (`npm run parking` / `npm run parking:seed`) so it can run alongside
    case-management (port 3000) without collision. Vehicle/Permit fields
    match Board Policy JHFD's requirements (driver's license, current
    registration, insurance/financial responsibility) plus real
    campus-parking-system practice (permitType, parkingZone).
    Same-day addition: **self-registration + staff-review workflow**
    (`permit_applications` table / `routes/applications.js`, mirrors
    Reunification's claimant-entry-then-staff-approval pattern) and a
    **mobile field-lookup + quick-citation flow** (`GET
    /api/vehicles/lookup`, matches plate or permit number in one round
    trip; the "Field Lookup" tab is now the default tab on load, since
    it's the primary field-use case for a student supervisor on a phone).
    **Document upload (license/insurance photos) is now a labeled
    PROTOTYPE** — see below, not glossed over as production-ready.
    Same-day addition (2026-08-05, later): **Staff/Officer roster**
    (`staff` table, `routes/staff.js`) replaces every free-text "who did
    this" field with a real, validated reference — Citation's
    enforcementOfficerId, Permit's new issuedBy, Vehicle's new optional
    enteredBy, PermitApplication's reviewedBy (which now propagates into
    the resulting Permit's issuedBy on approval). Deactivating a staff
    member immediately blocks them from being used for new actions. New
    "Staff" tab in the UI; a `staffOptions()`/`staffName()` helper drives
    every dropdown that used to be free text.
  - `packages/console/` (added 2026-08-05) — main launcher, port 3003.
    Intentionally minimal for now: a page listing all four modules with
    live up/down status (checked server-side, parallel, 1.5s timeout each)
    and a link to open each one. Josh's explicit direction: this will grow
    into a real dashboard later — don't over-build it now. Module registry
    lives in `server/modules.js` (single source of truth — the frontend
    renders from `GET /api/modules`, nothing is hardcoded twice).
    **Bug fixed 2026-08-06**: "Open" links produced ERR_CONNECTION_REFUSED
    in GitHub Codespaces specifically (caught from Josh's own screenshots)
    — the console conflated two different needs (server-side reachability
    vs. browser-facing navigation) into one hardcoded `localhost:PORT`
    value. Codespaces forwards ports via subdomain
    (`name-PORT.app.github.dev`), not a real `:PORT` on localhost, so that
    URL only ever worked for local dev. Fixed by computing the Open URL
    client-side from `window.location` at render time instead of trusting
    a server-provided baseUrl; the server-side status check still
    (correctly) uses localhost, since that check runs inside the same
    container as the other servers regardless of how the browser reaches
    the console itself.
    **Separate environment issue found the same session, NOT a code bug —
    a GitHub Codespaces setting**: even after the URL fix above, Josh hit
    "Failed to load: Failed to fetch" on Parking's own tabs (Vehicles,
    Permits, etc.), with the browser console showing every `/api/*`
    fetch redirected to `github.dev/pf-signin?...` and blocked by CORS
    ("Redirect is not allowed for a preflight request"). Root cause:
    Codespaces ports default to **Private** visibility, which requires an
    interactive GitHub sign-in redirect before the port responds — fine
    for a full page navigation (the browser can follow the redirect), but
    a `fetch()` call can't follow a cross-origin auth redirect, so it
    fails as a CORS error instead. **Fix: in the Codespace's VS Code Ports
    tab, right-click each port in use (3000, 3001, 3002, 3003, and 8000 if
    running Reunification) → Port Visibility → Public.** Confirmed working
    after Josh set this — Parking's tabs loaded and worked normally.
    **This will need to be redone on every fresh Codespace** (new
    Codespace = ports default back to Private) — worth checking this
    FIRST if a future session reports "Failed to fetch" / blank data
    anywhere, before assuming it's a new code bug.
  - `packages/shared/` (`@fgsd/shared`) — Incident Number (lifetime
    sequence, `FGSD-#######`) / Case Number (annual reset,
    `FGSD-YYYY-#####`) formatting; records classification enum + disclosure
    log helper; board-authority feature flags (`ECD_COURT_CITATIONS_ENABLED`,
    `ECD_TOWING_ENABLED`) — **both hardcoded `false`, must stay that way
    until Josh confirms actual school board adoption of proposed Board
    Policy ECD.** Do not flip these without explicit confirmation. Both
    flags are verified (real HTTP 403 tests, not just code review) to
    actually block Court-track citation creation and all Tow writes.
  - Root `npm install` sets up all five workspaces.
    `npm run case-management` / `case-management:seed` /
    `case-management:test` / `reunification` / `reunification:test` /
    `parking` / `parking:seed` / `parking:test` / `identity` /
    `identity:seed` / `identity:test`. (`case-management:test` is new as of
    2026-08-06 — case-management's first test script, covering the
    exclusion computation logic.)
  - **Standalone Reunification repo is now redundant** — Josh can delete
    it to free a repo slot; its content is fully preserved in
    `packages/reunification/` here.
- **Reunification** (standalone) — superseded by the monorepo. Slated for
  deletion by Josh once he's confirmed the monorepo push is good.
- **PrayerAppNew**, **Scriptorium**, **LOTH** — unrelated projects, not
  part of this workstream. (LOTH = Liturgy of the Hours, a liturgical
  project, not a school-safety dashboard as once assumed mid-session —
  corrected same day.)

## Cross-module Exclusion check — DONE (2026-08-06)

The first real PAYOFF of the shared Person store, and the answer to the
finish-checklist's own example ("an Exclusion check at citation time").
An officer writing a parking citation, or doing a field plate lookup, is
now warned when the person involved is CURRENTLY excluded from all
district property. This was the chosen "shared person store linkage"
slice — the record→Identity-Person linkage plumbing was already done
(see §4 below); this builds the cross-module feature that plumbing exists
for.

Deliberately reused the existing server-to-server, single-origin pattern
(no new browser cross-calls, no CORS):

- **Exclusions are DERIVED, not a new first-class entity.** A person is
  excluded when they are the SUBJECT (`case_persons.role`) of a case that
  is dispositioned `Exclusion` (or carries a violation whose
  `recommendedAction` is an exclusion), made effective by a served Notice
  of Exclusion. No new `exclusions` table was added.
- **`packages/case-management/server/exclusions.js`** — pure, DB-free
  logic: parse a free-text `exclusionLength` ("1 year"/"90 days"/
  "permanent"/"N/A"), compute active/expired/indefinite against a served/
  effective date, assemble per-person records. Unit-tested
  (`tests/exclusions.test.js`, run via `npm run case-management:test`).
  DB access lives in the route; this file never touches the db — same
  pure-logic/DB split parking uses for permitExpiration.js/towWorkflow.js.
  **SAFETY DIRECTION:** ambiguous data (an unparseable length, an
  Exclusion disposition with no length-bearing violation) FLAGS the person
  as excluded rather than silently clearing them — a false "still
  excluded" that a human then verifies beats a false "all clear" for a
  field safety check.
- **`routes/exclusions.js`** — `GET /api/exclusions?personId=` (single)
  and `?personIds=a,b,c` (batch map). Gathers rows, delegates all judgment
  to the pure module. Fully synchronous (sql.js) → no async-rejection
  risk. Mounted in index.js.
- **`documents` table gained `subjectPersonId` + `issuedDate`** (nullable,
  with an ALTER-TABLE migration block — case-management's db.js had none
  before — for existing persisted DBs) so a served exclusion notice ties
  EXACTLY to the Identity Person it excluded and to the date its window
  runs from. `generate-exclusion` now persists both; legacy/seed rows
  without them fall back to the case's subjects / case dates.
- **`@fgsd/shared/src/caseManagementClient.js`** (`caseManagementFetch`,
  base URL `CASE_MANAGEMENT_SERVICE_URL` || `http://localhost:3000`) — the
  mirror of identityClient, exported from `@fgsd/shared`, so parking's
  backend queries case-management server-to-server.
- **parking `routes/exclusionChecks.js`** — thin proxy + a shared
  `checkExclusions()` helper other parking routes reuse. **SOFT-FAILS BY
  DESIGN:** if case-management is unreachable it returns 200 with
  `{ available:false }`, NOT an error — an officer must always be able to
  write a citation. Wired into `GET /api/vehicles/lookup` (checks the
  resolved vehicle's registered OWNER's Identity id — the field's real
  question when a plate comes back to a person) and into the citation POST
  response (an advisory when a person was linked). Both non-blocking.
- **Frontend** (`parking/public/js/app.js`): a shared
  `renderExclusionAlert()` — loud red alert for an active exclusion (with
  case #, expiry date, ORS 164.245 Criminal Trespass II note), amber
  "check unavailable" when CMS is down, small confirmation when clear.
  Embedded in the shared person-link widget (so it shows on Citations,
  direct Permit issuance, AND Application approval — a live check fires the
  moment a person is linked) and at the top of the Field Lookup result
  (plus an "EXCLUDED" chip on the owner row).

Seed demo states (all three verifiable live): **Simmons = ACTIVE** (a new
2026 case `FGSD-2026-0004` with a served notice, 1yr → expires
2027-05-22), **Castillo = EXPIRED** (the original 2024 1yr exclusion, now
lapsed — proves the expiry math), **Nguyen = cease-and-desist** (not an
exclusion at all — proves filtering). A demo Identity vehicle (plate
**EXCL123**, owned by Simmons) makes the parking plate-lookup →
owner-excluded path demonstrable end to end. All verified against the
three running servers via real HTTP AND a headless-browser drive of the
actual parking UI — including the soft-fail path with case-management
stopped — not just code review.

**NOT built (deliberate follow-ons, not regressions):** exclusion status
isn't surfaced inside case-management's OWN UI yet (only its API); there's
no unified cross-module "person dossier" yet (this exclusion check is the
first slice of that); reunification isn't wired (still blocked on its
browser-bundler question, below).

## The design doc

A working markdown doc (delivered as a file, not committed to any repo)
covers the full architecture: entity list (Person, Import, Incident, Field
Contact, Case, Referral, Exclusion, Injury Report, Reunification Session,
AAR Submission, Vehicle, Parking Permit, Citation, Tow, Violation Code
Library, DMV Query Log), the three-tier identifier scheme, LEU/FERPA/ORS
classification rules, and the ECD-derived Citation/Tow specifics. Josh has
this file locally — if a new session needs the full doc content and it
isn't in context, ask Josh to re-upload it rather than reconstructing it
from memory.

## Legal/compliance foundation (settled, don't re-litigate)

- Josh is DSC and his role is explicitly "maintain the physical security
  and safety of the agency or institution" — this satisfies the
  OAR 581-021-0225(1)(b) / 34 CFR 99.8(a)(1)(ii) LEU authorization
  requirement. No separate FERPA-specific designation action needed.
- Case Management operates as a safety/security investigation function
  (LEU by default), not the district's disciplinary process. A disciplinary
  hand-off becomes a separate `Referral` record, building-owned, Education
  Record classification — not a reclassification of the Case file.
- LEU record status requires genuine storage/access separation from
  education records, not just a classification tag (OAR 581-021-0225(4)(a)).
- Citation is two-track: **Administrative** (Education Record; per ECD
  §5(A), limited to students/district personnel with a registered vehicle
  — narrower than JHFD's broader permit language; **this discrepancy
  between ECD and JHFD is flagged, unresolved, Josh's call**) vs. **Court**
  (LEU → Court Record once filed under ORS 153.045 with Forest Grove
  Municipal or Beaverton Justice Court).
- DMV Query Log fields are sourced directly from District DMV2U Record
  Inquiry Account Protocol (Protocol 010) §8 — not invented. 5-year
  retention is a legal minimum.
- Proposed Board Policy ECD (traffic/parking enforcement authority,
  towing) is **NOT board-approved**. Court-track Citation and the entire
  Tow subsystem may be designed and built, but must ship feature-gated,
  disabled by default (see `@fgsd/shared` feature flags above). Building
  is not authorization to enable.
- **Person-linkage policy (settled 2026-08-06):** a citation's or case's
  `personId` never has to resolve to a real Identity Service Person
  record, and no module may silently auto-create a placeholder Identity
  Person just to have something to point at. Real-world reasoning: an
  officer has to be able to write a citation for a first-time contact or
  a visitor immediately, and forcing "must resolve to Identity" would
  either block a legitimate citation or pressure sloppy on-the-spot
  Person creation — three different officers each typing "John Doe" on
  three different stops becomes three unlinked half-populated Person
  records, which defeats the entire point of a master file. Linking to
  an existing Identity Person (search-and-link) or creating a genuinely
  new one (a real Add Person flow with real fields) is always a
  deliberate staff action, never a side effect of submitting a citation
  or case. This is also the actual posture real records systems (NCIC/
  LEDS) take — contact records get written regardless; matching to a
  master record happens deliberately, not automatically. This was the
  explicit blocker noted before Person wiring (`parking`'s `personId`
  fields, `case-management`'s person references) could start; it's
  resolved now, so that work is unblocked whenever it's prioritized. No
  new Identity schema needed for this — `GET /api/persons?search=`
  already supports the "check for a match first" step every consumer
  will need.

## A mistake made and corrected this session — for awareness, not repetition

While restructuring CaseIncidentManagementSystem into the monorepo, a
`cp -r .../Reunification/.git .` command (meant to copy Reunification's
working files) accidentally overwrote CaseIncidentManagementSystem's own
`.git` directory with Reunification's, silently pointing the repo at the
wrong remote/history. Caught before anything was committed or pushed — the
fix was discarding that working copy and redoing the restructure from a
fresh `git clone` of the correct repo. Lesson: never `cp -r` a `.git`
directory when copying files between two different repos' working trees —
copy specific subdirectories/files instead, exactly as the corrected
version did.

## Bugs found and fixed (2026-08-05) — read before writing new SQL

`packages/case-management/server/db.js`'s `normaliseParams()` binds named
params as `$fieldName`. If a route's SQL uses `@fieldName` instead,
`sql.js` silently fails to bind it — this is not a loud error, it just
means the parameter never gets set, so `NOT NULL` columns throw on insert
and nullable columns end up `NULL`. **Always use `$fieldName` in SQL,
matching the seed.js files (which were already correct) and `Stmt`'s
actual convention.** This broke `case-management`'s real `POST /api/cases`
route since it was originally written — demo data via seed.js looked fine
because seed.js happened to use the correct syntax; the live API route did
not. All 5 new parking routes had the same bug when first written (copied
the broken pattern before it was caught) — fixed in the same pass.
Verified via real HTTP requests against running servers, not just code
review. `persons.js`, `notes.js`, `violations.js`, `documents.js` in
case-management were already using safe positional `?` params and were
never affected.

Separately: an `async` Express route handler with no try/catch let a
thrown DB error become an unhandled promise rejection, which crashes the
entire Node process under Node 22 (not just the one request). Fixed in
`parking/server/routes/citations.js`; added a global error-handling
middleware + `unhandledRejection` listener in `parking/server/index.js` as
a safety net. Worth auditing `case-management`'s routes for the same
`async`-without-try/catch pattern if any get added later — none currently
exist there (all synchronous), which is why this specific failure mode
hadn't surfaced there yet.

Separately: **`INSERT OR IGNORE` provides zero deduplication when `id` is
a freshly generated UUID.** `IGNORE` only suppresses a PRIMARY KEY
collision — a new random UUID never collides with an existing row, so
every seed-script insert "succeeds" as a brand-new row even on a second
run. This silently doubled (tripled, on a third run) every location and
demo person in `packages/identity/server/seed.js`, caught from Josh's own
screenshots showing Locations (32) instead of 16. **Every seed script
needs a real check-first pattern against an actual natural key** (name,
VIN, a deliberate natural key like `synergyImportId`) before inserting,
not just `INSERT OR IGNORE` on a table whose primary key is a UUID
generated fresh every run. Parking's seed.js already had this right for
vehicle creation (fixed earlier the same session, before this one was
caught) — the fix wasn't applied consistently to identity's own seed.js
at the time it was written, which is exactly how this slipped through.
Fixed for real everywhere in that file now; verified by running the seed
script three times in a row and confirming exact row counts via the live
API, not just reading the console output. **Anyone with existing
duplicate data from before this fix needs to manually delete
`packages/identity/data/` and re-seed** — the fix prevents new
duplicates, it doesn't retroactively clean up old ones.

**One more instance of the SAME bug, caught and fixed 2026-08-06 during
the exclusion-check work:** `packages/case-management/server/seed.js`'s
`notes` and `violations` inserts still used `INSERT OR IGNORE ... VALUES
($id=uuidv4() ...)`. Only `case_persons` had been converted to check-first
during Person wiring; notes/violations were missed, so re-running the
case-management seed silently duplicated every note and violation. Fixed
by adding check-first helpers (`addNoteOnce` keyed on `(caseId, body)`,
`addViolationOnce` on `(caseId, citation)`, `addExclusionNoticeOnce` on
`(caseId, subjectPersonId)`) and routing all inserts through them.
Verified idempotent by running `npm run case-management:seed` three times
and confirming stable counts (4 cases, 1 violation on the new case, 1
EXCL123 vehicle in Identity) via the live API. Demo `cases` were already
safe — `caseNumber` is `UNIQUE`, so `INSERT OR IGNORE` genuinely dedupes
there (a real natural-key collision, unlike the UUID PK case). Lesson
reinforced: `INSERT OR IGNORE` is only safe when the table has a real
UNIQUE/natural key that would actually collide.

## Standing operational rule (set 2026-08-05)

**Finish each module completely before moving to the next one.** Applies
to all future modules too, unless Josh explicitly says otherwise. And
finish means VERIFIED LIVE against running servers (real HTTP, and for UI
work an actual browser drive), not just code review.
`packages/parking`'s own checklist is now empty (fully complete), and the
first cross-cutting payoff of the shared Person store — the Exclusion
check at citation time — is built and verified (see its section above).
The remaining genuinely-unbuilt cross-cutting concern is auth/roles. Do
not start Injury Reports, the Central Counter Service, or another module
without either clearing/relating to the open cross-cutting items or
getting Josh's explicit redirect.

## packages/parking "finish" checklist (as of 2026-08-05)

Done: search happens through Field Lookup (single-record, phone-first) AND
now through Vehicles/Permits/Citations tabs too (client-side search/filter,
added 2026-08-05).
Done: Staff/Officer roster with real validated identity everywhere.
Done: PROTOTYPE document attachments.
Done: Printable citation, sized for a mobile receipt printer (Zebra
ZQ511/Brother-class device assumed) via the browser's normal print
pipeline, not vendor-specific raw printer commands. Every citation
(Administrative and Court) now gets its own citationNumber
(FGSD-CIT-YYYY-#####) at issuance, separate from caseNumber (Court-filing
only).
Done: Tow's real statutory-deadline workflow (`server/towWorkflow.js`,
`tests/towWorkflow.test.js`) -- real state machine, real 48-hour pre-tow-
notice enforcement (previously an explicitly flagged gap), deadline
computation for all four ECD-specified windows with ok/due-soon/overdue
status, still fully board-gated. Known limitation: weekends are excluded
from deadline math, holidays are not (no district holiday calendar
available yet).
Done: Permit expiration enforcement + renewal flow
(`server/permitExpiration.js`, `tests/permitExpiration.test.js`). This was
a real compliance gap, not cosmetic: an expired permit previously still
read Active everywhere, including Citation's Administrative-eligibility
check and Field Lookup's result. Fixed via an opportunistic sweep
(`sweepExpiredPermits()`) plus a single shared `getActiveValidPermitForVehicle()`
now used by permits.js, citations.js, and vehicles.js instead of three
separate driftable queries. New `POST /api/permits/:id/renew`.
Done: Permits auto-populate their expiration from a district-wide school
year end date (`server/schoolYearConfig.js`, `tests/schoolYearConfig.test.js`,
`routes/schoolYear.js`) -- Josh's direction, since permits are issued for
the school year, not an arbitrary date. Admin is prompted once a year
(only when the configured date has actually lapsed, not on every visit)
via a banner on the Permits tab. Explicit overrides on issuance/renewal
still work (Visitor/Temporary permits needing a shorter window).
Done: Reporting/analytics (`routes/reports.js`, real SQL GROUP BY
aggregation) -- Citations by violation/type/status/month/officer/location
(with an optional date-range filter), Permits by type/status, Tows by
status, all in a new lazily-loaded Reports tab with plain-CSS bar
visualization.
Done: PWA installability (`public/manifest.json`, `public/service-worker.js`,
`public/icons/`) -- installable to homescreen, NOT offline-data-capable.
Scope confirmed explicitly with Josh: "No offline data handling other
than reunification." The service worker only caches the static app
shell; it deliberately never intercepts `/api/` requests.

**All strictly parking-specific items on the finish checklist are now
done.** Of the two cross-cutting gaps that were never parking's alone to
fix, the first is now substantially closed and the second is still open:
1. ~~No shared Person store~~ — **DONE.** The shared Person store IS the
   Identity Service, and both parking and case-management are wired to it
   (§4 below): Vehicle + Person references on both sides, plus optional
   `identityPersonId` linkage on parking's citations/permits/applications.
   The design-doc §4.1 "biggest unbuilt piece" is built. And its named
   payoff — an **Exclusion check at citation time** — is now built and
   verified too (see "Cross-module Exclusion check" section above). This
   gap description is left here only struck-through so the reconciliation
   is visible; it was stale (written 2026-08-05, before the §4 wiring and
   the 2026-08-06 exclusion work). What's LEFT under this heading is
   broader/optional, not blocking: exclusion status inside
   case-management's own UI, a unified cross-module person dossier, and
   reunification's live-UI wiring (blocked on its bundler question).
2. **No auth/role system exists anywhere in the monorepo** — still open.
   Several places (Applications approve/reject, Staff roster itself) note
   this explicitly — the system tracks WHO performed an action (via the
   Staff roster) but doesn't yet gate WHO CAN. This is now the single
   largest genuinely-unbuilt cross-cutting concern.

Per the standing rule (finish each module before moving to the next),
parking is functionally complete and its checklist is empty. The next
conversation should either (a) tackle the auth/role gap (#2, now the
biggest open cross-cutting item), (b) extend the exclusion work (surface
it in case-management's UI; build toward the cross-module person
dossier), or (c) get Josh's explicit sign-off to move to a different
module entirely (Injury Reports, Central Counter Service, etc.).

## On the horizon

1. Resolve the Reunification browser-bundler open question before wiring
   shared entities into its live UI.
2. Central counter service (`@fgsd/shared/src/identifiers.js`) is still an
   in-memory reference implementation. `case-management` and `parking`
   each generate Case Numbers independently against their own tables —
   if both need to draw from one true sequence, that has to get built
   before either goes to production.
3. Once Josh confirms the monorepo push is solid, he deletes the standalone
   Reunification repo to free a slot.
4. **Identity wiring: ALL PIECES NOW DONE (2026-08-06).** `parking`'s
   Vehicle references (2026-08-05), `case-management`'s Vehicle
   references (2026-08-06), `case-management`'s Person references
   (2026-08-06), and `parking`'s Person references (2026-08-06) are all
   wired. This closes out the cross-module identity work that's been the
   focus of the last several sessions — see below for what each piece
   actually did, since they turned out to be architecturally quite
   different from each other, not a single repeated pattern.
   - **`parking`'s Person references: done (2026-08-06).** Deliberately
     NOT the same design as Vehicle wiring's full repoint — the settled
     Person-linkage policy explicitly rules out requiring resolution (a
     citation has to be writable for a first-time contact who may never
     be in Identity), so this is additive/optional linking, not a
     migration. `personId`/`registrantName` free-text fields on Citation,
     Permit, and PermitApplication are completely untouched and remain
     the primary, always-required path. A new, separate, nullable
     `identityPersonId` column lets a staff member optionally link a
     record to a real Identity Person via a deliberate search-and-select
     action (new `routes/identityPersons.js`, a thin search/resolve proxy
     — never used to auto-create or auto-resolve anyone). Wired into
     Citations, direct Permit issuance, and Application approval, each
     validating a provided `identityPersonId` against Identity before
     accepting it. Real value-add surfaced while doing this: Application
     approval can now actually set vehicle ownership in Identity when a
     reviewer chooses to link the applicant — previously always left
     unset since `app.personId` was free text with nothing valid to
     point ownership at. Frontend: a shared
     `renderPersonLinkWidget()`/`wirePersonLinkWidgets()` pair (search →
     results → select → "Linked: Name" with an unlink option) added to
     all three forms, keyed per-context so multiple pending applications
     each get independent search state.
   - `case-management`'s Vehicle wiring: **done (2026-08-06)** — turned
     out to be a much smaller task than parking's, since case-management
     has no real Vehicle entity of its own at all, only a free-text
     `vehicleInfo` block (type/state/regId/description) on the Exclusion
     Notice document generator. Added `GET /api/documents/vehicle-lookup?plate=`
     as a convenience autofill against Identity, NOT a live-linked
     record — an exclusion notice's vehicle mention is genuinely optional
     context (a visitor's car, a one-time contact), so requiring an
     Identity match would have been the wrong shape. Manual entry stays
     fully available either way.
   - **`case-management`'s Person wiring: done (2026-08-06).** This one
     WAS a substantial migration, unlike Vehicle — case-management had a
     real, substantial local `persons` table (biographic fields nearly
     identical to Identity's own schema) plus a `case_persons` role-link
     table. Now deprecated/unused, matching the vehicles-table precedent.
     `routes/persons.js` rewritten as a proxy + flattener, same pattern
     as parking's Vehicle proxy. Real semantic conflict resolved
     deliberately, not papered over: case-management's `personType`
     (visitor/parent_guardian/outsider/unknown — contextual, per-incident)
     is NOT the same thing as Identity's `personType`
     (Student/Staff/Volunteer/Visitor/Other — a durable district
     relationship); forcing one enum onto the other would lose real
     information, so `personType` stays case-management-LOCAL (new
     `person_local_info` table, alongside phone/address/city/state/zip/
     notes — genuinely local operational data, not identity data).
     `idType`/`idNumber` map onto Identity's structured
     `person_identifiers` instead of staying flat duplicate columns.
     Identity's own `GET /api/persons` gained a `?ids=a,b,c` batch-fetch
     to avoid N+1 lookups for list views (case list subject names,
     case-detail person rosters) — caught and fixed a real bug in it
     first (`?ids=` with an empty value is falsy in JS, so the initial
     `if (ids)` guard fell through to "return everything" instead of
     "return nothing").
     **Real crash risk caught before it shipped**: converting
     case-management's routes to `async` (required to call out to
     Identity) recreated the exact unhandled-promise-rejection-kills-the-
     process failure mode already documented below from parking's earlier
     bug-fix — case-management had zero async routes before this, so it
     had never been exposed to that risk. Fixed with the same pattern
     already used in parking: try/catch on every async route, plus the
     same global error middleware + `unhandledRejection` listener added
     to `index.js`.
     Also caught and fixed the identical seed-script idempotency bug
     (`INSERT OR IGNORE` on a table keyed by a fresh UUID, same root
     cause as identity's own seed.js bug below) in `case_persons` linking
     while directly touching that code.
   - **Consolidated `identityClient.js` into `@fgsd/shared`** while doing
     the Vehicle-wiring work above (it was about to be duplicated a
     second time for case-management) — moved from `packages/parking`,
     all of parking's consumers updated to import from `@fgsd/shared`
     instead, local copy deleted. Both `parking` and `case-management`
     now depend on `@fgsd/shared` for this.
   - **Person-linkage policy, settled 2026-08-06 — see "Legal/compliance
     foundation" section above for the full decision.** Short version:
     `personId` on a citation/case is never required to resolve to an
     Identity Person, and nothing auto-creates a placeholder Identity
     record. Linking/creating a real Person is always a deliberate staff
     action (search-and-link, or a real Add Person with real fields), not
     a side effect of submitting a citation or case. This was the
     blocking design question before Person wiring could start — it's
     resolved now, and case-management's Person wiring (above) is the
     first real proof this policy works in practice: nothing in that
     migration required or assumed every person resolves to a "real"
     Identity file, and none was silently fabricated.
5. **Document upload is a labeled PROTOTYPE, not production-ready** —
   `packages/parking/server/routes/attachments.js` + `document_attachments`
   table. Local disk storage, no encryption at rest, no access control, no
   durable storage. A persistent amber banner appears on every tab of the
   parking app saying so. Josh explicitly connected this to the much
   bigger picture: injury reports, investigation files, and incident
   reports involving real victims will eventually live in this system, so
   this prototype was deliberately built generic (recordType/recordId,
   not permit-specific) so the same schema/route shape can be reused for
   those far more sensitive attachments later. **Before any real
   confidential document ever gets uploaded to a deployed instance**, this
   needs: a real storage decision (most likely Google Cloud Storage, given
   the district's Workspace/Cloud environment), real access control (which
   depends on the auth system that doesn't exist yet either), and probably
   encryption at rest. Do not treat the prototype's existence as
   permission to skip that work later.
6. No auth/role system exists anywhere in the monorepo. The Applications
   approve/reject endpoints don't distinguish "a student submitting their
   own application" from "staff reviewing it" beyond which API call is
   made — anyone who can reach the API can call either. Real gap, flagged
   in `applications.js`'s file header too.
