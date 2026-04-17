// server/routes/violations.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');

// GET /api/violations/case/:caseId
router.get('/case/:caseId', (req, res) => {
  res.json(db.prepare('SELECT * FROM violations WHERE caseId = ? ORDER BY createdAt').all(req.params.caseId));
});

// GET /api/violations/library - full policy library
router.get('/library', (req, res) => {
  res.json(db.prepare('SELECT * FROM policy_library ORDER BY citation').all());
});

// POST /api/violations
router.post('/', (req, res) => {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO violations (id, caseId, basisType, citation, shortLabel, description,
      recommendedAction, exclusionLength, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.body.caseId, req.body.basisType || 'KGB', req.body.citation || '',
    req.body.shortLabel || '', req.body.description || '',
    req.body.recommendedAction || '', req.body.exclusionLength || '', now, now);
  res.json({ id });
});

// PATCH /api/violations/:id
router.patch('/:id', (req, res) => {
  const now = new Date().toISOString();
  const allowed = ['description', 'recommendedAction', 'exclusionLength'];
  const updates = [];
  const params = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) { updates.push(`${key} = ?`); params.push(req.body[key]); }
  }
  if (!updates.length) return res.json({ ok: true });
  updates.push('updatedAt = ?');
  params.push(now, req.params.id);
  db.prepare(`UPDATE violations SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

// DELETE /api/violations/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM violations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
