// server/routes/vehicles.js
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

// GET /api/vehicles?search=  -- matches VIN or any plate on record
// (current or historical), same "one query fans out" pattern as persons.
router.get('/', (req, res) => {
  const { search } = req.query;
  let sql = 'SELECT DISTINCT v.* FROM vehicles v';
  const params = [];
  if (search) {
    sql += ' LEFT JOIN vehicle_registrations vr ON vr.vehicleId = v.id';
    sql += ' WHERE (v.vin LIKE ? OR vr.plate LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s);
  }
  sql += ' ORDER BY v.createdAt DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/vehicles/lookup?plate=X or ?vin=X -- the field-use single
// lookup. Checks current registrations for a plate match, or the vehicle
// table directly for a VIN match, and returns the full file either way.
router.get('/lookup', (req, res) => {
  const { plate, vin } = req.query;
  if (!plate && !vin) return res.status(400).json({ error: 'plate or vin is required.' });

  let vehicle = null;
  if (vin) {
    vehicle = db.prepare('SELECT * FROM vehicles WHERE vin = ?').get(vin);
  }
  if (!vehicle && plate) {
    const reg = db.prepare(`SELECT * FROM vehicle_registrations WHERE plate = ? ORDER BY effectiveFrom DESC LIMIT 1`).get(plate);
    if (reg) vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(reg.vehicleId);
  }
  if (!vehicle) return res.json({ found: false, vehicle: null });
  res.json({ found: true, vehicle: attachDetails(vehicle) });
});

router.get('/:id', (req, res) => {
  const v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Not found' });
  res.json(attachDetails(v));
});

// POST /api/vehicles -- creates the vehicle master record, optionally
// with an initial registration (plate/state) and initial ownership in
// the same call, since a vehicle is rarely entered without at least a
// plate known at the time.
router.post('/', (req, res) => {
  const { vin, make, model, year, color, plate, state, ownerPersonId, ownerRelationship } = req.body;
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO vehicles (id, vin, make, model, year, color, createdAt, updatedAt)
    VALUES ($id, $vin, $make, $model, $year, $color, $createdAt, $updatedAt)
  `).run({ id, vin: vin || '', make: make || '', model: model || '', year: year || '', color: color || '', createdAt: now, updatedAt: now });

  if (plate) {
    db.prepare(`
      INSERT INTO vehicle_registrations (id, vehicleId, plate, state, effectiveFrom, effectiveTo, createdAt)
      VALUES ($id, $vehicleId, $plate, $state, $effectiveFrom, NULL, $createdAt)
    `).run({ id: uuidv4(), vehicleId: id, plate, state: state || 'OR', effectiveFrom: todayDateString(), createdAt: now });
  }
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
