// server/routes/cases.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { identityFetch } = require('@fgsd/shared');

// Generate next case number
function nextCaseNumber() {
  const year = new Date().getFullYear();
  const prefix = `FGSD-${year}-`;
  const latest = db.prepare(
    `SELECT caseNumber FROM cases WHERE caseNumber LIKE ? ORDER BY caseNumber DESC LIMIT 1`
  ).get(`${prefix}%`);
  if (!latest) return `${prefix}0001`;
  const num = parseInt(latest.caseNumber.split('-').pop(), 10) + 1;
  return `${prefix}${String(num).padStart(4, '0')}`;
}

// GET /api/cases - list with optional search/filter
// subjectName used to come from a SQL JOIN against the local persons
// table -- now that person data lives in the Identity Service, that
// join is impossible (it's a different database entirely), so this
// batch-fetches subject names from Identity in one call after the local
// case query, rather than N+1 individual lookups per case.
router.get('/', async (req, res) => {
  try {
    const { search, status } = req.query;
    let sql = `SELECT c.* FROM cases c WHERE 1=1`;
    const params = [];
    if (status && status !== 'all') {
      sql += ` AND c.status = ?`;
      params.push(status);
    }
    if (search) {
      sql += ` AND (c.caseNumber LIKE ? OR c.schoolSite LIKE ? OR c.incidentType LIKE ?
                OR c.assignedTo LIKE ? OR c.createdBy LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }
    sql += ` ORDER BY c.createdAt DESC`;
    const cases = db.prepare(sql).all(...params);

    if (!cases.length) return res.json([]);

    const caseIds = cases.map(c => c.id);
    const subjectLinks = db.prepare(`
      SELECT caseId, personId FROM case_persons
      WHERE role = 'subject' AND caseId IN (${caseIds.map(() => '?').join(',')})
    `).all(...caseIds);
    // Only the first subject per case, matching the old query's LIMIT 1
    // behavior -- a case can technically have more than one 'subject'
    // link, but the list view only ever showed one name.
    const firstSubjectByCase = new Map();
    for (const link of subjectLinks) {
      if (!firstSubjectByCase.has(link.caseId)) firstSubjectByCase.set(link.caseId, link.personId);
    }
    const personIds = [...new Set(firstSubjectByCase.values())];
    const people = personIds.length ? await identityFetch(`/api/persons?ids=${personIds.join(',')}`) : [];
    const nameById = new Map(people.map(p => [p.id, `${p.firstName} ${p.lastName}`]));

    res.json(cases.map(c => ({
      ...c,
      subjectName: firstSubjectByCase.has(c.id) ? (nameById.get(firstSubjectByCase.get(c.id)) || null) : null,
    })));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET /api/cases/:id
router.get('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM cases WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});

// POST /api/cases
router.post('/', (req, res) => {
  const id = uuidv4();
  const now = new Date().toISOString();
  const caseNumber = nextCaseNumber();
  const data = {
    id,
    caseNumber,
    openedAt: now,
    incidentAt: req.body.incidentAt || null,
    schoolSite: req.body.schoolSite || '',
    location: req.body.location || '',
    incidentType: req.body.incidentType || '',
    createdBy: req.body.createdBy || '',
    assignedTo: req.body.assignedTo || '',
    initialNarrative: req.body.initialNarrative || '',
    immediateActions: req.body.immediateActions || '',
    status: req.body.status || 'Draft',
    disposition: req.body.disposition || null,
    lawEnforcementInvolved: req.body.lawEnforcementInvolved ? 1 : 0,
    safetyRiskLevel: req.body.safetyRiskLevel || 'low',
    createdAt: now,
    updatedAt: now
  };
  db.prepare(`
    INSERT INTO cases (id, caseNumber, openedAt, incidentAt, schoolSite, location, incidentType,
      createdBy, assignedTo, initialNarrative, immediateActions, status, disposition,
      lawEnforcementInvolved, safetyRiskLevel, createdAt, updatedAt)
    VALUES ($id, $caseNumber, $openedAt, $incidentAt, $schoolSite, $location, $incidentType,
      $createdBy, $assignedTo, $initialNarrative, $immediateActions, $status, $disposition,
      $lawEnforcementInvolved, $safetyRiskLevel, $createdAt, $updatedAt)
  `).run(data);
  res.json({ id, caseNumber });
});

// PATCH /api/cases/:id
router.patch('/:id', (req, res) => {
  const now = new Date().toISOString();
  const allowed = ['incidentAt', 'schoolSite', 'location', 'incidentType', 'createdBy',
    'assignedTo', 'initialNarrative', 'immediateActions', 'status', 'disposition',
    'lawEnforcementInvolved', 'safetyRiskLevel'];
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
  db.prepare(`UPDATE cases SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

module.exports = router;
