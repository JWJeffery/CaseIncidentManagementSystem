// server/routes/vehicles.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');

// GET /api/vehicles - list with optional plate/VIN search
router.get('/', (req, res) => {
  const { search } = req.query;
  let sql = 'SELECT * FROM vehicles WHERE 1=1';
  const params = [];
  if (search) {
    sql += ' AND (plate LIKE ? OR vin LIKE ? OR ownerPersonId LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  sql += ' ORDER BY createdAt DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/vehicles/lookup?query=... -- field-use search: matches a plate
// OR a permit number in one call, returns the vehicle plus its active
// permit (if any) in a single combined payload. Designed for the
// student-supervisor-with-a-phone use case: one search box, one round
// trip, small payload -- not "pull the whole dataset and filter
// client-side," which matters on a phone on a school Wi-Fi network.
// Must be declared before GET /:id or Express would swallow "/lookup"
// as an :id value.
router.get('/lookup', (req, res) => {
  const q = (req.query.query || '').trim();
  if (!q) return res.status(400).json({ error: 'query is required.' });

  // Try matching a permit number first (exact-ish, since permit numbers
  // are structured), then fall back to a plate search (partial match,
  // since an officer may only catch part of a plate or is unsure of exact
  // formatting).
  let vehicle = null;
  const byPermit = db.prepare(
    `SELECT v.* FROM vehicles v
     JOIN parking_permits p ON p.vehicleId = v.id
     WHERE p.permitNumber = ? ORDER BY p.issuedDate DESC LIMIT 1`
  ).get(q);
  if (byPermit) {
    vehicle = byPermit;
  } else {
    vehicle = db.prepare(`SELECT * FROM vehicles WHERE plate LIKE ? ORDER BY createdAt DESC LIMIT 1`).get(`%${q}%`);
  }

  if (!vehicle) {
    return res.json({ found: false, vehicle: null, permit: null });
  }

  const permit = db.prepare(
    `SELECT * FROM parking_permits WHERE vehicleId = ? AND status = 'Active' ORDER BY issuedDate DESC LIMIT 1`
  ).get(vehicle.id);

  res.json({ found: true, vehicle, permit: permit || null });
});

// GET /api/vehicles/:id
router.get('/:id', (req, res) => {
  const v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Not found' });
  res.json(v);
});

// POST /api/vehicles
router.post('/', (req, res) => {
  const id = uuidv4();
  const now = new Date().toISOString();
  const data = {
    id,
    plate: req.body.plate || '',
    state: req.body.state || 'OR',
    vin: req.body.vin || '',
    make: req.body.make || '',
    model: req.body.model || '',
    year: req.body.year || '',
    color: req.body.color || '',
    ownerPersonId: req.body.ownerPersonId || '',
    // Many student-driven vehicles are registered to a parent/guardian,
    // not the student -- JHFD's registration requirement is about the
    // vehicle's actual registered owner, which is frequently a different
    // person than the driver/registrant on the Permit. Captured here as
    // free text (name + relationship) since there's no shared Person
    // store yet for the owner to reference by ID.
    ownerName: req.body.ownerName || '',
    ownerRelationship: req.body.ownerRelationship || '',
    // Provenance split per design doc §4.10 -- self-reported (permit
    // application) vs. DMV-verified (a DMV2U query). Defaults to
    // self-reported; only a DMV query flips this via PATCH.
    selfReported: req.body.selfReported === false ? 0 : 1,
    dmvVerified: 0,
    dmvVerifiedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(`
    INSERT INTO vehicles (id, plate, state, vin, make, model, year, color,
      ownerPersonId, ownerName, ownerRelationship,
      selfReported, dmvVerified, dmvVerifiedAt, createdAt, updatedAt)
    VALUES ($id, $plate, $state, $vin, $make, $model, $year, $color,
      $ownerPersonId, $ownerName, $ownerRelationship,
      $selfReported, $dmvVerified, $dmvVerifiedAt, $createdAt, $updatedAt)
  `).run(data);
  res.json({ id });
});

// PATCH /api/vehicles/:id
// Includes the DMV-verification fields -- a caller marking a vehicle
// DMV-verified should be doing so because a DMV Query Log entry exists to
// justify it (not enforced here at the DB layer; see design doc §4.13's
// note that every DMV2U inquiry must be documented).
router.patch('/:id', (req, res) => {
  const now = new Date().toISOString();
  const allowed = ['plate', 'state', 'vin', 'make', 'model', 'year', 'color',
    'ownerPersonId', 'ownerName', 'ownerRelationship',
    'selfReported', 'dmvVerified', 'dmvVerifiedAt'];
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
  db.prepare(`UPDATE vehicles SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

module.exports = router;
