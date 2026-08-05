// server/routes/vehicles.js
//
// Plate-first, not VIN-first. Earlier framing of this file described
// the Vehicle file as "anchored on VIN" -- Josh's correction, and the
// right one: VINs are 17 characters, cumbersome to read or type in the
// field, and not what an officer is actually looking at on a parked
// car. Real LE practice backs this up too -- plate is what gets queried
// live in the field; VIN mostly matters once you're already standing at
// the vehicle checking its dash/door-jamb plate. Plate is now required
// at vehicle creation; VIN is optional supplementary data.
//
// The underlying schema (vehicles + vehicle_registrations as a separate,
// time-bound history table) is UNCHANGED and still earns its keep: a
// vehicle's plate can legitimately change (sold, replated, personalized
// plate purchased), and that history stays queryable rather than being
// silently overwritten -- see the /lookup route, which still finds a
// vehicle by an OLD plate, not just its current one. What changed is
// which field the everyday workflow (search, create, list) treats as
// primary, not whether history is tracked.
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { findCurrent, todayDateString } = require('../effectiveDating');

function attachDetails(vehicle) {
  if (!vehicle) return null;
  const registrations = db.prepare('SELECT * FROM vehicle_registrations WHERE vehicleId = ? ORDER BY effectiveFrom DESC').all(vehicle.id);
  const ownership = db.prepare('SELECT * FROM vehicle_ownership WHERE vehicleId = ? ORDER BY effectiveFrom DESC').all(vehicle.id);
  const currentRegistration = findCurrent(registrations);
  const currentOwnership = findCurrent(ownership);
  let currentOwner = null;
  if (currentOwnership) {
    currentOwner = db.prepare('SELECT id, lastName, firstName, personType FROM persons WHERE id = ?').get(currentOwnership.personId) || null;
  }
  return { ...vehicle, registrations, ownership, currentRegistration, currentOwner };
}

// GET /api/vehicles?search=  -- matches plate (current or historical) OR
// VIN, but the list itself surfaces each vehicle's CURRENT plate/state
// directly (via a correlated subquery) so the UI can show what an
// officer actually cares about without an extra per-row detail fetch.
router.get('/', (req, res) => {
  const { search } = req.query;
  let sql = `
    SELECT v.*,
      (SELECT plate FROM vehicle_registrations WHERE vehicleId = v.id AND effectiveTo IS NULL ORDER BY effectiveFrom DESC LIMIT 1) AS currentPlate,
      (SELECT state FROM vehicle_registrations WHERE vehicleId = v.id AND effectiveTo IS NULL ORDER BY effectiveFrom DESC LIMIT 1) AS currentState
    FROM vehicles v
  `;
  const params = [];
  if (search) {
    sql += ` WHERE v.id IN (SELECT vehicleId FROM vehicle_registrations WHERE plate LIKE ?) OR v.vin LIKE ?`;
    const s = `%${search}%`;
    params.push(s, s);
  }
  sql += ' ORDER BY v.createdAt DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/vehicles/lookup?plate=X or ?vin=X -- the field-use single
// lookup. Checks plate FIRST (the common case -- an officer has a plate,
// not a VIN), falls back to VIN only if plate wasn't provided or didn't
// match. Matches on plate check the full registration history, not just
// the current one, so an old/reassigned plate still resolves correctly.
router.get('/lookup', (req, res) => {
  const { plate, vin } = req.query;
  if (!plate && !vin) return res.status(400).json({ error: 'plate or vin is required.' });

  let vehicle = null;
  if (plate) {
    const reg = db.prepare(`SELECT * FROM vehicle_registrations WHERE plate = ? ORDER BY effectiveFrom DESC LIMIT 1`).get(plate);
    if (reg) vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(reg.vehicleId);
  }
  if (!vehicle && vin) {
    vehicle = db.prepare('SELECT * FROM vehicles WHERE vin = ?').get(vin);
  }
  if (!vehicle) return res.json({ found: false, vehicle: null });
  res.json({ found: true, vehicle: attachDetails(vehicle) });
});

router.get('/:id', (req, res) => {
  const v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Not found' });
  res.json(attachDetails(v));
});

// POST /api/vehicles -- creates the vehicle master record. plate is now
// REQUIRED (you always see a plate before you know a VIN, in practice);
// VIN is optional. Ownership can be attached in the same call since a
// vehicle is rarely entered without knowing who it belongs to at the
// time.
router.post('/', (req, res) => {
  const { vin, make, model, year, color, plate, state, ownerPersonId, ownerRelationship } = req.body;
  if (!plate) {
    return res.status(400).json({ error: 'plate is required. (VIN is optional -- add it later if/when it becomes known, e.g. during a proper vehicle inspection.)' });
  }
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO vehicles (id, vin, make, model, year, color, createdAt, updatedAt)
    VALUES ($id, $vin, $make, $model, $year, $color, $createdAt, $updatedAt)
  `).run({ id, vin: vin || '', make: make || '', model: model || '', year: year || '', color: color || '', createdAt: now, updatedAt: now });

  db.prepare(`
    INSERT INTO vehicle_registrations (id, vehicleId, plate, state, effectiveFrom, effectiveTo, createdAt)
    VALUES ($id, $vehicleId, $plate, $state, $effectiveFrom, NULL, $createdAt)
  `).run({ id: uuidv4(), vehicleId: id, plate, state: state || 'OR', effectiveFrom: todayDateString(), createdAt: now });

  if (ownerPersonId) {
    const person = db.prepare('SELECT id FROM persons WHERE id = ?').get(ownerPersonId);
    if (!person) return res.status(400).json({ error: `ownerPersonId "${ownerPersonId}" does not match any person on file.` });
    db.prepare(`
      INSERT INTO vehicle_ownership (id, vehicleId, personId, relationship, effectiveFrom, effectiveTo, createdAt)
      VALUES ($id, $vehicleId, $personId, $relationship, $effectiveFrom, NULL, $createdAt)
    `).run({ id: uuidv4(), vehicleId: id, personId: ownerPersonId, relationship: ownerRelationship || 'Self', effectiveFrom: todayDateString(), createdAt: now });
  }
  res.json({ id });
});

// POST /api/vehicles/:id/registrations -- new plate/state registration.
// Closes out whatever the current one is (sets its effectiveTo to
// yesterday) before opening the new one, so there is never more than one
// "current" registration and the full plate history is preserved, not
// overwritten.
router.post('/:id/registrations', (req, res) => {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'Not found' });
  if (!req.body.plate) return res.status(400).json({ error: 'plate is required.' });

  const now = new Date().toISOString();
  const today = todayDateString();
  const registrations = db.prepare('SELECT * FROM vehicle_registrations WHERE vehicleId = ?').all(req.params.id);
  const current = findCurrent(registrations, today);
  if (current) {
    const yesterday = new Date(new Date(today + 'T00:00:00.000Z').getTime() - 86400000).toISOString().slice(0, 10);
    db.prepare('UPDATE vehicle_registrations SET effectiveTo = ? WHERE id = ?').run(yesterday, current.id);
  }
  const id = uuidv4();
  db.prepare(`
    INSERT INTO vehicle_registrations (id, vehicleId, plate, state, effectiveFrom, effectiveTo, createdAt)
    VALUES ($id, $vehicleId, $plate, $state, $effectiveFrom, NULL, $createdAt)
  `).run({ id, vehicleId: req.params.id, plate: req.body.plate, state: req.body.state || 'OR', effectiveFrom: today, createdAt: now });
  res.json({ id });
});

// POST /api/vehicles/:id/ownership -- same close-out-then-open pattern
// for a change of owner.
router.post('/:id/ownership', (req, res) => {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'Not found' });
  if (!req.body.personId) return res.status(400).json({ error: 'personId is required.' });
  const person = db.prepare('SELECT id FROM persons WHERE id = ?').get(req.body.personId);
  if (!person) return res.status(400).json({ error: `personId "${req.body.personId}" does not match any person on file.` });

  const now = new Date().toISOString();
  const today = todayDateString();
  const ownership = db.prepare('SELECT * FROM vehicle_ownership WHERE vehicleId = ?').all(req.params.id);
  const current = findCurrent(ownership, today);
  if (current) {
    const yesterday = new Date(new Date(today + 'T00:00:00.000Z').getTime() - 86400000).toISOString().slice(0, 10);
    db.prepare('UPDATE vehicle_ownership SET effectiveTo = ? WHERE id = ?').run(yesterday, current.id);
  }
  const id = uuidv4();
  db.prepare(`
    INSERT INTO vehicle_ownership (id, vehicleId, personId, relationship, effectiveFrom, effectiveTo, createdAt)
    VALUES ($id, $vehicleId, $personId, $relationship, $effectiveFrom, NULL, $createdAt)
  `).run({ id, vehicleId: req.params.id, personId: req.body.personId, relationship: req.body.relationship || 'Self', effectiveFrom: today, createdAt: now });
  res.json({ id });
});

router.patch('/:id', (req, res) => {
  const now = new Date().toISOString();
  const allowed = ['vin', 'make', 'model', 'year', 'color'];
  const updates = [];
  const params = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) { updates.push(`${key} = ?`); params.push(req.body[key]); }
  }
  if (!updates.length) return res.json({ ok: true });
  updates.push('updatedAt = ?');
  params.push(now, req.params.id);
  db.prepare(`UPDATE vehicles SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

module.exports = router;
