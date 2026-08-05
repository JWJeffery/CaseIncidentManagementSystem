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

  _db.run(`CREATE TABLE IF NOT EXISTS persons (
    id TEXT PRIMARY KEY, personType TEXT, firstName TEXT, middleName TEXT,
    lastName TEXT, aliases TEXT, phone TEXT, address TEXT, city TEXT, state TEXT,
    zip TEXT, dob TEXT, idType TEXT, idNumber TEXT, sex TEXT, race TEXT,
    height TEXT, weight TEXT, hair TEXT, eyes TEXT, notes TEXT,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
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
