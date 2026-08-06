// server/db.js — uses sql.js (pure-JS SQLite, no native build needed)
// Mirrors packages/case-management/server/db.js's pattern intentionally,
// for consistency across the monorepo. (Worth extracting the sql.js
// wrapper below into @fgsd/shared at some point, since it's now
// duplicated verbatim in two packages — flagging, not doing it in this
// pass to avoid touching case-management's already-working db layer.)
const path = require('path');
const fs   = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'parking.db');
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

let _db = null;

async function initDB() {
  if (_db) return _db;
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(buf);
  } else {
    _db = new SQL.Database();
  }

  _db._save = () => {
    const data = _db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  };

  _db.run('PRAGMA foreign_keys = ON;');

  // Design doc §4.10 — Vehicle. AS OF PHASE 2 (2026-08-05), this table is
  // DEPRECATED and no longer written to by any route -- vehicle master
  // data (plate, VIN, make/model/color, ownership) now lives in
  // packages/identity, and parking's routes/vehicles.js proxies to it
  // (see @fgsd/shared/src/identityClient.js). This CREATE TABLE is left in place
  // (harmless, unused) rather than dropped, since sql.js DDL drops on a
  // live file are an unnecessary risk for zero benefit -- nothing reads
  // or writes this table anymore. Do not add new code that queries it.
  _db.run(`CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY, plate TEXT, state TEXT, vin TEXT,
    make TEXT, model TEXT, year TEXT, color TEXT,
    ownerPersonId TEXT, ownerName TEXT, ownerRelationship TEXT,
    selfReported INTEGER DEFAULT 1, dmvVerified INTEGER DEFAULT 0,
    dmvVerifiedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );`);

  // NEW (Phase 2) -- vehicle_dmv_status. The only vehicle-related data
  // that's genuinely parking's own concern, not identity's: whether a
  // vehicle's info is self-reported vs. DMV2U-verified, and who entered
  // it locally. Keyed by the IDENTITY SERVICE's vehicle id (an opaque
  // foreign key into a different service's database -- there's no way
  // for sql.js to enforce that relationship across services, so it's
  // enforced at the application layer in routes/vehicles.js instead).
  _db.run(`CREATE TABLE IF NOT EXISTS vehicle_dmv_status (
    identityVehicleId TEXT PRIMARY KEY,
    selfReported INTEGER DEFAULT 1, dmvVerified INTEGER DEFAULT 0,
    dmvVerifiedAt TEXT, enteredBy TEXT,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );`);

  // Design doc §4.11 — Parking Permit. Formalizes the current spreadsheet.
  // Field set matches what Board Policy JHFD (Student Vehicle Use) already
  // requires the District to collect -- evidence of a valid driver's
  // license, current vehicle registration, insurance/financial
  // responsibility, and a displayed permit/sticker -- plus standard
  // campus-parking-system practice: permit type (different rules/pricing/
  // eligibility per type) and an assigned lot/zone, since "who can park
  // where" is the actual operational question a permit answers.
  // NOTE (open, flagged in design doc §8 item 9): ECD §5(A) limits
  // administrative citation eligibility to student/district personnel,
  // while JHFD's permit language is broader. This table does not resolve
  // that conflict — it just formalizes what's on the spreadsheet today.
  _db.run(`CREATE TABLE IF NOT EXISTS parking_permits (
    id TEXT PRIMARY KEY, personId TEXT NOT NULL, vehicleId TEXT NOT NULL,
    permitNumber TEXT UNIQUE NOT NULL, schoolSite TEXT,
    registrantName TEXT, affiliateType TEXT,
    studentIdNumber TEXT, employeeIdNumber TEXT,
    driverLicenseNumber TEXT, driverLicenseState TEXT,
    insuranceCarrier TEXT, insurancePolicyNumber TEXT, insurancePolicyExpiration TEXT,
    ownershipInfo TEXT,
    permitType TEXT DEFAULT 'Student',
    parkingZone TEXT,
    issuedDate TEXT NOT NULL, expirationDate TEXT,
    status TEXT DEFAULT 'Active',
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );`);

  // Design doc §4.12b — Violation Code Library. Parallel pattern to
  // case-management's policy_library (KGB), seeded from ECD §4(A)-(M) plus
  // reference entries for Vehicle Code / Forest Grove Traffic Code basis.
  _db.run(`CREATE TABLE IF NOT EXISTS violation_codes (
    id TEXT PRIMARY KEY,
    violationBasis TEXT NOT NULL,
    citation TEXT UNIQUE NOT NULL,
    shortLabel TEXT NOT NULL,
    description TEXT NOT NULL,
    violationClass TEXT NOT NULL
  );`);

  // Design doc §4.12 — Citation. citationType discriminates Administrative
  // (Education Record, enabled today) vs. Court (LEU -> Court Record,
  // board-gated — see server/routes/citations.js for the enforcement of
  // that gate, not just this schema comment).
  _db.run(`CREATE TABLE IF NOT EXISTS citations (
    id TEXT PRIMARY KEY,
    incidentNumber TEXT, caseNumber TEXT,
    vehicleId TEXT, personId TEXT, violationCodeId TEXT NOT NULL,
    citationType TEXT NOT NULL DEFAULT 'Administrative',
    recordsClassification TEXT NOT NULL,
    enforcementOfficerId TEXT NOT NULL,
    location TEXT, dateIssued TEXT NOT NULL,
    status TEXT DEFAULT 'Issued', notes TEXT,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );`);

  // Design doc §4.12a — Tow. Entire subsystem is board-gated (see
  // server/routes/tows.js) — schema exists so the system is ready the day
  // ECD is adopted, per design doc §1.7.
  _db.run(`CREATE TABLE IF NOT EXISTS tows (
    id TEXT PRIMARY KEY,
    vehicleId TEXT NOT NULL, citationId TEXT,
    towReason TEXT NOT NULL, hazardTow INTEGER DEFAULT 0,
    preTowNoticeAffixedAt TEXT, towedAt TEXT,
    postTowNoticeMailedAt TEXT, hearingRequestedAt TEXT,
    hearingScheduledAt TEXT, hearingDecision TEXT,
    chargesAmount TEXT, chargesPaidAt TEXT,
    releasedTo TEXT, releasedAt TEXT,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );`);

  // Design doc §4.13 — DMV Query Log. Fields sourced directly from
  // District DMV2U Record Inquiry Account Protocol (010) §8 — not
  // invented. Not user-deletable; 5-year retention is a legal minimum
  // (Protocol 010 §14), enforced at the application layer, not here.
  _db.run(`CREATE TABLE IF NOT EXISTS dmv_query_log (
    id TEXT PRIMARY KEY,
    dateTime TEXT NOT NULL,
    authorizedUserName TEXT NOT NULL, authorizedUserTitle TEXT,
    authorizedUserBuilding TEXT, authorizedUserDmv2uUsername TEXT NOT NULL,
    requestingEmployee TEXT,
    recordIdentifier TEXT NOT NULL,
    location TEXT,
    referenceNumber TEXT,
    factualBasis TEXT NOT NULL,
    permissiblePurposeCategory TEXT NOT NULL,
    dmvRecordAccessed TEXT, personalInformationUsed TEXT,
    wasRedisclosed INTEGER DEFAULT 0,
    redisclosureRecipient TEXT, redisclosureReason TEXT,
    dispositionOrAction TEXT,
    createdAt TEXT NOT NULL
  );`);

  // NEW -- Permit Application. Self-registration workflow: a student/staff
  // member submits their own info (same shape as the eventual Permit),
  // and it sits Pending until staff review confirms it. Same pattern as
  // Reunification's claimant-entry -> staff-approval workflow -- reused
  // deliberately rather than inventing a new one. Approval creates the
  // actual Vehicle + Permit records and links back here for audit trail.
  // Document upload (license/insurance photos) is NOT implemented yet --
  // see uploadNotes field and RESUME_PROJECT_NOTE.md for why (real
  // storage-backend decision pending, not silently punted).
  _db.run(`CREATE TABLE IF NOT EXISTS permit_applications (
    id TEXT PRIMARY KEY,
    personId TEXT NOT NULL,
    registrantName TEXT NOT NULL, affiliateType TEXT,
    studentIdNumber TEXT, employeeIdNumber TEXT,
    vehiclePlate TEXT, vehicleState TEXT, vehicleVin TEXT,
    vehicleMake TEXT, vehicleModel TEXT, vehicleYear TEXT, vehicleColor TEXT,
    ownerName TEXT, ownerRelationship TEXT,
    driverLicenseNumber TEXT, driverLicenseState TEXT,
    insuranceCarrier TEXT, insurancePolicyNumber TEXT, insurancePolicyExpiration TEXT,
    permitTypeRequested TEXT DEFAULT 'Student', parkingZoneRequested TEXT, schoolSite TEXT,
    uploadNotes TEXT,
    status TEXT DEFAULT 'Submitted',
    submittedAt TEXT NOT NULL,
    reviewedBy TEXT, reviewedAt TEXT, reviewNotes TEXT,
    resultingVehicleId TEXT, resultingPermitId TEXT,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );`);

  // ============================================================
  // PROTOTYPE ONLY -- document_attachments
  // ============================================================
  // This table and its route (server/routes/attachments.js) are a
  // PROOF OF CONCEPT for uploading supporting documents (currently:
  // driver license / insurance photos for Permit Applications). It is
  // deliberately generic (recordType/recordId, not tied to permits
  // specifically) because the same pattern will be needed for far more
  // sensitive material soon -- injury report documentation, investigation
  // file attachments, incident reports involving real victims. Building
  // it generically now means case-management can reuse this exact
  // schema/route shape later instead of inventing a second one.
  //
  // What this prototype does NOT do, and must not be assumed to do:
  //   - No encryption at rest (files sit as plain bytes on local disk)
  //   - No access control on who can upload, view, or delete a file --
  //     there is no auth system anywhere in this monorepo yet
  //   - No virus/malware scanning
  //   - No durable storage -- local disk in a Codespace is ephemeral
  //   - No redaction, retention-schedule, or records-request workflow
  // None of this is safe for real confidential records (real students'
  // driver licenses, real injury details, real investigation files, real
  // victim information) until a production storage decision is made
  // (most likely Google Cloud Storage, given the district's Workspace/
  // Cloud environment) and real access control exists. See
  // RESUME_PROJECT_NOTE.md.
  _db.run(`CREATE TABLE IF NOT EXISTS document_attachments (
    id TEXT PRIMARY KEY,
    recordType TEXT NOT NULL, recordId TEXT NOT NULL,
    documentType TEXT, originalFilename TEXT NOT NULL,
    storedFilename TEXT NOT NULL, mimeType TEXT, fileSizeBytes INTEGER,
    uploadedBy TEXT, classification TEXT,
    createdAt TEXT NOT NULL
  );`);

  // NEW -- Staff/Officer roster. Currently every "who did this" field in
  // this module (Citation.enforcementOfficerId, PermitApplication.reviewedBy,
  // Permit issuance) was free text -- no consistency, no validation, no
  // real audit trail. This table makes those references real: a
  // selectable roster instead of whatever a form field happened to have
  // typed into it. Scoped to parking for now (not @fgsd/shared) because
  // shared has no persistence layer yet -- see RESUME_PROJECT_NOTE.md.
  // Built with the same portability intent as document_attachments: same
  // shape should carry over cleanly to case-management later (it already
  // has an identical need -- "Employee ID/DPSST" on the Exclusion Notice
  // form, "createdBy"/"assignedTo" on Case).
  _db.run(`CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    employeeIdNumber TEXT,
    dpsstNumber TEXT,
    role TEXT,
    dmv2uAuthorized INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );`);

  // NEW -- School Year Config. Parking permits are issued for the school
  // year, not an arbitrary date range (Josh's explicit direction). Every
  // time an admin sets a new end date, that's a new row -- the current
  // config is always the most recently created row. This gives a natural
  // audit trail (who set it, when, what it was before) for free, without
  // needing separate "previous value" columns the way permits' renewal
  // tracking needed them.
  _db.run(`CREATE TABLE IF NOT EXISTS school_year_config (
    id TEXT PRIMARY KEY,
    schoolYearEndDate TEXT NOT NULL,
    setBy TEXT NOT NULL,
    setAt TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );`);

  // Idempotent migrations for the schema additions above -- lets an
  // existing dev database pick up new columns without requiring `rm -rf
  // data`. SQLite has no "ADD COLUMN IF NOT EXISTS"; each is wrapped so a
  // "duplicate column" error (already migrated) is silently ignored, but
  // any other error still surfaces.
  const migrations = [
    `ALTER TABLE vehicles ADD COLUMN year TEXT`,
    `ALTER TABLE vehicles ADD COLUMN ownerName TEXT`,
    `ALTER TABLE vehicles ADD COLUMN ownerRelationship TEXT`,
    `ALTER TABLE parking_permits ADD COLUMN registrantName TEXT`,
    `ALTER TABLE parking_permits ADD COLUMN affiliateType TEXT`,
    `ALTER TABLE parking_permits ADD COLUMN studentIdNumber TEXT`,
    `ALTER TABLE parking_permits ADD COLUMN employeeIdNumber TEXT`,
    `ALTER TABLE parking_permits ADD COLUMN driverLicenseNumber TEXT`,
    `ALTER TABLE parking_permits ADD COLUMN driverLicenseState TEXT`,
    `ALTER TABLE parking_permits ADD COLUMN insuranceCarrier TEXT`,
    `ALTER TABLE parking_permits ADD COLUMN insurancePolicyNumber TEXT`,
    `ALTER TABLE parking_permits ADD COLUMN insurancePolicyExpiration TEXT`,
    `ALTER TABLE parking_permits ADD COLUMN permitType TEXT DEFAULT 'Student'`,
    `ALTER TABLE parking_permits ADD COLUMN parkingZone TEXT`,
    `ALTER TABLE parking_permits ADD COLUMN issuedBy TEXT`,
    `ALTER TABLE parking_permits ADD COLUMN renewedBy TEXT`,
    `ALTER TABLE parking_permits ADD COLUMN renewedAt TEXT`,
    `ALTER TABLE parking_permits ADD COLUMN previousExpirationDate TEXT`,
    `ALTER TABLE vehicles ADD COLUMN enteredBy TEXT`,
    `ALTER TABLE citations ADD COLUMN citationNumber TEXT`,
    `ALTER TABLE citations ADD COLUMN printedAt TEXT`,
    `ALTER TABLE citations ADD COLUMN printedBy TEXT`,
    `ALTER TABLE tows ADD COLUMN status TEXT DEFAULT 'Open'`,
    `ALTER TABLE tows ADD COLUMN hearingDecidedAt TEXT`,
    `ALTER TABLE tows ADD COLUMN affixedBy TEXT`,
    `ALTER TABLE tows ADD COLUMN executedBy TEXT`,
    `ALTER TABLE tows ADD COLUMN mailedBy TEXT`,
    `ALTER TABLE tows ADD COLUMN requestedBy TEXT`,
    `ALTER TABLE tows ADD COLUMN scheduledBy TEXT`,
    `ALTER TABLE tows ADD COLUMN decidedBy TEXT`,
    `ALTER TABLE tows ADD COLUMN releasedBy TEXT`,
    // NEW -- optional Identity Person linkage, per the settled Person-
    // linkage policy (RESUME_PROJECT_NOTE.md, "Legal/compliance
    // foundation"): personId/registrantName stay exactly as they are
    // (free text, always required, never blocked on a real match) --
    // this is a SEPARATE, always-optional field a staff member can set
    // via a deliberate search-and-link action, never auto-populated.
    `ALTER TABLE parking_permits ADD COLUMN identityPersonId TEXT`,
    `ALTER TABLE citations ADD COLUMN identityPersonId TEXT`,
    `ALTER TABLE permit_applications ADD COLUMN identityPersonId TEXT`,
  ];
  for (const sql of migrations) {
    try { _db.run(sql); } catch (e) { /* column already exists -- fine */ }
  }

  _db._save();
  return _db;
}

// ── sql.js result helpers (identical to case-management/server/db.js) ────
function rowToObj(cols, row) {
  const obj = {};
  cols.forEach((c, i) => { obj[c] = row[i] !== undefined ? row[i] : null; });
  return obj;
}

function normaliseParams(args) {
  if (args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    const obj = args[0];
    const out = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      out['$' + k] = (v === undefined ? null : v);
    }
    return out;
  }
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

class Stmt {
  constructor(db, sql) { this._db = db; this._sql = sql; }

  all(...args) {
    const stmt = this._db.prepare(this._sql);
    const cols = stmt.getColumnNames();
    const params = normaliseParams(args);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(rowToObj(cols, stmt.get()));
    stmt.free();
    return rows;
  }

  get(...args) {
    const stmt = this._db.prepare(this._sql);
    const cols = stmt.getColumnNames();
    const params = normaliseParams(args);
    stmt.bind(params);
    let result;
    if (stmt.step()) result = rowToObj(cols, stmt.get());
    stmt.free();
    return result;
  }

  run(...args) {
    const params = normaliseParams(args);
    this._db.run(this._sql, params);
    this._db._save();
    return { changes: this._db.getRowsModified() };
  }
}

const dbProxy = {
  prepare(sql) {
    if (!_db) throw new Error('DB not initialised');
    return new Stmt(_db, sql);
  }
};

module.exports = { initDB, db: dbProxy };
