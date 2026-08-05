// server/routes/persons.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');

// GET /api/persons/search?q=
router.get('/search', (req, res) => {
  const q = `%${req.query.q || ''}%`;
  const rows = db.prepare(`
    SELECT * FROM persons
    WHERE firstName LIKE ? OR lastName LIKE ? OR aliases LIKE ? OR phone LIKE ?
    ORDER BY lastName, firstName LIMIT 20
  `).all(q, q, q, q);
  res.json(rows);
});

// GET /api/cases/:caseId/persons
router.get('/case/:caseId', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, cp.role, cp.id AS casepersonId
    FROM persons p
    JOIN case_persons cp ON cp.personId = p.id
    WHERE cp.caseId = ?
    ORDER BY cp.role, p.lastName
  `).all(req.params.caseId);
  res.json(rows);
});

// POST /api/persons - create person
router.post('/', (req, res) => {
  const id = uuidv4();
  const now = new Date().toISOString();
  const d = { id, ...req.body, createdAt: now, updatedAt: now };
  const fields = ['id','personType','firstName','middleName','lastName','aliases','phone',
    'address','city','state','zip','dob','idType','idNumber','sex','race',
    'height','weight','hair','eyes','notes','createdAt','updatedAt'];
  const vals = fields.map(f => d[f] ?? '');
  db.prepare(`INSERT INTO persons (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`).run(...vals);
  res.json({ id });
});

// POST /api/case-persons - link person to case
router.post('/link', (req, res) => {
  const id = uuidv4();
  db.prepare(`INSERT INTO case_persons (id, caseId, personId, role) VALUES (?, ?, ?, ?)`)
    .run(id, req.body.caseId, req.body.personId, req.body.role);
  res.json({ id });
});

// DELETE /api/case-persons/:id
router.delete('/link/:id', (req, res) => {
  db.prepare('DELETE FROM case_persons WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
