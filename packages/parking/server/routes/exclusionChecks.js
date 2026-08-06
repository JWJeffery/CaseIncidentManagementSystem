// server/routes/exclusionChecks.js
//
// Thin, read-only proxy to case-management's cross-module exclusion check
// (GET /api/exclusions). Backs the "is this person currently excluded
// from district property?" warning shown at citation time and on a field
// plate lookup.
//
// SOFT-FAIL BY DESIGN: if case-management is unreachable, this returns
// 200 with { available: false } rather than an error. An officer must
// still be able to write a citation when a dependency is briefly down --
// per the settled Person-linkage policy the system INFORMS, it never
// blocks the field action. The UI shows "exclusion check unavailable"
// instead of a red alert it can't actually stand behind.
const express = require('express');
const router = express.Router();
const { caseManagementFetch } = require('@fgsd/shared');

// Shared helper the other routes (vehicles lookup, citations) reuse, so
// the soft-fail contract is identical everywhere. Returns:
//   { available: true,  results: { personId: summary, ... } }   on success
//   { available: false, error, results: {} }                    when CMS is down
async function checkExclusions(personIds) {
  const ids = [...new Set((personIds || []).filter(Boolean))];
  if (!ids.length) return { available: true, results: {} };
  try {
    const results = await caseManagementFetch(
      `/api/exclusions?personIds=${ids.map(encodeURIComponent).join(',')}`
    );
    return { available: true, results };
  } catch (err) {
    return { available: false, error: err.message, results: {} };
  }
}

// GET /api/exclusion-checks?personIds=a,b,c  (personId= also accepted)
router.get('/', async (req, res) => {
  try {
    const ids = String(req.query.personIds || req.query.personId || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    res.json(await checkExclusions(ids));
  } catch (err) {
    // Belt and suspenders: checkExclusions already soft-fails, but this
    // endpoint must never 500 a citation flow either.
    res.json({ available: false, error: err.message, results: {} });
  }
});

module.exports = router;
module.exports.checkExclusions = checkExclusions;
