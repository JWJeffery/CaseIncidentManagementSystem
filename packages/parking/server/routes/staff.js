// server/routes/staff.js
//
// Staff/Officer roster. See db.js's comment above the `staff` table for
// why this exists: every "who did this" field in this module was free
// text before this, with no consistency and no validation. This is the
// selectable roster that fixes that, and requireActiveStaff() below is
// what other routes call to make the reference real instead of decorative.
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');

// GET /api/staff - list, defaults to active only (for populating dropdowns)
router.get('/', (req, res) => {
  const { includeInactive } = req.query;
  const sql = includeInactive === 'true'
    ? 'SELECT * FROM staff ORDER BY name ASC'
    : 'SELECT * FROM staff WHERE active = 1 ORDER BY name ASC';
  res.json(db.prepare(sql).all());
});

router.get('/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(s);
});

router.post('/', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name is required.' });
  const id = uuidv4();
  const now = new Date().toISOString();
  const data = {
    id, name: req.body.name,
    employeeIdNumber: req.body.employeeIdNumber || '',
    dpsstNumber: req.body.dpsstNumber || '',
    role: req.body.role || '',
    dmv2uAuthorized: req.body.dmv2uAuthorized ? 1 : 0,
    active: 1,
    createdAt: now, updatedAt: now,
  };
  db.prepare(`
    INSERT INTO staff (id, name, employeeIdNumber, dpsstNumber, role, dmv2uAuthorized, active, createdAt, updatedAt)
    VALUES ($id, $name, $employeeIdNumber, $dpsstNumber, $role, $dmv2uAuthorized, $active, $createdAt, $updatedAt)
  `).run(data);
  res.json({ id });
});

router.patch('/:id', (req, res) => {
  const now = new Date().toISOString();
  const allowed = ['name', 'employeeIdNumber', 'dpsstNumber', 'role', 'dmv2uAuthorized', 'active'];
  const updates = [];
  const params = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates.push(`${key} = ?`);
      params.push(key === 'dmv2uAuthorized' || key === 'active' ? (req.body[key] ? 1 : 0) : req.body[key]);
    }
  }
  if (!updates.length) return res.json({ ok: true });
  updates.push('updatedAt = ?');
  params.push(now, req.params.id);
  db.prepare(`UPDATE staff SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

/**
 * Shared validation helper -- other route files call this to confirm a
 * given id is a real, active staff member before recording them as the
 * one who issued a citation, reviewed an application, entered a vehicle,
 * etc. Throws with a message suitable for a 400 response; does not send
 * a response itself, since the caller has its own error-handling shape.
 */
function requireActiveStaff(id, fieldLabel = 'staff member') {
  const fail = (msg) => { const e = new Error(msg); e.statusCode = 400; throw e; };
  if (!id) fail(`${fieldLabel} is required.`);
  const s = db.prepare('SELECT * FROM staff WHERE id = ?').get(id);
  if (!s) fail(`${fieldLabel} "${id}" does not match any staff record.`);
  if (!s.active) fail(`${fieldLabel} "${s.name}" is not an active staff member.`);
  return s;
}

module.exports = router;
module.exports.requireActiveStaff = requireActiveStaff;
