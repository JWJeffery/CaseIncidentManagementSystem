// server/routes/dmvQueryLog.js
// Required by District DMV2U Record Inquiry Account Protocol (Protocol
// 010) §8, independent of ECD adoption -- this is NOT board-gated. DMV2U
// is already in use today. Fields match Protocol 010 §8's Required
// Documentation list field-for-field; see design doc §4.13.
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');

// GET /api/dmvQueryLog - supports the quarterly inquiry audit (Protocol
// 010 §12(B)) via referenceNumber/authorizedUserDmv2uUsername filters.
router.get('/', (req, res) => {
  const { authorizedUserDmv2uUsername, referenceNumber, permissiblePurposeCategory } = req.query;
  let sql = 'SELECT * FROM dmv_query_log WHERE 1=1';
  const params = [];
  if (authorizedUserDmv2uUsername) { sql += ' AND authorizedUserDmv2uUsername = ?'; params.push(authorizedUserDmv2uUsername); }
  if (referenceNumber) { sql += ' AND referenceNumber = ?'; params.push(referenceNumber); }
  if (permissiblePurposeCategory) { sql += ' AND permissiblePurposeCategory = ?'; params.push(permissiblePurposeCategory); }
  sql += ' ORDER BY dateTime DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const entry = db.prepare('SELECT * FROM dmv_query_log WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  res.json(entry);
});

const PERMISSIBLE_PURPOSES = [
  'Vehicle Ownership for Parking and Traffic Enforcement',
  'Parking Citations and Vehicle Registration',
  'Driving Privilege Verification',
  'Public Safety and Emergency Response',
  'Protection of District Property',
  'Account Administration',
];

// POST /api/dmvQueryLog
// Protocol 010 §8 requires the form be completed BEFORE the inquiry
// whenever practicable, and no later than end of shift for emergency
// inquiries. This route doesn't enforce timing (that's a real-world
// discipline issue, not something the schema can force), but does require
// every field Protocol 010 §8 lists as minimum content.
router.post('/', (req, res) => {
  const {
    authorizedUserName, authorizedUserDmv2uUsername,
    recordIdentifier, factualBasis, permissiblePurposeCategory,
  } = req.body;

  if (!authorizedUserName || !authorizedUserDmv2uUsername || !recordIdentifier || !factualBasis || !permissiblePurposeCategory) {
    return res.status(400).json({
      error: 'authorizedUserName, authorizedUserDmv2uUsername, recordIdentifier, factualBasis, and permissiblePurposeCategory are required per Protocol 010 §8.',
    });
  }
  if (!PERMISSIBLE_PURPOSES.includes(permissiblePurposeCategory)) {
    return res.status(400).json({
      error: `permissiblePurposeCategory must be one of Protocol 010 §6(A-F): ${PERMISSIBLE_PURPOSES.join('; ')}`,
    });
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const data = {
    id,
    dateTime: req.body.dateTime || now,
    authorizedUserName,
    authorizedUserTitle: req.body.authorizedUserTitle || '',
    authorizedUserBuilding: req.body.authorizedUserBuilding || '',
    authorizedUserDmv2uUsername,
    requestingEmployee: req.body.requestingEmployee || null,
    recordIdentifier,
    location: req.body.location || '',
    referenceNumber: req.body.referenceNumber || null,
    factualBasis,
    permissiblePurposeCategory,
    dmvRecordAccessed: req.body.dmvRecordAccessed || '',
    personalInformationUsed: req.body.personalInformationUsed || '',
    wasRedisclosed: req.body.wasRedisclosed ? 1 : 0,
    redisclosureRecipient: req.body.redisclosureRecipient || null,
    redisclosureReason: req.body.redisclosureReason || null,
    dispositionOrAction: req.body.dispositionOrAction || '',
    createdAt: now,
  };
  db.prepare(`
    INSERT INTO dmv_query_log (id, dateTime, authorizedUserName, authorizedUserTitle,
      authorizedUserBuilding, authorizedUserDmv2uUsername, requestingEmployee, recordIdentifier,
      location, referenceNumber, factualBasis, permissiblePurposeCategory, dmvRecordAccessed,
      personalInformationUsed, wasRedisclosed, redisclosureRecipient, redisclosureReason,
      dispositionOrAction, createdAt)
    VALUES ($id, $dateTime, $authorizedUserName, $authorizedUserTitle,
      $authorizedUserBuilding, $authorizedUserDmv2uUsername, $requestingEmployee, $recordIdentifier,
      $location, $referenceNumber, $factualBasis, $permissiblePurposeCategory, $dmvRecordAccessed,
      $personalInformationUsed, $wasRedisclosed, $redisclosureRecipient, $redisclosureReason,
      $dispositionOrAction, $createdAt)
  `).run(data);
  res.json({ id });
});

// No PATCH/DELETE routes intentionally -- Protocol 010 treats this log as
// an append-only compliance record. Corrections should be a new entry
// with a note, not an edit to history, consistent with the append-only
// governance pattern used elsewhere in Josh's projects (e.g. the EOP
// suite's audit ledger).

module.exports = router;
