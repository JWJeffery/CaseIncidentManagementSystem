// server/db.js — uses sql.js (pure-JS SQLite, no native build needed)
//
// Schema design deliberately mirrors how real law enforcement records
// systems (NCIC, and Oregon's own LEDS) structure a master index: a lean
// canonical record per entity (Person, Vehicle, Location), with
// everything else -- aliases, identifiers, vehicle registrations,
// ownership -- as separate, time-bound records that REFERENCE the
// master, rather than repeating identity data in every consuming module.
//
// This is Phase 1: the identity service itself, standalone and tested.
// Wiring case-management and parking to actually consume this instead of
// their own free-text personId/vehicle fields is separate, subsequent
// work -- not done here. See RESUME_PROJECT_NOTE.md.
const path = require('path');
const fs   = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'identity.db');
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

  // ============================================================
  // PERSON MASTER FILE
  // ============================================================
  // Lean biographic core, same field shape as what the KGB Exclusion
  // Notice form and case-management's persons table already established
  // as the district's working descriptor set -- this isn't a new field
  // design, it's the existing one made canonical and shared.
  // No SSN collected -- explicit direction from Josh: not needed given
  // SIS ID covers identification for both students and staff.
  _db.run(`CREATE TABLE IF NOT EXISTS persons (
    id TEXT PRIMARY KEY,
    lastName TEXT NOT NULL, firstName TEXT NOT NULL, middleName TEXT,
    dob TEXT, sex TEXT, race TEXT,
    height TEXT, weight TEXT, hairColor TEXT, eyeColor TEXT,
    personType TEXT NOT NULL DEFAULT 'Other',
    primarySchoolSite TEXT,
    synergyImportId TEXT, importedAt TEXT,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );`);

  // A real person can have multiple names on record (maiden, nickname,
  // previous legal name) -- none of them alone IS the person, so these
  // are separate rows, not columns on persons.
  _db.run(`CREATE TABLE IF NOT EXISTS person_aliases (
    id TEXT PRIMARY KEY,
    personId TEXT NOT NULL,
    aliasName TEXT NOT NULL,
    aliasType TEXT DEFAULT 'Other',
    createdAt TEXT NOT NULL
  );`);

  // Same logic for identifiers -- a person can hold a SIS ID AND a
  // driver's license number AND (rarely) a state ID, and any of these
  // might be what a lookup is searching by. identifierType 'SIS ID'
  // covers both students and staff uniformly (confirmed by Josh --
  // staff carry SIS IDs too, so this isn't split into separate
  // Student ID / Employee ID types the way earlier per-module schemas
  // had it).
  _db.run(`CREATE TABLE IF NOT EXISTS person_identifiers (
    id TEXT PRIMARY KEY,
    personId TEXT NOT NULL,
    identifierType TEXT NOT NULL,
    identifierValue TEXT NOT NULL,
    issuingState TEXT,
    verified INTEGER DEFAULT 0,
    verifiedBy TEXT, verifiedAt TEXT,
    createdAt TEXT NOT NULL
  );`);

  // ============================================================
  // VEHICLE MASTER FILE
  // ============================================================
  // Anchored on VIN, not plate -- the NCIC/LEDS pattern, and a real fix
  // over parking's original Vehicle table, which conflated "the vehicle"
  // and "its current plate" into one row with no history. A plate change
  // or a vehicle getting sold and replated previously had no record of
  // what came before.
  _db.run(`CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    vin TEXT, make TEXT, model TEXT, year TEXT, color TEXT,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );`);

  // Plate/state is a time-bound registration record layered on the
  // vehicle, not the vehicle's identity itself. effectiveTo IS NULL means
  // "this is the current registration" -- exactly one such row per
  // vehicle should exist at a time (enforced at the application layer,
  // not by a DB constraint sql.js can express cleanly).
  _db.run(`CREATE TABLE IF NOT EXISTS vehicle_registrations (
    id TEXT PRIMARY KEY,
    vehicleId TEXT NOT NULL,
    plate TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'OR',
    effectiveFrom TEXT NOT NULL, effectiveTo TEXT,
    createdAt TEXT NOT NULL
  );`);

  // Same effective-dating pattern for ownership -- a vehicle's owner can
  // change (sold, re-registered to a different family member) without
  // losing the history of who owned it when.
  _db.run(`CREATE TABLE IF NOT EXISTS vehicle_ownership (
    id TEXT PRIMARY KEY,
    vehicleId TEXT NOT NULL,
    personId TEXT NOT NULL,
    relationship TEXT DEFAULT 'Self',
    effectiveFrom TEXT NOT NULL, effectiveTo TEXT,
    createdAt TEXT NOT NULL
  );`);

  // ============================================================
  // LOCATION / PREMISES MASTER FILE (the "School file")
  // ============================================================
  // Replaces case-management's hardcoded DISTRICT_PROPERTIES array and
  // parking's free-text schoolSite fields with one real, referenceable
  // list -- consuming that list is Phase 2 work, not done here, but the
  // canonical list itself lives here now.
  _db.run(`CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL, address TEXT,
    siteType TEXT DEFAULT 'School',
    active INTEGER DEFAULT 1,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );`);

  _db._save();
  return _db;
}

// ── sql.js result helpers (identical pattern to every other package) ────
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
