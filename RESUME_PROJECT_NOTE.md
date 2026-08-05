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
  - `packages/shared/` (`@fgsd/shared`) — Incident Number (lifetime
    sequence, `FGSD-#######`) / Case Number (annual reset,
    `FGSD-YYYY-#####`) formatting; records classification enum + disclosure
    log helper; board-authority feature flags (`ECD_COURT_CITATIONS_ENABLED`,
    `ECD_TOWING_ENABLED`) — **both hardcoded `false`, must stay that way
    until Josh confirms actual school board adoption of proposed Board
    Policy ECD.** Do not flip these without explicit confirmation. Both
    flags are verified (real HTTP 403 tests, not just code review) to
    actually block Court-track citation creation and all Tow writes.
  - Root `npm install` sets up all four workspaces.
    `npm run case-management` / `case-management:seed` /
    `reunification` / `reunification:test` / `parking` / `parking:seed`.
  - **Standalone Reunification repo is now redundant** — Josh can delete
    it to free a repo slot; its content is fully preserved in
    `packages/reunification/` here.
- **Reunification** (standalone) — superseded by the monorepo. Slated for
  deletion by Josh once he's confirmed the monorepo push is good.
- **PrayerAppNew**, **Scriptorium**, **LOTH** — unrelated projects, not
  part of this workstream. (LOTH = Liturgy of the Hours, a liturgical
  project, not a school-safety dashboard as once assumed mid-session —
  corrected same day.)

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

## Standing operational rule (set 2026-08-05)

**Finish each module completely before moving to the next one.** Applies
to all future modules too, unless Josh explicitly says otherwise.
Currently finishing `packages/parking` — see the checklist below for what
"finished" still requires. Do not start work on Injury Reports, the
Central Counter Service, auth, or any other module until this list is
empty or Josh explicitly redirects.

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

Still open, roughly in priority order:
1. **Permit expiration handling** — `expirationDate` exists but nothing
   transitions a permit to `Expired` automatically; no renewal flow. (The
   Permits status filter already has an "Expired" option in the
   dropdown — it just never matches anything yet, which is itself proof
   this is unbuilt.)
2. **Tow's actual statutory-deadline workflow** — only schema + board gate
   exist (design doc §4.12a). Lower urgency since board-gated anyway, but
   not done.
3. **Reporting/analytics** — no violation trend or citation-count views.
4. **PWA/offline support** — Field Lookup was designed with the
   phone-in-hand use case in mind but isn't installable or offline-capable.
5. Cross-module dependencies, not strictly parking-scoped, but block real
   completeness: no shared Person store, no auth/role system anywhere.

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
4. No shared Person store exists yet — `parking` and `case-management`
   both use free-text `personId` strings with no cross-reference. This is
   the design doc's biggest unbuilt piece (§4.1) and blocks real
   cross-module linkage (e.g. an Exclusion check at citation time).
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
