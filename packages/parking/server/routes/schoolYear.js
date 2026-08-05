// server/routes/schoolYear.js
// District-wide "school year end date" setting. Parking permits default
// their expirationDate to this value on issuance/renewal (see
// routes/permits.js) instead of requiring a date typed in every time.
// The system prompts once a year to set a new one -- not on every visit,
// only once the currently-configured date has actually passed. See
// server/schoolYearConfig.js for the (separately tested) logic.
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { requireActiveStaff } = require('./staff');
const { computeSchoolYearStatus } = require('../schoolYearConfig');

function getCurrentConfig() {
  return db.prepare('SELECT * FROM school_year_config ORDER BY createdAt DESC LIMIT 1').get() || null;
}

// GET /api/school-year -- current config plus whether it needs updating
router.get('/', (req, res) => {
  const config = getCurrentConfig();
  res.json({ config, ...computeSchoolYearStatus(config) });
});

// POST /api/school-year -- sets a new end date. Always inserts a new row
// (never updates in place) so there's a real history of every change.
router.post('/', (req, res) => {
  try {
    if (!req.body.schoolYearEndDate) {
      return res.status(400).json({ error: 'schoolYearEndDate is required.' });
    }
    const staff = requireActiveStaff(req.body.setBy, 'setBy');
    const now = new Date().toISOString();
    const id = uuidv4();
    db.prepare(`
      INSERT INTO school_year_config (id, schoolYearEndDate, setBy, setAt, createdAt)
      VALUES ($id, $schoolYearEndDate, $setBy, $setAt, $createdAt)
    `).run({ id, schoolYearEndDate: req.body.schoolYearEndDate, setBy: staff.id, setAt: now, createdAt: now });
    res.json({ id, schoolYearEndDate: req.body.schoolYearEndDate });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal error.', detail: err.message });
  }
});

module.exports = router;
module.exports.getCurrentConfig = getCurrentConfig;
