// server/routes/citations.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { RecordsClassification, formatCaseNumber } = require('@fgsd/shared');
const { requireFeature } = require('../featureGate');

// Case Number generation, DB-backed (annual reset), using @fgsd/shared's
// formatter so the string shape matches design doc §3 exactly
// (FGSD-YYYY-#####, 5-digit). NOTE: this queries this package's own
// citations table only -- it is NOT yet a true cross-module central
// counter (design doc §3 calls for one; dashboard already flags this as a
// yellow gap under Shared Platform). If case-management's Case entities
// and this package's filed Citations both need Case Numbers from the same
// sequence, that central counter has to get built before this is correct
// in production. Flagging here so it isn't missed.
function nextCaseNumber() {
  const year = new Date().getFullYear();
  const prefix = `FGSD-${year}-`;
  const latest = db.prepare(
    `SELECT caseNumber FROM citations WHERE caseNumber LIKE ? ORDER BY caseNumber DESC LIMIT 1`
  ).get(`${prefix}%`);
  const parsed = latest ? parseInt(latest.caseNumber.split('-').pop(), 10) : NaN;
  const nextSeq = Number.isNaN(parsed) ? 1 : parsed + 1;
  return formatCaseNumber(year, nextSeq);
}

// GET /api/citations - list, optional filters
router.get('/', (req, res) => {
  const { citationType, status, vehicleId, personId } = req.query;
  let sql = 'SELECT * FROM citations WHERE 1=1';
  const params = [];
  if (citationType) { sql += ' AND citationType = ?'; params.push(citationType); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (vehicleId) { sql += ' AND vehicleId = ?'; params.push(vehicleId); }
  if (personId) { sql += ' AND personId = ?'; params.push(personId); }
  sql += ' ORDER BY dateIssued DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/citations/:id
router.get('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM citations WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});

// POST /api/citations
// citationType determines everything downstream:
//   Administrative -- requires an active Parking Permit on the vehicle,
//     per ECD §5(A) (student/district personnel with a registered
//     vehicle). No permit -> reject and point to the Court track, rather
//     than silently letting an ineligible citation through as
//     Administrative.
//   Court -- gated behind ECD_COURT_CITATIONS_ENABLED. Rejects with 403
//     if the board hasn't adopted ECD yet. This is enforced here, not
//     just documented -- see requireFeature / @fgsd/shared/featureFlags.js.
router.post('/', (req, res) => {
  try {
  const {
    vehicleId, personId, violationCodeId, citationType,
    enforcementOfficerId, location, dateIssued, incidentNumber, notes,
  } = req.body;

  if (!violationCodeId || !enforcementOfficerId) {
    return res.status(400).json({ error: 'violationCodeId and enforcementOfficerId are required.' });
  }

  const type = citationType === 'Court' ? 'Court' : 'Administrative';

  if (type === 'Court') {
    // Enforce the board gate inline (rather than only as router
    // middleware) so the Administrative path below is never affected by
    // this check.
    const { FeatureFlags } = require('@fgsd/shared');
    if (!FeatureFlags.ECD_COURT_CITATIONS_ENABLED) {
      return res.status(403).json({
        error: 'Court-track citations are disabled pending school board adoption of proposed Board Policy ECD.',
      });
    }
  } else {
    // Administrative track: ECD §5(A) requires the vehicle be properly
    // registered (an active permit) and the person be a student or
    // district personnel. This route checks the permit; person-type
    // eligibility is left to the caller/UI since Person records aren't
    // centrally typed yet (design doc's shared Person schema is still a
    // red/unbuilt item -- see dashboard).
    if (vehicleId) {
      const activePermit = db.prepare(
        `SELECT * FROM parking_permits WHERE vehicleId = ? AND status = 'Active' LIMIT 1`
      ).get(vehicleId);
      if (!activePermit) {
        return res.status(422).json({
          error: 'No active parking permit found for this vehicle. Administrative citations require a properly registered vehicle per ECD §5(A) -- issue a Court-track citation instead.',
        });
      }
    }
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const data = {
    id,
    incidentNumber: incidentNumber || null,
    caseNumber: null, // assigned only when a Court citation is filed -- see /:id/file-with-court
    vehicleId: vehicleId || null,
    personId: personId || null,
    violationCodeId,
    citationType: type,
    recordsClassification: type === 'Administrative'
      ? RecordsClassification.EDUCATION_RECORD
      : RecordsClassification.LEU_PUBLIC_SAFETY, // becomes COURT_RECORD on filing
    enforcementOfficerId,
    location: location || '',
    dateIssued: dateIssued || now,
    status: 'Issued',
    notes: notes || '',
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(`
    INSERT INTO citations (id, incidentNumber, caseNumber, vehicleId, personId, violationCodeId,
      citationType, recordsClassification, enforcementOfficerId, location, dateIssued, status, notes,
      createdAt, updatedAt)
    VALUES ($id, $incidentNumber, $caseNumber, $vehicleId, $personId, $violationCodeId,
      $citationType, $recordsClassification, $enforcementOfficerId, $location, $dateIssued, $status, $notes,
      $createdAt, $updatedAt)
  `).run(data);
  res.json({ id, citationType: type, recordsClassification: data.recordsClassification });
  } catch (err) {
    console.error('POST /api/citations failed:', err);
    res.status(500).json({ error: 'Internal error creating citation.', detail: err.message });
  }
});

// POST /api/citations/:id/file-with-court
// Board-gated (same flag as Court-track creation -- if the board hasn't
// adopted ECD, nothing should ever reach "filed" status). Assigns a real
// Case Number and flips records_classification to Court Record per design
// doc §4.12 -- a Court citation is LEU up to filing, then a court record.
router.post('/:id/file-with-court', requireFeature('ECD_COURT_CITATIONS_ENABLED'), (req, res) => {
  try {
  const citation = db.prepare('SELECT * FROM citations WHERE id = ?').get(req.params.id);
  if (!citation) return res.status(404).json({ error: 'Not found' });
  if (citation.citationType !== 'Court') {
    return res.status(400).json({ error: 'Only Court-track citations can be filed with the court.' });
  }
  const caseNumber = nextCaseNumber();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE citations SET caseNumber = ?, status = 'Filed',
      recordsClassification = ?, updatedAt = ? WHERE id = ?
  `).run(caseNumber, RecordsClassification.COURT_RECORD, now, req.params.id);
  res.json({ id: req.params.id, caseNumber });
  } catch (err) {
    console.error('POST /api/citations/:id/file-with-court failed:', err);
    res.status(500).json({ error: 'Internal error filing citation.', detail: err.message });
  }
});

// PATCH /api/citations/:id
router.patch('/:id', (req, res) => {
  const now = new Date().toISOString();
  const allowed = ['location', 'status', 'notes'];
  const updates = [];
  const params = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates.push(`${key} = ?`);
      params.push(req.body[key]);
    }
  }
  if (!updates.length) return res.json({ ok: true });
  updates.push('updatedAt = ?');
  params.push(now, req.params.id);
  db.prepare(`UPDATE citations SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

module.exports = router;
