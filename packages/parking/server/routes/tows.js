// server/routes/tows.js
// Entire subsystem is board-gated (design doc §4.12a / §1.7). ECD is not
// yet adopted; the District has no legal basis to tow under this policy
// until it is. Every write route below is wrapped in requireFeature --
// reads are left open (harmless; there will be no data to read until the
// gate opens anyway), so the schema/UI can exist and be demoed without
// actually being usable.
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { requireFeature } = require('../featureGate');

router.get('/', (req, res) => {
  const { vehicleId, hearingPending } = req.query;
  let sql = 'SELECT * FROM tows WHERE 1=1';
  const params = [];
  if (vehicleId) { sql += ' AND vehicleId = ?'; params.push(vehicleId); }
  if (hearingPending === 'true') {
    sql += ` AND hearingRequestedAt IS NOT NULL AND hearingDecision IS NULL`;
  }
  sql += ' ORDER BY createdAt DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM tows WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json(t);
});

// POST /api/tows
// towReason drives the pre-tow-notice requirement: a hazard tow (fire
// lane, blocking traffic/emergency access, etc. -- ECD §6(A)(iii)) can
// happen immediately; a non-hazard tow (ECD §6(A)(iv)/(B)) legally
// requires a 48-hour pre-tow notice BEFORE towedAt is set. This route
// does not currently enforce that ordering server-side beyond requiring
// hazardTow to be explicit -- the deadline-tracking/at-risk flagging the
// design doc calls for (§4.12a) is real remaining work, not done here.
router.post('/', requireFeature('ECD_TOWING_ENABLED'), (req, res) => {
  const { vehicleId, citationId, towReason, hazardTow } = req.body;
  if (!vehicleId || !towReason) {
    return res.status(400).json({ error: 'vehicleId and towReason are required.' });
  }
  const id = uuidv4();
  const now = new Date().toISOString();
  const data = {
    id,
    vehicleId,
    citationId: citationId || null,
    towReason,
    hazardTow: hazardTow ? 1 : 0,
    preTowNoticeAffixedAt: req.body.preTowNoticeAffixedAt || null,
    towedAt: req.body.towedAt || null,
    postTowNoticeMailedAt: null,
    hearingRequestedAt: null,
    hearingScheduledAt: null,
    hearingDecision: null,
    chargesAmount: req.body.chargesAmount || null,
    chargesPaidAt: null,
    releasedTo: null,
    releasedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(`
    INSERT INTO tows (id, vehicleId, citationId, towReason, hazardTow,
      preTowNoticeAffixedAt, towedAt, postTowNoticeMailedAt, hearingRequestedAt,
      hearingScheduledAt, hearingDecision, chargesAmount, chargesPaidAt,
      releasedTo, releasedAt, createdAt, updatedAt)
    VALUES ($id, $vehicleId, $citationId, $towReason, $hazardTow,
      $preTowNoticeAffixedAt, $towedAt, $postTowNoticeMailedAt, $hearingRequestedAt,
      $hearingScheduledAt, $hearingDecision, $chargesAmount, $chargesPaidAt,
      $releasedTo, $releasedAt, $createdAt, $updatedAt)
  `).run(data);
  res.json({ id });
});

// PATCH /api/tows/:id -- covers post-tow notice, hearing request/schedule/
// decision, and release/charges fields. Same board gate as creation: none
// of this workflow should be usable before ECD is adopted.
router.patch('/:id', requireFeature('ECD_TOWING_ENABLED'), (req, res) => {
  const now = new Date().toISOString();
  const allowed = [
    'preTowNoticeAffixedAt', 'towedAt', 'postTowNoticeMailedAt',
    'hearingRequestedAt', 'hearingScheduledAt', 'hearingDecision',
    'chargesAmount', 'chargesPaidAt', 'releasedTo', 'releasedAt',
  ];
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
  db.prepare(`UPDATE tows SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

module.exports = router;
