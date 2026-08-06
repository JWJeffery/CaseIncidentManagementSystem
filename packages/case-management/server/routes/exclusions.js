// server/routes/exclusions.js
//
// Cross-module EXCLUSION check API -- the read side of the shared Person
// store's payoff (RESUME_PROJECT_NOTE.md: "an Exclusion check at citation
// time"). Given one or more Identity Person ids, it reports whether each
// is CURRENTLY excluded from district property, with supporting
// case/notice detail.
//
// Consumed server-to-server by other modules -- parking checks it when an
// officer links a person to a citation and when a plate is looked up in
// the field -- and usable by this module's own UI too. The browser never
// calls it cross-origin; parking's backend proxies through
// @fgsd/shared's caseManagementFetch.
//
// All the judgment (what counts as an exclusion, whether it's still in
// effect) lives in the pure, unit-tested server/exclusions.js. This route
// only gathers rows and hands them over -- and it is fully synchronous
// (sql.js), so it carries no async-unhandled-rejection risk.
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { buildPersonExclusions, emptyPersonExclusion } = require('../exclusions');

function parseIds(req) {
  const raw = req.query.personIds != null ? req.query.personIds : req.query.personId;
  if (raw == null) return [];
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

function computeForPersons(ids) {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return {};

  const placeholders = uniq.map(() => '?').join(',');

  // All case links for these persons. buildPersonExclusions does the
  // subject-role and exclusion-vs-warning filtering itself, so those
  // rules live in exactly one place (the pure module), not duplicated in
  // SQL here.
  const caseRows = db.prepare(`
    SELECT cp.personId AS personId, cp.role AS role,
           c.id AS caseId, c.caseNumber AS caseNumber, c.incidentType AS incidentType,
           c.schoolSite AS schoolSite, c.openedAt AS openedAt, c.incidentAt AS incidentAt,
           c.disposition AS disposition
    FROM case_persons cp
    JOIN cases c ON c.id = cp.caseId
    WHERE cp.personId IN (${placeholders})
  `).all(...uniq);

  const caseIds = [...new Set(caseRows.map(r => r.caseId))];

  let notices = [];
  let violationRows = [];
  if (caseIds.length) {
    const cph = caseIds.map(() => '?').join(',');
    notices = db.prepare(`
      SELECT caseId, subjectPersonId, generatedAt, issuedDate
      FROM documents
      WHERE documentType = 'exclusion_notice' AND caseId IN (${cph})
      ORDER BY generatedAt DESC
    `).all(...caseIds);
    violationRows = db.prepare(`
      SELECT caseId, recommendedAction, exclusionLength, citation, shortLabel
      FROM violations
      WHERE caseId IN (${cph})
    `).all(...caseIds);
  }

  // Best served notice per (caseId, personId): prefer a notice served
  // specifically on this person (most recent), else fall back to a legacy
  // notice with no subjectPersonId recorded (most recent). notices is
  // already ordered newest-first.
  function bestNotice(caseId, personId) {
    const forCase = notices.filter(n => n.caseId === caseId);
    return forCase.find(n => n.subjectPersonId === personId)
        || forCase.find(n => !n.subjectPersonId)
        || null;
  }

  const enriched = caseRows.map(r => {
    const n = bestNotice(r.caseId, r.personId);
    return { ...r, noticeIssuedDate: n ? n.issuedDate : null, noticeGeneratedAt: n ? n.generatedAt : null };
  });

  const found = buildPersonExclusions(enriched, violationRows, new Date().toISOString());

  // Every requested id gets a definitive answer, excluded or not.
  const out = {};
  for (const id of uniq) out[id] = found[id] || emptyPersonExclusion(id);
  return out;
}

// GET /api/exclusions?personId=X       -> single person summary object
// GET /api/exclusions?personIds=a,b,c  -> { personId: summary, ... } map
router.get('/', (req, res) => {
  try {
    const ids = parseIds(req);
    if (!ids.length) return res.status(400).json({ error: 'personId or personIds is required.' });
    const map = computeForPersons(ids);
    // Single-person shorthand only when the caller used ?personId=.
    if (req.query.personIds == null && ids.length === 1) {
      return res.json(map[ids[0]]);
    }
    res.json(map);
  } catch (err) {
    console.error('GET /api/exclusions failed:', err);
    res.status(500).json({ error: 'Internal error checking exclusions.', detail: err.message });
  }
});

module.exports = router;
