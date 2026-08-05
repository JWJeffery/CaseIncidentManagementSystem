// server/routes/locations.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');

const SITE_TYPES = ['School', 'District Office', 'Annex', 'Other'];

router.get('/', (req, res) => {
  const { includeInactive } = req.query;
  const sql = includeInactive === 'true'
    ? 'SELECT * FROM locations ORDER BY name ASC'
    : 'SELECT * FROM locations WHERE active = 1 ORDER BY name ASC';
  res.json(db.prepare(sql).all());
});

router.get('/types', (req, res) => res.json(SITE_TYPES));

router.get('/:id', (req, res) => {
  const l = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Not found' });
  res.json(l);
});

router.post('/', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name is required.' });
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO locations (id, name, address, siteType, active, createdAt, updatedAt)
    VALUES ($id, $name, $address, $siteType, 1, $createdAt, $updatedAt)
  `).run({
    id, name: req.body.name, address: req.body.address || '',
    siteType: SITE_TYPES.includes(req.body.siteType) ? req.body.siteType : 'School',
    createdAt: now, updatedAt: now,
  });
  res.json({ id });
});

router.patch('/:id', (req, res) => {
  const now = new Date().toISOString();
  const allowed = ['name', 'address', 'siteType', 'active'];
  const updates = [];
  const params = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates.push(`${key} = ?`);
      params.push(key === 'active' ? (req.body[key] ? 1 : 0) : req.body[key]);
    }
  }
  if (!updates.length) return res.json({ ok: true });
  updates.push('updatedAt = ?');
  params.push(now, req.params.id);
  db.prepare(`UPDATE locations SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

module.exports = router;
