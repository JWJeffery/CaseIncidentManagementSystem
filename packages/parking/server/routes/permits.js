// server/routes/permits.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');

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

// GET /api/permits - list, optional personId/vehicleId/status filter
router.get('/', (req, res) => {
  const { personId, vehicleId, status } = req.query;
  let sql = 'SELECT * FROM parking_permits WHERE 1=1';
  const params = [];
  if (personId) { sql += ' AND personId = ?'; params.push(personId); }
  if (vehicleId) { sql += ' AND vehicleId = ?'; params.push(vehicleId); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY issuedDate DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/permits/active-for-vehicle/:vehicleId
// Convenience lookup: does this vehicle have a currently-active permit?
// This is the fact that determines Citation's Administrative-vs-Court
// track eligibility per ECD §5(A) -- see routes/citations.js.
router.get('/active-for-vehicle/:vehicleId', (req, res) => {
  const permit = db.prepare(
    `SELECT * FROM parking_permits WHERE vehicleId = ? AND status = 'Active' ORDER BY issuedDate DESC LIMIT 1`
  ).get(req.params.vehicleId);
  res.json(permit || null);
});

// GET /api/permits/:id
router.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM parking_permits WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

// POST /api/permits
router.post('/', (req, res) => {
  if (!req.body.personId || !req.body.vehicleId) {
    return res.status(400).json({ error: 'personId and vehicleId are required.' });
  }
  const id = uuidv4();
  const now = new Date().toISOString();
  const data = {
    id,
    personId: req.body.personId,
    vehicleId: req.body.vehicleId,
    permitNumber: nextPermitNumber(),
    schoolSite: req.body.schoolSite || '',
    insuranceInfo: req.body.insuranceInfo || '',
    ownershipInfo: req.body.ownershipInfo || '',
    issuedDate: req.body.issuedDate || now,
    expirationDate: req.body.expirationDate || null,
    status: req.body.status || 'Active',
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(`
    INSERT INTO parking_permits (id, personId, vehicleId, permitNumber, schoolSite,
      insuranceInfo, ownershipInfo, issuedDate, expirationDate, status, createdAt, updatedAt)
    VALUES ($id, $personId, $vehicleId, $permitNumber, $schoolSite,
      $insuranceInfo, $ownershipInfo, $issuedDate, $expirationDate, $status, $createdAt, $updatedAt)
  `).run(data);
  res.json({ id, permitNumber: data.permitNumber });
});

// PATCH /api/permits/:id
router.patch('/:id', (req, res) => {
  const now = new Date().toISOString();
  const allowed = ['schoolSite', 'insuranceInfo', 'ownershipInfo', 'expirationDate', 'status'];
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

module.exports = router;
