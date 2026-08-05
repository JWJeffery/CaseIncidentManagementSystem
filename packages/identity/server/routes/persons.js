// server/routes/persons.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');

const PERSON_TYPES = ['Student', 'Staff', 'Volunteer', 'Visitor', 'Other'];
const IDENTIFIER_TYPES = ['SIS ID', 'Driver License', 'State ID', 'Other'];
const ALIAS_TYPES = ['Nickname', 'Maiden Name', 'Previous Legal Name', 'Other'];

function attachDetails(person) {
  if (!person) return null;
  const aliases = db.prepare('SELECT * FROM person_aliases WHERE personId = ? ORDER BY createdAt DESC').all(person.id);
  const identifiers = db.prepare('SELECT * FROM person_identifiers WHERE personId = ? ORDER BY createdAt DESC').all(person.id);
  return { ...person, aliases, identifiers };
}

// GET /api/persons?search=&personType=
// search matches last/first name or any alias or any identifier value --
// the "one query fans out across everything on file" pattern.
router.get('/', (req, res) => {
  const { search, personType } = req.query;
  let sql = 'SELECT DISTINCT p.* FROM persons p';
  const params = [];
  const where = [];
  if (search) {
    sql += ` LEFT JOIN person_aliases pa ON pa.personId = p.id
             LEFT JOIN person_identifiers pi ON pi.personId = p.id`;
    where.push(`(p.lastName LIKE ? OR p.firstName LIKE ? OR pa.aliasName LIKE ? OR pi.identifierValue LIKE ?)`);
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  if (personType) { where.push('p.personType = ?'); params.push(personType); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY p.lastName, p.firstName';
  res.json(db.prepare(sql).all(...params));
});

router.get('/types', (req, res) => res.json({ personTypes: PERSON_TYPES, identifierTypes: IDENTIFIER_TYPES, aliasTypes: ALIAS_TYPES }));

// GET /api/persons/:id -- full "file": core record + aliases + identifiers
router.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM persons WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(attachDetails(p));
});

router.post('/', (req, res) => {
  if (!req.body.lastName || !req.body.firstName) {
    return res.status(400).json({ error: 'lastName and firstName are required.' });
  }
  const personType = PERSON_TYPES.includes(req.body.personType) ? req.body.personType : 'Other';
  const id = uuidv4();
  const now = new Date().toISOString();
  const data = {
    id, lastName: req.body.lastName, firstName: req.body.firstName, middleName: req.body.middleName || '',
    dob: req.body.dob || null, sex: req.body.sex || '', race: req.body.race || '',
    height: req.body.height || '', weight: req.body.weight || '', hairColor: req.body.hairColor || '', eyeColor: req.body.eyeColor || '',
    personType, primarySchoolSite: req.body.primarySchoolSite || null,
    synergyImportId: req.body.synergyImportId || null, importedAt: req.body.synergyImportId ? now : null,
    createdAt: now, updatedAt: now,
  };
  db.prepare(`
    INSERT INTO persons (id, lastName, firstName, middleName, dob, sex, race, height, weight, hairColor, eyeColor,
      personType, primarySchoolSite, synergyImportId, importedAt, createdAt, updatedAt)
    VALUES ($id, $lastName, $firstName, $middleName, $dob, $sex, $race, $height, $weight, $hairColor, $eyeColor,
      $personType, $primarySchoolSite, $synergyImportId, $importedAt, $createdAt, $updatedAt)
  `).run(data);
  res.json({ id });
});

router.patch('/:id', (req, res) => {
  const now = new Date().toISOString();
  const allowed = ['lastName', 'firstName', 'middleName', 'dob', 'sex', 'race', 'height', 'weight',
    'hairColor', 'eyeColor', 'personType', 'primarySchoolSite'];
  const updates = [];
  const params = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) { updates.push(`${key} = ?`); params.push(req.body[key]); }
  }
  if (!updates.length) return res.json({ ok: true });
  updates.push('updatedAt = ?');
  params.push(now, req.params.id);
  db.prepare(`UPDATE persons SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

// POST /api/persons/:id/aliases -- a real person can have more than one
// name on file (maiden, nickname, previous legal name).
router.post('/:id/aliases', (req, res) => {
  const person = db.prepare('SELECT id FROM persons WHERE id = ?').get(req.params.id);
  if (!person) return res.status(404).json({ error: 'Not found' });
  if (!req.body.aliasName) return res.status(400).json({ error: 'aliasName is required.' });
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO person_aliases (id, personId, aliasName, aliasType, createdAt) VALUES ($id, $personId, $aliasName, $aliasType, $createdAt)`)
    .run({ id, personId: req.params.id, aliasName: req.body.aliasName, aliasType: ALIAS_TYPES.includes(req.body.aliasType) ? req.body.aliasType : 'Other', createdAt: now });
  res.json({ id });
});

// POST /api/persons/:id/identifiers
router.post('/:id/identifiers', (req, res) => {
  const person = db.prepare('SELECT id FROM persons WHERE id = ?').get(req.params.id);
  if (!person) return res.status(404).json({ error: 'Not found' });
  if (!req.body.identifierType || !req.body.identifierValue) {
    return res.status(400).json({ error: 'identifierType and identifierValue are required.' });
  }
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO person_identifiers (id, personId, identifierType, identifierValue, issuingState, verified, verifiedBy, verifiedAt, createdAt)
    VALUES ($id, $personId, $identifierType, $identifierValue, $issuingState, 0, NULL, NULL, $createdAt)
  `).run({
    id, personId: req.params.id, identifierType: req.body.identifierType, identifierValue: req.body.identifierValue,
    issuingState: req.body.issuingState || null, createdAt: now,
  });
  res.json({ id });
});

// POST /api/persons/:id/identifiers/:identifierId/verify
// verifiedBy is free text for now, not validated against a Staff roster
// -- this service doesn't know about parking's Staff table yet, and
// wiring that cross-service relationship is Phase 2 work (deciding how
// identity and auth/staff relate to each other), not assumed here.
router.post('/:id/identifiers/:identifierId/verify', (req, res) => {
  const identifier = db.prepare('SELECT * FROM person_identifiers WHERE id = ? AND personId = ?').get(req.params.identifierId, req.params.id);
  if (!identifier) return res.status(404).json({ error: 'Not found' });
  if (!req.body.verifiedBy) return res.status(400).json({ error: 'verifiedBy is required.' });
  const now = new Date().toISOString();
  db.prepare(`UPDATE person_identifiers SET verified = 1, verifiedBy = ?, verifiedAt = ? WHERE id = ?`)
    .run(req.body.verifiedBy, now, req.params.identifierId);
  res.json({ ok: true });
});

module.exports = router;
