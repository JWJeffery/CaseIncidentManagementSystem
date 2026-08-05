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
    §4.5b of the design doc).
  - `packages/reunification/` — folded in from the (now-redundant)
    standalone Reunification repo. Client-side only, no backend yet.
    Claimant entry → SIS/Synergy match approval → reunifier handoff →
    release workflow. Real test suite (`npm run reunification:test`).
    **Open question, unresolved:** browser code has no bundler, so
    `@fgsd/shared` (CommonJS) isn't importable from the live UI yet, only
    from Node-run tests. Needs a decision (bundler vs. duplicate
    browser-safe export vs. defer until Reunification gets a real backend).
  - `packages/shared/` (`@fgsd/shared`) — Incident Number (lifetime
    sequence, `FGSD-#######`) / Case Number (annual reset,
    `FGSD-YYYY-#####`) formatting; records classification enum + disclosure
    log helper; board-authority feature flags (`ECD_COURT_CITATIONS_ENABLED`,
    `ECD_TOWING_ENABLED`) — **both hardcoded `false`, must stay that way
    until Josh confirms actual school board adoption of proposed Board
    Policy ECD.** Do not flip these without explicit confirmation.
  - Root `npm install` sets up all three workspaces.
    `npm run case-management` / `case-management:seed` /
    `reunification` / `reunification:test`.
  - **Standalone Reunification repo is now redundant** — Josh can delete
    it to free a repo slot; its content is fully preserved in
    `packages/reunification/` here.
- **Reunification** (standalone) — superseded by the monorepo. Slated for
  deletion by Josh once he's confirmed the monorepo push is good.
- **PrayerAppNew**, **Scriptorium**, **LOTH** — unrelated projects, not
  part of this workstream.

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

## On the horizon

1. **Dashboards** — Lucy previously built dashboards for these builds.
   Location unknown as of this note (not found in CaseIncidentManagementSystem
   or Reunification repo history — searched, no trace). Need to ask Josh
   directly where these live (separate repo? GitHub Pages? a hosting
   service?) before attempting to refine/redeploy them.
2. Resolve the Reunification browser-bundler open question before wiring
   shared entities into its live UI.
3. Pick a build priority from the design doc's remaining open decisions
   (doc §8's final open item: which module gets real development attention
   first).
4. Once Josh confirms the monorepo push is solid, he deletes the standalone
   Reunification repo to free a slot.
