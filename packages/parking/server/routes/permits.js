// server/routes/permits.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { requireActiveStaff } = require('./staff');
const { isPermitExpired } = require('../permitExpiration');
const { defaultExpirationDate } = require('../schoolYearConfig');
const { getCurrentConfig } = require('./schoolYear');

// Opportunistic expiration sweep -- there's no background job scheduler
// in this app, so expiration is enforced lazily: any Active permit whose
// expirationDate has passed gets flipped to Expired the next time
// anything reads permit data. Called from every read path below (list,
// single-record, and the vehicle-eligibility lookup Citation depends on)
// so a stale "Active" status can't leak through any of them. Reuses the
// same tested isPermitExpired() logic from permitExpiration.js rather
// than re-implementing the date comparison in raw SQL.
function sweepExpiredPermits() {
  const candidates = db.prepare(
    `SELECT * FROM parking_permits WHERE status = 'Active' AND expirationDate IS NOT NULL AND expirationDate != ''`
  ).all();
  const now = new Date().toISOString();
  for (const p of candidates) {
    if (isPermitExpired(p)) {
      db.prepare(`UPDATE parking_permits SET status = 'Expired', updatedAt = ? WHERE id = ?`).run(now, p.id);
    }
  }
}

// Single source of truth for "does this vehicle have a currently-valid
// permit" -- used by this file's own active-for-vehicle route AND
// imported directly by citations.js (Administrative-track eligibility,
// ECD §5(A)) and vehicles.js (Field Lookup), so there is exactly one
// query answering this question instead of three that could drift.
function getActiveValidPermitForVehicle(vehicleId) {
  sweepExpiredPermits();
  return db.prepare(
    `SELECT * FROM parking_permits WHERE vehicleId = ? AND status = 'Active' ORDER BY issuedDate DESC LIMIT 1`
  ).get(vehicleId) || null;
}

// Standard campus-parking-system permit categories. Each typically carries
// different eligibility, pricing, and lot/zone assignment rules -- this is
// the field that answers "what kind of permit is this," separate from
// affiliateType (who the registrant is) and parkingZone (where they park).
const PERMIT_TYPES = [
  'Student', 'Faculty/Staff', 'Visitor', 'Vendor/Contractor',
  'ADA/Accessible', 'Temporary', 'Reserved',
];

function nextPermitNumber() {
  const year = new Date().getFullYear();
  const prefix = `PERMIT-${year}-`;
  const latest = db.prepare(
    `SELECT permitNumber FROM parking_permits WHERE permitNumber LIKE ? ORDER BY permitNumber DESC LIMIT 1`
  ).get(`${prefix}%`);
  const parsed = latest ? parseInt(latest.permitNumber.split('-').pop(), 10) : NaN;
  const nextSeq = Number.isNaN(parsed) ? 1 : parsed + 1;
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

// GET /api/permits - list, optional personId/vehicleId/status/permitType filter
router.get('/', (req, res) => {
  sweepExpiredPermits();
  const { personId, vehicleId, status, permitType } = req.query;
  let sql = 'SELECT * FROM parking_permits WHERE 1=1';
  const params = [];
  if (personId) { sql += ' AND personId = ?'; params.push(personId); }
  if (vehicleId) { sql += ' AND vehicleId = ?'; params.push(vehicleId); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (permitType) { sql += ' AND permitType = ?'; params.push(permitType); }
  sql += ' ORDER BY issuedDate DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/permits/types -- so the UI doesn't hardcode this list separately
router.get('/types', (req, res) => res.json(PERMIT_TYPES));

// GET /api/permits/active-for-vehicle/:vehicleId
// Convenience lookup: does this vehicle have a currently-active permit?
// This is the fact that determines Citation's Administrative-vs-Court
// track eligibility per ECD §5(A) -- see routes/citations.js.
router.get('/active-for-vehicle/:vehicleId', (req, res) => {
  res.json(getActiveValidPermitForVehicle(req.params.vehicleId));
});

// GET /api/permits/:id
router.get('/:id', (req, res) => {
  sweepExpiredPermits();
  const p = db.prepare('SELECT * FROM parking_permits WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

// POST /api/permits
// Field set matches what Board Policy JHFD already requires the District
// to collect for student vehicle registration (valid driver's license,
// current vehicle registration, insurance/financial responsibility) plus
// standard campus-parking-system practice (permit type, assigned zone).
// Driver license number and insurance policy number are sensitive PII --
// same handling posture as DMV2U "Personal Information" elsewhere in this
// module (design doc §4.13) -- not encrypted at rest here yet (sql.js has
// no column-level encryption), which is worth flagging as a real gap
// before this goes anywhere near production data, not glossed over.
router.post('/', (req, res) => {
  try {
  if (!req.body.personId || !req.body.vehicleId) {
    return res.status(400).json({ error: 'personId and vehicleId are required.' });
  }
  const issuer = requireActiveStaff(req.body.issuedBy, 'issuedBy');
  const permitType = PERMIT_TYPES.includes(req.body.permitType) ? req.body.permitType : 'Student';
  // Permits are issued for the school year -- default the expiration to
  // the district's configured school-year end date unless the caller
  // explicitly provided one (e.g. a Temporary or Visitor permit
  // legitimately needing a shorter window). defaultExpirationDate()
  // returns null if no config exists yet or the configured date has
  // already lapsed, in which case explicit input is still required below.
  const explicitExpiration = req.body.expirationDate;
  const resolvedExpiration = explicitExpiration || defaultExpirationDate(getCurrentConfig());
  if (!resolvedExpiration) {
    return res.status(400).json({ error: 'expirationDate is required -- no school year end date is currently configured (or it has lapsed). Set one via /api/schoolYear first, or provide an explicit date.' });
  }
  const id = uuidv4();
  const now = new Date().toISOString();
  const data = {
    id,
    personId: req.body.personId,
    vehicleId: req.body.vehicleId,
    permitNumber: nextPermitNumber(),
    schoolSite: req.body.schoolSite || '',
    registrantName: req.body.registrantName || '',
    affiliateType: req.body.affiliateType || '',
    studentIdNumber: req.body.studentIdNumber || '',
    employeeIdNumber: req.body.employeeIdNumber || '',
    driverLicenseNumber: req.body.driverLicenseNumber || '',
    driverLicenseState: req.body.driverLicenseState || 'OR',
    insuranceCarrier: req.body.insuranceCarrier || '',
    insurancePolicyNumber: req.body.insurancePolicyNumber || '',
    insurancePolicyExpiration: req.body.insurancePolicyExpiration || null,
    ownershipInfo: req.body.ownershipInfo || '',
    permitType,
    parkingZone: req.body.parkingZone || '',
    issuedBy: issuer.id,
    issuedDate: req.body.issuedDate || now,
    expirationDate: resolvedExpiration || null,
    status: req.body.status || 'Active',
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(`
    INSERT INTO parking_permits (id, personId, vehicleId, permitNumber, schoolSite,
      registrantName, affiliateType, studentIdNumber, employeeIdNumber,
      driverLicenseNumber, driverLicenseState,
      insuranceCarrier, insurancePolicyNumber, insurancePolicyExpiration,
      ownershipInfo, permitType, parkingZone, issuedBy,
      issuedDate, expirationDate, status, createdAt, updatedAt)
    VALUES ($id, $personId, $vehicleId, $permitNumber, $schoolSite,
      $registrantName, $affiliateType, $studentIdNumber, $employeeIdNumber,
      $driverLicenseNumber, $driverLicenseState,
      $insuranceCarrier, $insurancePolicyNumber, $insurancePolicyExpiration,
      $ownershipInfo, $permitType, $parkingZone, $issuedBy,
      $issuedDate, $expirationDate, $status, $createdAt, $updatedAt)
  `).run(data);
  res.json({ id, permitNumber: data.permitNumber });
  } catch (err) {
    console.error('POST /api/permits failed:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal error issuing permit.', detail: err.message });
  }
});

// PATCH /api/permits/:id
router.patch('/:id', (req, res) => {
  const now = new Date().toISOString();
  const allowed = [
    'schoolSite', 'registrantName', 'affiliateType', 'studentIdNumber', 'employeeIdNumber',
    'driverLicenseNumber', 'driverLicenseState',
    'insuranceCarrier', 'insurancePolicyNumber', 'insurancePolicyExpiration',
    'ownershipInfo', 'permitType', 'parkingZone', 'expirationDate', 'status',
  ];
  const updates = [];
  const params = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates.push(`${key} = ?`);
      params.push(req.body[key]);
    }
  }
  if (!updates.length) return res.json({ ok: true });
  updates.push('updatedAt = ?');
  params.push(now, req.params.id);
  db.prepare(`UPDATE parking_permits SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

// POST /api/permits/:id/renew
// Renewal path -- previously nonexistent ("no renewal flow" was an
// explicitly flagged gap). Requires a real active Staff record and a new
// expirationDate; sets status back to Active regardless of current status
// (Expired -> renewed is the normal case, but also allows renewing an
// Active permit early). Records who renewed it, when, and what the prior
// expirationDate was, for audit purposes.
router.post('/:id/renew', (req, res) => {
  try {
    const permit = db.prepare('SELECT * FROM parking_permits WHERE id = ?').get(req.params.id);
    if (!permit) return res.status(404).json({ error: 'Not found' });
    if (permit.status === 'Revoked') {
      return res.status(400).json({ error: 'A revoked permit cannot be renewed -- issue a new permit instead.' });
    }
    // Renewals default to the configured school-year end date too, same
    // as issuance -- an admin renewing a batch of expired permits at the
    // start of a new year shouldn't have to type the same date in
    // repeatedly.
    const resolvedExpiration = req.body.expirationDate || defaultExpirationDate(getCurrentConfig());
    if (!resolvedExpiration) {
      return res.status(400).json({ error: 'expirationDate is required -- no school year end date is currently configured (or it has lapsed). Set one via /api/schoolYear first, or provide an explicit date.' });
    }
    const renewer = requireActiveStaff(req.body.renewedBy, 'renewedBy');
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE parking_permits SET status = 'Active', expirationDate = ?,
        renewedBy = ?, renewedAt = ?, previousExpirationDate = ?, updatedAt = ?
      WHERE id = ?
    `).run(resolvedExpiration, renewer.id, now, permit.expirationDate, now, req.params.id);
    res.json({ ok: true, expirationDate: resolvedExpiration });
  } catch (err) {
    console.error('POST /api/permits/:id/renew failed:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal error renewing permit.', detail: err.message });
  }
});

module.exports = router;
module.exports.getActiveValidPermitForVehicle = getActiveValidPermitForVehicle;
module.exports.sweepExpiredPermits = sweepExpiredPermits;
