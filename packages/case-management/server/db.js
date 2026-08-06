// server/db.js  — uses sql.js (pure-JS SQLite, no native build needed)
const path = require('path');
const fs   = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'cms.db');
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

  _db.run(`CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY, caseNumber TEXT UNIQUE NOT NULL,
    openedAt TEXT NOT NULL, incidentAt TEXT, schoolSite TEXT, location TEXT,
    incidentType TEXT, createdBy TEXT, assignedTo TEXT, initialNarrative TEXT,
    immediateActions TEXT, status TEXT DEFAULT 'Draft', disposition TEXT,
    lawEnforcementInvolved INTEGER DEFAULT 0, safetyRiskLevel TEXT DEFAULT 'low',
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );`);

  // AS OF PERSON WIRING (2026-08-06), this table is DEPRECATED and no
  // longer written to by any route -- person biographic data (name, DOB,
  // sex, race, physical descriptors) now lives in packages/identity, and
  // routes/persons.js proxies to it (see @fgsd/shared/src/identityClient.js).
  // This CREATE TABLE is left in place (harmless, unused) rather than
  // dropped, matching the same precedent set for parking's deprecated
  // local vehicles table -- no DDL drop, no benefit to the risk. Do not
  // add new code that queries it.
  _db.run(`CREATE TABLE IF NOT EXISTS persons (
    id TEXT PRIMARY KEY, personType TEXT, firstName TEXT, middleName TEXT,
    lastName TEXT, aliases TEXT, phone TEXT, address TEXT, city TEXT, state TEXT,
    zip TEXT, dob TEXT, idType TEXT, idNumber TEXT, sex TEXT, race TEXT,
    height TEXT, weight TEXT, hair TEXT, eyes TEXT, notes TEXT,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );`);

  // NEW -- person_local_info. Not everything on the old persons table
  // belongs in Identity's canonical Person file. Two real, deliberate
  // distinctions here, not just "whatever's left over":
  //  1. personType here is case-management's own CONTEXTUAL classification
  //     (parent_guardian, outsider, unknown, etc. -- "who is this person
  //     in THIS incident") which is semantically different from and not
  //     mappable onto Identity's personType (Student/Staff/Volunteer/
  //     Visitor/Other -- a durable relationship to the district). Forcing
  //     one enum onto the other would lose real information either way,
  //     so they stay two separate, independent fields.
  //  2. phone/address/city/state/zip/notes are operationally relevant to
  //     a case investigation but aren't identity-verifying biographic
  //     data -- a person's current address changes far more often than
  //     who they ARE, and case notes are inherently case-specific
  //     commentary that has no business living in a shared master file.
  // idType/idNumber from the old schema are NOT duplicated here -- they
  // map onto Identity's person_identifiers instead (see routes/persons.js).
  _db.run(`CREATE TABLE IF NOT EXISTS person_local_info (
    identityPersonId TEXT PRIMARY KEY,
    personType TEXT, phone TEXT, address TEXT, city TEXT, state TEXT, zip TEXT,
    notes TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );`);

  _db.run(`CREATE TABLE IF NOT EXISTS case_persons (
    id TEXT PRIMARY KEY, caseId TEXT NOT NULL, personId TEXT NOT NULL, role TEXT NOT NULL
  );`);

  _db.run(`CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY, caseId TEXT NOT NULL, author TEXT,
    noteType TEXT DEFAULT 'general', body TEXT, createdAt TEXT NOT NULL
  );`);

  _db.run(`CREATE TABLE IF NOT EXISTS violations (
    id TEXT PRIMARY KEY, caseId TEXT, basisType TEXT DEFAULT 'KGB',
    citation TEXT, shortLabel TEXT, description TEXT, recommendedAction TEXT,
    exclusionLength TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );`);

  _db.run(`CREATE TABLE IF NOT EXISTS policy_library (
    id TEXT PRIMARY KEY, basisType TEXT DEFAULT 'KGB',
    citation TEXT UNIQUE NOT NULL, shortLabel TEXT NOT NULL, policyText TEXT NOT NULL
  );`);

  _db.run(`CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY, caseId TEXT NOT NULL, documentType TEXT,
    generatedAt TEXT NOT NULL, generatedBy TEXT, storedContent TEXT
  );`);

  _db._save();
  return _db;
}

// ── sql.js result helpers ─────────────────────────────────────────────────
function rowToObj(cols, row) {
  const obj = {};
  cols.forEach((c, i) => { obj[c] = row[i] !== undefined ? row[i] : null; });
  return obj;
}

function normaliseParams(args) {
  if (args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    // Named params: convert {key:val} -> sql.js wants {$key:val}
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
