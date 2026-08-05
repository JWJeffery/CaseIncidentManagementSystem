// server/routes/reports.js
// Reporting/analytics for parking. Real SQL GROUP BY aggregation rather
// than pulling every citation/permit to the client and crunching it in
// JS -- matters even at this scale, and it's the honest way to build
// something meant to keep working as the dataset grows past demo size.
const express = require('express');
const router = express.Router();
const { db } = require('../db');

// GET /api/reports/citations?from=YYYY-MM-DD&to=YYYY-MM-DD
// Both optional -- omitting either gives an open-ended range. Filters on
// dateIssued (when the citation was actually written), not createdAt.
router.get('/citations', (req, res) => {
  const { from, to } = req.query;
  const where = [];
  const params = {};
  if (from) { where.push('c.dateIssued >= $from'); params.$from = from; }
  if (to) { where.push('c.dateIssued <= $to'); params.$to = to + 'T23:59:59.999Z'; }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS n FROM citations c ${whereClause}`).get(params).n;

  const byViolation = db.prepare(`
    SELECT vc.citation, vc.shortLabel, COUNT(*) AS count
    FROM citations c JOIN violation_codes vc ON vc.id = c.violationCodeId
    ${whereClause}
    GROUP BY c.violationCodeId ORDER BY count DESC
  `).all(params);

  const byType = db.prepare(`
    SELECT citationType, COUNT(*) AS count FROM citations c ${whereClause}
    GROUP BY citationType ORDER BY count DESC
  `).all(params);

  const byStatus = db.prepare(`
    SELECT status, COUNT(*) AS count FROM citations c ${whereClause}
    GROUP BY status ORDER BY count DESC
  `).all(params);

  // SQLite substr() pulls YYYY-MM straight out of the ISO timestamp --
  // no need for a date-parsing library for a simple month bucket.
  const byMonth = db.prepare(`
    SELECT substr(dateIssued, 1, 7) AS month, COUNT(*) AS count FROM citations c ${whereClause}
    GROUP BY month ORDER BY month ASC
  `).all(params);

  const byOfficer = db.prepare(`
    SELECT s.name AS officerName, s.id AS officerId, COUNT(*) AS count
    FROM citations c JOIN staff s ON s.id = c.enforcementOfficerId
    ${whereClause}
    GROUP BY c.enforcementOfficerId ORDER BY count DESC
  `).all(params);

  // Top locations only (LIMIT 10) -- location is free text entered per
  // citation, not a controlled zone list, so this is "most common exact
  // strings," useful as a rough signal, not a precise zone breakdown.
  const byLocation = db.prepare(`
    SELECT location, COUNT(*) AS count FROM citations c
    ${whereClause}${whereClause ? ' AND' : 'WHERE'} location != ''
    GROUP BY location ORDER BY count DESC LIMIT 10
  `).all(params);

  res.json({ total, byViolation, byType, byStatus, byMonth, byOfficer, byLocation });
});

// GET /api/reports/permits -- current snapshot, not time-filtered (a
// permit's type/status right now is what matters for utilization, not a
// history of what it was on some past date).
router.get('/permits', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS n FROM parking_permits').get().n;
  const byType = db.prepare(`SELECT permitType, COUNT(*) AS count FROM parking_permits GROUP BY permitType ORDER BY count DESC`).all();
  const byStatus = db.prepare(`SELECT status, COUNT(*) AS count FROM parking_permits GROUP BY status ORDER BY count DESC`).all();
  res.json({ total, byType, byStatus });
});

// GET /api/reports/tows -- read-only, not board-gated (reporting on
// whatever tow data exists, even if currently zero because the write
// side is gated, is harmless -- this is a report, not an action).
router.get('/tows', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS n FROM tows').get().n;
  const byStatus = db.prepare(`SELECT status, COUNT(*) AS count FROM tows GROUP BY status ORDER BY count DESC`).all();
  const hazardCount = db.prepare(`SELECT COUNT(*) AS n FROM tows WHERE hazardTow = 1`).get().n;
  res.json({ total, byStatus, hazardCount });
});

module.exports = router;
