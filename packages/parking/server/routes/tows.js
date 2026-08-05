// server/routes/tows.js
// Entire subsystem is board-gated (design doc §4.12a / §1.7). ECD is not
// yet adopted; the District has no legal basis to tow under this policy
// until it is. Every write route below is wrapped in requireFeature --
// reads are left open (harmless; there will be no data to read until the
// gate opens anyway), so the schema/UI can exist and be demoed without
// actually being usable.
//
// State transitions are validated against server/towWorkflow.js (a pure,
// separately-tested module -- see tests/towWorkflow.test.js) rather than
// letting a generic PATCH set any field in any order. This closes a gap
// that was explicitly flagged before this file was written: a non-hazard
// tow's 48-hour pre-tow-notice window is now actually enforced server-side
// before execute-tow will succeed, not just documented as a requirement.
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { requireFeature } = require('../featureGate');
const { requireActiveStaff } = require('./staff');
const workflow = require('../towWorkflow');

function attachDeadlines(tow) {
  return { ...tow, deadlines: workflow.computeDeadlines(tow) };
}

router.get('/', (req, res) => {
  const { vehicleId, hearingPending, status } = req.query;
  let sql = 'SELECT * FROM tows WHERE 1=1';
  const params = [];
  if (vehicleId) { sql += ' AND vehicleId = ?'; params.push(vehicleId); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (hearingPending === 'true') {
    sql += ` AND hearingRequestedAt IS NOT NULL AND hearingDecision IS NULL`;
  }
  sql += ' ORDER BY createdAt DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(attachDeadlines));
});

router.get('/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM tows WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json(attachDeadlines(t));
});

function getTowOr404(id, res) {
  const t = db.prepare('SELECT * FROM tows WHERE id = ?').get(id);
  if (!t) { res.status(404).json({ error: 'Not found' }); return null; }
  return t;
}

function updateTow(id, fields) {
  const now = new Date().toISOString();
  const keys = Object.keys(fields);
  const sets = keys.map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE tows SET ${sets}, updatedAt = ? WHERE id = ?`)
    .run(...keys.map(k => fields[k]), now, id);
}

// POST /api/tows
// towReason drives the pre-tow-notice requirement: a hazard tow (fire
// lane, blocking traffic/emergency access, etc. -- ECD §6(A)(iii)) can
// proceed straight to execute-tow; a non-hazard tow (ECD §6(A)(iv)/(B))
// must go through affix-pre-tow-notice first and wait out the 48-hour
// window, enforced by canExecuteTow() below.
router.post('/', requireFeature('ECD_TOWING_ENABLED'), (req, res) => {
  const { vehicleId, citationId, towReason, hazardTow } = req.body;
  if (!vehicleId || !towReason) {
    return res.status(400).json({ error: 'vehicleId and towReason are required.' });
  }
  const id = uuidv4();
  const now = new Date().toISOString();
  const data = {
    id, vehicleId, citationId: citationId || null, towReason,
    hazardTow: hazardTow ? 1 : 0, status: workflow.STATUSES.OPEN,
    preTowNoticeAffixedAt: null, towedAt: null, postTowNoticeMailedAt: null,
    hearingRequestedAt: null, hearingScheduledAt: null, hearingDecision: null, hearingDecidedAt: null,
    chargesAmount: req.body.chargesAmount || null, chargesPaidAt: null,
    releasedTo: null, releasedAt: null,
    affixedBy: null, executedBy: null, mailedBy: null, requestedBy: null,
    scheduledBy: null, decidedBy: null, releasedBy: null,
    createdAt: now, updatedAt: now,
  };
  db.prepare(`
    INSERT INTO tows (id, vehicleId, citationId, towReason, hazardTow, status,
      preTowNoticeAffixedAt, towedAt, postTowNoticeMailedAt, hearingRequestedAt,
      hearingScheduledAt, hearingDecision, hearingDecidedAt, chargesAmount, chargesPaidAt,
      releasedTo, releasedAt, affixedBy, executedBy, mailedBy, requestedBy,
      scheduledBy, decidedBy, releasedBy, createdAt, updatedAt)
    VALUES ($id, $vehicleId, $citationId, $towReason, $hazardTow, $status,
      $preTowNoticeAffixedAt, $towedAt, $postTowNoticeMailedAt, $hearingRequestedAt,
      $hearingScheduledAt, $hearingDecision, $hearingDecidedAt, $chargesAmount, $chargesPaidAt,
      $releasedTo, $releasedAt, $affixedBy, $executedBy, $mailedBy, $requestedBy,
      $scheduledBy, $decidedBy, $releasedBy, $createdAt, $updatedAt)
  `).run(data);
  res.json({ id, status: data.status });
});

// Each transition below: board-gated, validated against towWorkflow.js's
// canX() guard (not just "does this field exist"), and requires a real
// active Staff record for the action (except request-hearing, where the
// requester is typically the vehicle owner, not District staff).

router.post('/:id/affix-pre-tow-notice', requireFeature('ECD_TOWING_ENABLED'), (req, res) => {
  try {
    const tow = getTowOr404(req.params.id, res); if (!tow) return;
    if (!workflow.canAffixPreTowNotice(tow)) {
      return res.status(400).json({ error: `Cannot affix pre-tow notice from status "${tow.status}" (or this is a hazard tow, which skips pre-notice entirely).` });
    }
    const staff = requireActiveStaff(req.body.affixedBy, 'affixedBy');
    const now = new Date().toISOString();
    updateTow(tow.id, { preTowNoticeAffixedAt: now, affixedBy: staff.id, status: workflow.STATUSES.PRE_NOTICE_AFFIXED });
    res.json({ ok: true, status: workflow.STATUSES.PRE_NOTICE_AFFIXED });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal error.', detail: err.message });
  }
});

router.post('/:id/execute-tow', requireFeature('ECD_TOWING_ENABLED'), (req, res) => {
  try {
    const tow = getTowOr404(req.params.id, res); if (!tow) return;
    if (!workflow.canExecuteTow(tow)) {
      const reason = tow.hazardTow
        ? `Cannot execute from status "${tow.status}".`
        : `Cannot execute yet -- either no pre-tow notice has been affixed, or the 48-hour window (ECD §6.B(i)) has not elapsed.`;
      return res.status(400).json({ error: reason });
    }
    const staff = requireActiveStaff(req.body.executedBy, 'executedBy');
    const now = new Date().toISOString();
    updateTow(tow.id, { towedAt: now, executedBy: staff.id, status: workflow.STATUSES.TOWED });
    res.json({ ok: true, status: workflow.STATUSES.TOWED });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal error.', detail: err.message });
  }
});

router.post('/:id/mail-post-tow-notice', requireFeature('ECD_TOWING_ENABLED'), (req, res) => {
  try {
    const tow = getTowOr404(req.params.id, res); if (!tow) return;
    if (!workflow.canMailPostTowNotice(tow)) {
      return res.status(400).json({ error: `Cannot mail post-tow notice from status "${tow.status}".` });
    }
    const staff = requireActiveStaff(req.body.mailedBy, 'mailedBy');
    const now = new Date().toISOString();
    updateTow(tow.id, { postTowNoticeMailedAt: now, mailedBy: staff.id, status: workflow.STATUSES.POST_NOTICE_MAILED });
    res.json({ ok: true, status: workflow.STATUSES.POST_NOTICE_MAILED });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal error.', detail: err.message });
  }
});

// Requester is typically the vehicle owner contesting the tow, not
// District staff -- free text, not validated against the Staff roster,
// same posture as Citation.personId elsewhere in this module.
router.post('/:id/request-hearing', requireFeature('ECD_TOWING_ENABLED'), (req, res) => {
  try {
    const tow = getTowOr404(req.params.id, res); if (!tow) return;
    if (!workflow.canRequestHearing(tow)) {
      return res.status(400).json({ error: `Cannot request a hearing from status "${tow.status}".` });
    }
    if (!req.body.requestedBy) {
      return res.status(400).json({ error: 'requestedBy (name of the person requesting the hearing) is required.' });
    }
    const now = new Date().toISOString();
    updateTow(tow.id, { hearingRequestedAt: now, requestedBy: req.body.requestedBy, status: workflow.STATUSES.HEARING_REQUESTED });
    res.json({ ok: true, status: workflow.STATUSES.HEARING_REQUESTED });
  } catch (err) {
    res.status(500).json({ error: 'Internal error.', detail: err.message });
  }
});

router.post('/:id/schedule-hearing', requireFeature('ECD_TOWING_ENABLED'), (req, res) => {
  try {
    const tow = getTowOr404(req.params.id, res); if (!tow) return;
    if (!workflow.canScheduleHearing(tow)) {
      return res.status(400).json({ error: `Cannot schedule a hearing from status "${tow.status}".` });
    }
    const staff = requireActiveStaff(req.body.scheduledBy, 'scheduledBy');
    if (!req.body.hearingScheduledAt) {
      return res.status(400).json({ error: 'hearingScheduledAt (the scheduled date/time) is required.' });
    }
    updateTow(tow.id, { hearingScheduledAt: req.body.hearingScheduledAt, scheduledBy: staff.id, status: workflow.STATUSES.HEARING_SCHEDULED });
    res.json({ ok: true, status: workflow.STATUSES.HEARING_SCHEDULED });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal error.', detail: err.message });
  }
});

// decision: 'Valid' | 'Invalid'. Per ECD §6.D(i)/§7.E(i), an invalid
// decision requires charges be waived/refunded -- enforced here by
// zeroing chargesAmount, not left for the UI to remember to do.
router.post('/:id/decide-hearing', requireFeature('ECD_TOWING_ENABLED'), (req, res) => {
  try {
    const tow = getTowOr404(req.params.id, res); if (!tow) return;
    if (!workflow.canDecideHearing(tow)) {
      return res.status(400).json({ error: `Cannot decide a hearing from status "${tow.status}".` });
    }
    const staff = requireActiveStaff(req.body.decidedBy, 'decidedBy');
    const decision = req.body.decision === 'Invalid' ? 'Invalid' : 'Valid';
    const now = new Date().toISOString();
    const fields = {
      hearingDecision: decision, hearingDecidedAt: now, decidedBy: staff.id,
      status: decision === 'Invalid' ? workflow.STATUSES.HEARING_DECIDED_INVALID : workflow.STATUSES.HEARING_DECIDED_VALID,
    };
    if (decision === 'Invalid') fields.chargesAmount = '0.00'; // must be waived/refunded per ECD
    updateTow(tow.id, fields);
    res.json({ ok: true, status: fields.status });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal error.', detail: err.message });
  }
});

router.post('/:id/release', requireFeature('ECD_TOWING_ENABLED'), (req, res) => {
  try {
    const tow = getTowOr404(req.params.id, res); if (!tow) return;
    if (!workflow.canRelease(tow)) {
      return res.status(400).json({ error: `Cannot release from status "${tow.status}".` });
    }
    // A valid hearing decision (or an uncontested tow with charges set)
    // requires payment before release; an invalid decision does not,
    // since charges were zeroed at decide-hearing.
    const chargesOwed = tow.status !== workflow.STATUSES.HEARING_DECIDED_INVALID
      && tow.chargesAmount && parseFloat(tow.chargesAmount) > 0;
    if (chargesOwed && !req.body.chargesPaidAt) {
      return res.status(400).json({ error: 'Charges are owed and must be marked paid (chargesPaidAt) before release, per ECD §8.A/§8.C.' });
    }
    const staff = requireActiveStaff(req.body.releasedBy, 'releasedBy');
    if (!req.body.releasedTo) {
      return res.status(400).json({ error: 'releasedTo (who the vehicle was released to) is required.' });
    }
    const now = new Date().toISOString();
    const fields = { releasedTo: req.body.releasedTo, releasedAt: now, releasedBy: staff.id, status: workflow.STATUSES.RELEASED };
    if (req.body.chargesPaidAt) fields.chargesPaidAt = req.body.chargesPaidAt;
    updateTow(tow.id, fields);
    res.json({ ok: true, status: workflow.STATUSES.RELEASED });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal error.', detail: err.message });
  }
});

module.exports = router;
