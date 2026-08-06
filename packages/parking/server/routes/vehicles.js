// server/routes/vehicles.js
//
// PHASE 2: this file no longer owns vehicle master data. It proxies to
// the Identity Service (packages/identity) for everything about "what
// is this vehicle, what's its plate, who owns it" -- and merges in only
// the data that's genuinely parking's own concern (DMV2U verification
// status, who locally entered a vehicle) from the local
// vehicle_dmv_status table. See @fgsd/shared/src/identityClient.js and
// RESUME_PROJECT_NOTE.md for the full Phase 1/Phase 2 story.
//
// The response shape returned to parking's own frontend is deliberately
// FLATTENED back to the shape the frontend already expected before this
// change (plate, state, ownerName, ownerRelationship directly on the
// vehicle object, not nested under currentRegistration/currentOwner) --
// this was a real design choice to minimize churn: the frontend barely
// had to change, because the external contract of parking's own
// /api/vehicles endpoints didn't change, only what's behind them did.
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { requireActiveStaff } = require('./staff');
const { identityFetch } = require('@fgsd/shared');
const { getActiveValidPermitForVehicle } = require('./permits');

function getDmvStatus(identityVehicleId) {
  return db.prepare('SELECT * FROM vehicle_dmv_status WHERE identityVehicleId = ?').get(identityVehicleId) || {
    selfReported: 1, dmvVerified: 0, dmvVerifiedAt: null, enteredBy: null,
  };
}

// Flattens an identity-service vehicle (list-shape OR detail-shape) plus
// its local DMV status row into the shape parking's frontend expects.
// Handles both shapes because the list endpoint returns
// currentPlate/currentOwnerLastName etc. directly (from a correlated
// subquery), while the detail endpoint returns nested
// currentRegistration/currentOwnership/currentOwner objects -- this
// function normalizes either into the same flat output.
function flatten(v) {
  const dmv = getDmvStatus(v.id);
  const plate = v.currentPlate !== undefined ? v.currentPlate : (v.currentRegistration ? v.currentRegistration.plate : null);
  const state = v.currentState !== undefined ? v.currentState : (v.currentRegistration ? v.currentRegistration.state : null);
  const ownerRelationship = v.currentOwnerRelationship !== undefined ? v.currentOwnerRelationship : (v.currentOwnership ? v.currentOwnership.relationship : null);
  const ownerLastName = v.currentOwnerLastName !== undefined ? v.currentOwnerLastName : (v.currentOwner ? v.currentOwner.lastName : null);
  const ownerFirstName = v.currentOwnerFirstName !== undefined ? v.currentOwnerFirstName : (v.currentOwner ? v.currentOwner.firstName : null);
  const ownerName = (ownerLastName || ownerFirstName) ? `${ownerLastName || ''}, ${ownerFirstName || ''}`.replace(/^, /, '').replace(/, $/, '') : '';
  return {
    id: v.id, plate: plate || '', state: state || '', vin: v.vin || '',
    make: v.make || '', model: v.model || '', year: v.year || '', color: v.color || '',
    ownerName, ownerRelationship: ownerRelationship || '',
    selfReported: dmv.selfReported, dmvVerified: dmv.dmvVerified, dmvVerifiedAt: dmv.dmvVerifiedAt,
    enteredBy: dmv.enteredBy, createdAt: v.createdAt, updatedAt: v.updatedAt,
  };
}

// GET /api/vehicles - list with optional plate/VIN search, proxied
router.get('/', async (req, res) => {
  try {
    const qs = req.query.search ? `?search=${encodeURIComponent(req.query.search)}` : '';
    const vehicles = await identityFetch(`/api/vehicles${qs}`);
    res.json(vehicles.map(flatten));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET /api/vehicles/lookup?query=... -- field-use search: matches a
// plate OR a permit number. Plate lookups now proxy to identity (which
// itself checks plate history, so an old/reassigned plate still
// resolves); permit-number lookups stay local, since permits are
// parking's own data, not identity's -- look up the permit locally to
// find its vehicleId, then fetch that vehicle's current file from
// identity.
router.get('/lookup', async (req, res) => {
  try {
    const q = (req.query.query || '').trim();
    if (!q) return res.status(400).json({ error: 'query is required.' });

    // Try matching a permit number locally first (parking's own data).
    const byPermit = db.prepare(
      `SELECT vehicleId FROM parking_permits WHERE permitNumber = ? ORDER BY issuedDate DESC LIMIT 1`
    ).get(q);

    let identityVehicle = null;
    if (byPermit) {
      identityVehicle = await identityFetch(`/api/vehicles/${byPermit.vehicleId}`).catch(() => null);
    }
    if (!identityVehicle) {
      const lookupResult = await identityFetch(`/api/vehicles/lookup?plate=${encodeURIComponent(q)}`);
      identityVehicle = lookupResult.found ? lookupResult.vehicle : null;
    }

    if (!identityVehicle) {
      return res.json({ found: false, vehicle: null, permit: null });
    }

    const vehicle = flatten(identityVehicle);
    const permit = getActiveValidPermitForVehicle(identityVehicle.id);
    res.json({ found: true, vehicle, permit: permit || null });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET /api/vehicles/:id
router.get('/:id', async (req, res) => {
  try {
    const v = await identityFetch(`/api/vehicles/${req.params.id}`);
    res.json(flatten(v));
  } catch (err) {
    res.status(err.statusCode || 404).json({ error: err.message });
  }
});

// POST /api/vehicles -- creates the vehicle in the Identity Service
// (plate is required there too, per that service's own plate-first
// design), then records local DMV-status fields (selfReported,
// enteredBy) in vehicle_dmv_status keyed by the new identity vehicle id.
//
// NOTE: the old free-text ownerName/ownerRelationship fields are GONE
// from this form -- ownership is now a real identity-service concept
// requiring an actual Person record (ownerPersonId), which most callers
// won't have yet since Person wiring (Phase 2, part 2) hasn't happened.
// That's an intentional, honest consequence of Phase 2 vehicle wiring,
// not an oversight: a vehicle can be added without an owner set, same as
// it always could, but "owner" can no longer be a free-text string once
// there's a real Person file it should be pointing at instead.
router.post('/', async (req, res) => {
  try {
    const enteredBy = req.body.enteredBy ? requireActiveStaff(req.body.enteredBy, 'enteredBy').id : null;
    const created = await identityFetch('/api/vehicles', {
      method: 'POST',
      body: JSON.stringify({
        plate: req.body.plate, state: req.body.state || 'OR', vin: req.body.vin || '',
        make: req.body.make || '', model: req.body.model || '', year: req.body.year || '', color: req.body.color || '',
        ownerPersonId: req.body.ownerPersonId || undefined,
      }),
    });
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO vehicle_dmv_status (identityVehicleId, selfReported, dmvVerified, dmvVerifiedAt, enteredBy, createdAt, updatedAt)
      VALUES ($identityVehicleId, $selfReported, 0, NULL, $enteredBy, $createdAt, $updatedAt)
    `).run({
      identityVehicleId: created.id, selfReported: req.body.selfReported === false ? 0 : 1,
      enteredBy, createdAt: now, updatedAt: now,
    });
    res.json({ id: created.id });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// PATCH /api/vehicles/:id -- routes each field to the right place: a
// plate change goes through identity's registration-history endpoint
// (not a raw overwrite -- preserves history, per that service's design);
// make/model/year/color/vin go through identity's own PATCH; DMV-status
// fields (dmvVerified, dmvVerifiedAt, selfReported) update the local
// vehicle_dmv_status row. A single call can touch more than one of these
// at once.
router.patch('/:id', async (req, res) => {
  try {
    if (req.body.plate) {
      await identityFetch(`/api/vehicles/${req.params.id}/registrations`, {
        method: 'POST',
        body: JSON.stringify({ plate: req.body.plate, state: req.body.state || 'OR' }),
      });
    }
    const identityFields = {};
    for (const key of ['vin', 'make', 'model', 'year', 'color']) {
      if (req.body[key] !== undefined) identityFields[key] = req.body[key];
    }
    if (Object.keys(identityFields).length) {
      await identityFetch(`/api/vehicles/${req.params.id}`, { method: 'PATCH', body: JSON.stringify(identityFields) });
    }

    const dmvFields = {};
    const now = new Date().toISOString();
    for (const key of ['selfReported', 'dmvVerified', 'dmvVerifiedAt']) {
      if (req.body[key] !== undefined) dmvFields[key] = req.body[key];
    }
    if (Object.keys(dmvFields).length) {
      const existing = db.prepare('SELECT * FROM vehicle_dmv_status WHERE identityVehicleId = ?').get(req.params.id);
      if (existing) {
        const sets = Object.keys(dmvFields).map(k => `${k} = ?`).join(', ');
        db.prepare(`UPDATE vehicle_dmv_status SET ${sets}, updatedAt = ? WHERE identityVehicleId = ?`)
          .run(...Object.values(dmvFields), now, req.params.id);
      } else {
        db.prepare(`
          INSERT INTO vehicle_dmv_status (identityVehicleId, selfReported, dmvVerified, dmvVerifiedAt, enteredBy, createdAt, updatedAt)
          VALUES ($id, $selfReported, $dmvVerified, $dmvVerifiedAt, NULL, $now, $now)
        `).run({ id: req.params.id, selfReported: dmvFields.selfReported ?? 1, dmvVerified: dmvFields.dmvVerified ?? 0, dmvVerifiedAt: dmvFields.dmvVerifiedAt ?? null, now });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.flatten = flatten;
