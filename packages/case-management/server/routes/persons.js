// server/routes/persons.js
//
// Person biographic data (name, DOB, sex, race, physical descriptors)
// now lives in packages/identity -- this file proxies to it instead of
// owning a local persons table. See db.js's comment above
// person_local_info for why personType/phone/address/city/state/zip/
// notes stay local rather than moving to Identity, and this file's
// header for why idType/idNumber map onto Identity's person_identifiers
// instead of being duplicated as flat columns.
//
// The response shape returned to case-management's own frontend is
// FLATTENED back to the exact shape the frontend already expected
// (firstName/lastName/phone/address/... directly on the object, aliases
// as a single joined string, idType/idNumber as flat fields) -- same
// deliberate minimal-churn choice made for parking's Vehicle proxy.
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { identityFetch } = require('@fgsd/shared');

function getLocalInfo(identityPersonId) {
  return db.prepare('SELECT * FROM person_local_info WHERE identityPersonId = ?').get(identityPersonId) || {
    personType: null, phone: null, address: null, city: null, state: null, zip: null, notes: null,
  };
}

// Flattens an identity-service person (list-shape OR detail-shape) plus
// its local_info row into the flat shape case-management's frontend
// expects. aliases and idType/idNumber are only present on IDENTITY'S
// DETAIL fetch (GET /:id, which includes nested aliases[]/identifiers[]
// arrays) -- list-shape results (used for search/roster views) don't
// carry them, since attaching full alias/identifier history to every row
// of a list would mean N+1 queries identity-side for no real benefit to
// a list view. Only single-person detail views (the Exclusion Notice
// subject, an "edit person" view) need the full picture.
function flatten(p) {
  const local = getLocalInfo(p.id);
  const aliases = (p.aliases || []).map(a => a.aliasName).join(', ');
  const firstIdentifier = (p.identifiers || [])[0];
  return {
    id: p.id,
    personType: local.personType || '',
    firstName: p.firstName || '', middleName: p.middleName || '', lastName: p.lastName || '',
    aliases,
    phone: local.phone || '', address: local.address || '', city: local.city || '',
    state: local.state || '', zip: local.zip || '',
    dob: p.dob || '',
    idType: firstIdentifier ? firstIdentifier.identifierType : '',
    idNumber: firstIdentifier ? firstIdentifier.identifierValue : '',
    sex: p.sex || '', race: p.race || '',
    height: p.height || '', weight: p.weight || '', hair: p.hairColor || '', eyes: p.eyeColor || '',
    notes: local.notes || '',
    createdAt: p.createdAt, updatedAt: p.updatedAt,
  };
}

// GET /api/persons/search?q=
// Proxies to Identity's name/alias/identifier search AND separately
// checks local phone numbers (Identity has no concept of phone) --
// merges both hit sets so search behaves the same as it did when phone
// was a column on the same local table it searched by name.
router.get('/search', async (req, res) => {
  try {
    const q = req.query.q || '';
    const [byIdentity, localPhoneMatches] = await Promise.all([
      q ? identityFetch(`/api/persons?search=${encodeURIComponent(q)}`) : Promise.resolve([]),
      Promise.resolve(db.prepare('SELECT identityPersonId FROM person_local_info WHERE phone LIKE ?').all(`%${q}%`)),
    ]);
    const identityIds = new Set(byIdentity.map(p => p.id));
    const phoneOnlyIds = localPhoneMatches.map(r => r.identityPersonId).filter(id => !identityIds.has(id));
    const phoneMatchedPersons = phoneOnlyIds.length
      ? await identityFetch(`/api/persons?ids=${phoneOnlyIds.join(',')}`)
      : [];
    const merged = [...byIdentity, ...phoneMatchedPersons].slice(0, 20);
    res.json(merged.map(flatten));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET /api/persons/case/:caseId
// case_persons (role, personId) is purely local -- batch-fetches the
// actual person records from Identity in one call rather than N+1.
router.get('/case/:caseId', async (req, res) => {
  try {
    const links = db.prepare(`SELECT * FROM case_persons WHERE caseId = ? ORDER BY role`).all(req.params.caseId);
    if (!links.length) return res.json([]);
    const ids = [...new Set(links.map(l => l.personId))];
    const people = await identityFetch(`/api/persons?ids=${ids.join(',')}`);
    const byId = new Map(people.map(p => [p.id, p]));
    const merged = links
      .map(link => {
        const p = byId.get(link.personId);
        if (!p) return null; // person id doesn't resolve (deleted upstream, etc.) -- skip rather than crash
        return { ...flatten(p), role: link.role, casepersonId: link.id };
      })
      .filter(Boolean)
      .sort((a, b) => (a.role > b.role ? 1 : -1) || (a.lastName > b.lastName ? 1 : -1));
    res.json(merged);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET /api/persons/:id -- full detail, including aliases/identifiers
router.get('/:id', async (req, res) => {
  try {
    const p = await identityFetch(`/api/persons/${req.params.id}`);
    res.json(flatten(p));
  } catch (err) {
    res.status(err.statusCode || 404).json({ error: err.message });
  }
});

// POST /api/persons - create person
// Creates the biographic record in Identity; if idType+idNumber were
// given, adds it as an Identity identifier (not a flat duplicate column);
// if a comma-separated aliases string was given, creates one Identity
// alias row per name (aliasType defaults to 'Other' -- the old free-text
// field never captured alias type, so there's nothing more specific to
// preserve); then records the case-management-local fields
// (personType/phone/address/city/state/zip/notes) in person_local_info.
router.post('/', async (req, res) => {
  try {
    const created = await identityFetch('/api/persons', {
      method: 'POST',
      body: JSON.stringify({
        lastName: req.body.lastName, firstName: req.body.firstName, middleName: req.body.middleName,
        dob: req.body.dob, sex: req.body.sex, race: req.body.race,
        height: req.body.height, weight: req.body.weight,
        hairColor: req.body.hair, eyeColor: req.body.eyes,
      }),
    });
    const id = created.id;

    if (req.body.idType && req.body.idNumber) {
      await identityFetch(`/api/persons/${id}/identifiers`, {
        method: 'POST',
        body: JSON.stringify({ identifierType: req.body.idType, identifierValue: req.body.idNumber }),
      });
    }
    if (req.body.aliases) {
      const names = req.body.aliases.split(',').map(s => s.trim()).filter(Boolean);
      for (const aliasName of names) {
        await identityFetch(`/api/persons/${id}/aliases`, {
          method: 'POST',
          body: JSON.stringify({ aliasName, aliasType: 'Other' }),
        });
      }
    }

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO person_local_info (identityPersonId, personType, phone, address, city, state, zip, notes, createdAt, updatedAt)
      VALUES ($id, $personType, $phone, $address, $city, $state, $zip, $notes, $now, $now)
    `).run({
      id, personType: req.body.personType || '', phone: req.body.phone || '', address: req.body.address || '',
      city: req.body.city || '', state: req.body.state || '', zip: req.body.zip || '', notes: req.body.notes || '', now,
    });
    res.json({ id });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// POST /api/persons/link - link person to case (purely local, unchanged)
router.post('/link', (req, res) => {
  const id = uuidv4();
  db.prepare(`INSERT INTO case_persons (id, caseId, personId, role) VALUES (?, ?, ?, ?)`)
    .run(id, req.body.caseId, req.body.personId, req.body.role);
  res.json({ id });
});

// DELETE /api/case-persons/:id (purely local, unchanged)
router.delete('/link/:id', (req, res) => {
  db.prepare('DELETE FROM case_persons WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
module.exports.flatten = flatten;
