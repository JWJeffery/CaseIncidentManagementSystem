// server/routes/violationCodes.js
// Read-only library, same pattern as case-management's policy_library
// (KGB). Seeded from ECD §4(A)-(M) -- see server/seed.js. No POST route:
// this library is edited via seed data / migration, not through the app,
// same as case-management's KGB library.
const express = require('express');
const router = express.Router();
const { db } = require('../db');

// GET /api/violationCodes - list, optional violationBasis filter
router.get('/', (req, res) => {
  const { violationBasis } = req.query;
  let sql = 'SELECT * FROM violation_codes WHERE 1=1';
  const params = [];
  if (violationBasis) { sql += ' AND violationBasis = ?'; params.push(violationBasis); }
  sql += ' ORDER BY citation ASC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/violationCodes/:id
router.get('/:id', (req, res) => {
  const v = db.prepare('SELECT * FROM violation_codes WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Not found' });
  res.json(v);
});

module.exports = router;
