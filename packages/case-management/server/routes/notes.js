// server/routes/notes.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');

// GET /api/notes/case/:caseId
router.get('/case/:caseId', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM notes WHERE caseId = ? ORDER BY createdAt DESC'
  ).all(req.params.caseId);
  res.json(rows);
});

// POST /api/notes
router.post('/', (req, res) => {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO notes (id, caseId, author, noteType, body, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.body.caseId, req.body.author || '', req.body.noteType || 'general', req.body.body || '', now);
  res.json({ id });
});

// DELETE /api/notes/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
