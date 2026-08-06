// server/routes/citations.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { RecordsClassification, formatCaseNumber, identityFetch } = require('@fgsd/shared');
const { requireFeature } = require('../featureGate');
const { requireActiveStaff } = require('./staff');
const { getActiveValidPermitForVehicle } = require('./permits');
const { flatten: flattenVehicle } = require('./vehicles');
const { checkExclusions } = require('./exclusionChecks');

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }

// Citation Number generation, DB-backed (annual reset). Distinct from
// caseNumber -- every issued citation gets one immediately, regardless of
// track, because a driver needs something to reference the citation by
// whether or not it ever escalates to a court filing. caseNumber remains
// reserved for the Court-track filing moment specifically, per design doc
// §4.12. Format deliberately different from caseNumber's FGSD-YYYY-#####
// so the two are never visually confusable on a printed citation.
function nextCitationNumber() {
  const year = new Date().getFullYear();
  const prefix = `FGSD-CIT-${year}-`;
  const latest = db.prepare(
    `SELECT citationNumber FROM citations WHERE citationNumber LIKE ? ORDER BY citationNumber DESC LIMIT 1`
  ).get(`${prefix}%`);
  const parsed = latest ? parseInt(latest.citationNumber.split('-').pop(), 10) : NaN;
  const nextSeq = Number.isNaN(parsed) ? 1 : parsed + 1;
  return `${prefix}${String(nextSeq).padStart(5, '0')}`;
}

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

// GET /api/citations/:id/print
// Print-ready HTML sized for a narrow mobile receipt printer (Zebra
// ZQ511, Brother mobile printers, etc.) rather than a full 8.5x11 page.
// Deliberately uses the browser's normal print pipeline (window.print())
// instead of talking to the printer directly with vendor-specific raw
// commands (Zebra ZPL, Brother's own command set) -- that keeps this
// printer-agnostic. Whatever print driver/connector app the officer's
// phone or tablet has installed for their specific printer handles the
// actual output; this route only has to produce a page CSS-sized for
// receipt-width paper (~80mm), same as any other print job.
router.get('/:id/print', async (req, res) => {
  const citation = db.prepare('SELECT * FROM citations WHERE id = ?').get(req.params.id);
  if (!citation) return res.status(404).send('Not found');
  // Vehicle master data now lives in the Identity Service (Phase 2) --
  // fetched via the same flatten() shape parking's own vehicles.js proxy
  // returns, so this route doesn't need its own separate flattening
  // logic. A vehicle lookup failure (e.g. identity service down) prints
  // the citation without vehicle details rather than failing the whole
  // print -- an officer still needs the citation printed even if a
  // dependency is briefly unreachable.
  let vehicle = null;
  if (citation.vehicleId) {
    try {
      const raw = await identityFetch(`/api/vehicles/${citation.vehicleId}`);
      vehicle = flattenVehicle(raw);
    } catch (err) {
      console.warn(`Citation print: could not fetch vehicle ${citation.vehicleId} from Identity Service:`, err.message);
    }
  }
  const code = db.prepare('SELECT * FROM violation_codes WHERE id = ?').get(citation.violationCodeId) || {};
  const officer = db.prepare('SELECT * FROM staff WHERE id = ?').get(citation.enforcementOfficerId) || {};

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '';
  const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Citation ${citation.citationNumber || citation.id}</title>
<style>
  @page { size: 80mm auto; margin: 3mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.4; color: #000; width: 74mm; padding: 4px; }
  h1 { font-size: 13px; text-align: center; margin-bottom: 2px; }
  .sub { text-align: center; font-size: 10px; margin-bottom: 8px; }
  .rule { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; }
  .label { font-weight: bold; }
  .section { margin-bottom: 6px; }
  .footer { font-size: 9px; margin-top: 10px; }
  .no-print { text-align: center; margin-top: 14px; }
  .no-print button { font-size: 12px; padding: 6px 16px; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <h1>FOREST GROVE SCHOOL DISTRICT</h1>
  <div class="sub">PARKING CITATION</div>
  <div class="rule"></div>

  <div class="section">
    <div class="row"><span class="label">Citation #</span><span>${esc(citation.citationNumber || '(unassigned)')}</span></div>
    <div class="row"><span class="label">Date</span><span>${esc(fmtDate(citation.dateIssued))}</span></div>
    <div class="row"><span class="label">Time</span><span>${esc(fmtTime(citation.dateIssued))}</span></div>
    <div class="row"><span class="label">Type</span><span>${esc(citation.citationType)}</span></div>
  </div>
  <div class="rule"></div>

  <div class="section">
    <div class="label">LOCATION</div>
    <div>${esc(citation.location || '(not recorded)')}</div>
  </div>
  <div class="rule"></div>

  ${vehicle ? `
  <div class="section">
    <div class="label">VEHICLE</div>
    <div>${esc(vehicle.plate)} (${esc(vehicle.state)})</div>
    <div>${esc(vehicle.year)} ${esc(vehicle.make)} ${esc(vehicle.model)}, ${esc(vehicle.color)}</div>
  </div>
  <div class="rule"></div>` : ''}

  <div class="section">
    <div class="label">VIOLATION</div>
    <div>${esc(code.citation || '')}</div>
    <div>${esc(code.shortLabel || '')}</div>
    <div>${esc(code.violationClass || '')}</div>
  </div>
  <div class="rule"></div>

  <div class="section">
    <div class="label">ISSUING OFFICER</div>
    <div>${esc(officer.name || '(unassigned)')}</div>
    ${officer.dpsstNumber ? `<div>DPSST# ${esc(officer.dpsstNumber)}</div>` : ''}
  </div>
  <div class="rule"></div>

  <div class="footer">
    ${citation.citationType === 'Administrative'
      ? 'This is an administrative citation issued under District parking rules. Contact District Public Safety with questions.'
      : 'This citation may be filed with the applicable municipal or justice court under ORS 153.045. Contact District Public Safety with questions.'}
  </div>

  <div class="no-print">
    <button onclick="window.print()">Print</button>
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// POST /api/citations/:id/mark-printed
// Tracks that a citation was actually generated for printing and by
// whom -- "opened for print" is the honest thing being tracked (a browser
// can't reliably report back whether a print job actually completed or
// was cancelled), same posture as attachments.js's honesty about what a
// prototype file-delete can and can't audit.
router.post('/:id/mark-printed', (req, res) => {
  try {
    const citation = db.prepare('SELECT * FROM citations WHERE id = ?').get(req.params.id);
    if (!citation) return res.status(404).json({ error: 'Not found' });
    const printer = requireActiveStaff(req.body.printedBy, 'printedBy');
    const now = new Date().toISOString();
    db.prepare('UPDATE citations SET printedAt = ?, printedBy = ?, updatedAt = ? WHERE id = ?')
      .run(now, printer.id, now, req.params.id);
    res.json({ ok: true, printedAt: now });
  } catch (err) {
    console.error('POST /api/citations/:id/mark-printed failed:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal error marking citation printed.', detail: err.message });
  }
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
router.post('/', async (req, res) => {
  try {
  const {
    vehicleId, personId, identityPersonId, violationCodeId, citationType,
    enforcementOfficerId, location, dateIssued, incidentNumber, notes,
  } = req.body;

  if (!violationCodeId || !enforcementOfficerId) {
    return res.status(400).json({ error: 'violationCodeId and enforcementOfficerId are required.' });
  }

  // identityPersonId is always optional (per the settled Person-linkage
  // policy) -- when a staff member did link one via search, validate it
  // actually resolves before accepting it, same defensive posture as
  // every other cross-service reference in this codebase (e.g.
  // ownerPersonId on vehicles.js).
  if (identityPersonId) {
    try {
      await identityFetch(`/api/persons/${identityPersonId}`);
    } catch (err) {
      return res.status(400).json({ error: `identityPersonId does not match a real Identity Person record: ${err.message}` });
    }
  }

  // enforcementOfficerId must be a real, active Staff record now -- not
  // whatever string a form happened to have in it. Per ECD §2(D), a
  // citation-issuing Enforcement Officer is a real, designated role, not
  // just "anyone in Public Safety" -- this doesn't fully enforce that
  // distinction (staff.role is free text, not a strict permission system,
  // since there's still no auth anywhere in this monorepo), but it does
  // guarantee the name on a citation traces back to a real roster entry.
  const officer = requireActiveStaff(enforcementOfficerId, 'enforcementOfficerId');

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
    // red/unbuilt item -- see dashboard). Uses permits.js's shared
    // getActiveValidPermitForVehicle() (not an inline query here) so an
    // expired-but-still-marked-Active permit can't slip through -- that
    // helper sweeps expired permits before checking, and is the single
    // source of truth other routes rely on for this same question too.
    if (vehicleId) {
      const activePermit = getActiveValidPermitForVehicle(vehicleId);
      if (!activePermit) {
        return res.status(422).json({
          error: 'No active parking permit found for this vehicle. Administrative citations require a properly registered, unexpired vehicle permit per ECD §5(A) -- issue a Court-track citation instead.',
        });
      }
    }
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const data = {
    id,
    citationNumber: nextCitationNumber(),
    incidentNumber: incidentNumber || null,
    caseNumber: null, // assigned only when a Court citation is filed -- see /:id/file-with-court
    vehicleId: vehicleId || null,
    personId: personId || null,
    identityPersonId: identityPersonId || null,
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
    INSERT INTO citations (id, citationNumber, incidentNumber, caseNumber, vehicleId, personId, identityPersonId, violationCodeId,
      citationType, recordsClassification, enforcementOfficerId, location, dateIssued, status, notes,
      createdAt, updatedAt)
    VALUES ($id, $citationNumber, $incidentNumber, $caseNumber, $vehicleId, $personId, $identityPersonId, $violationCodeId,
      $citationType, $recordsClassification, $enforcementOfficerId, $location, $dateIssued, $status, $notes,
      $createdAt, $updatedAt)
  `).run(data);

  // Advisory (never blocking): if the citation was linked to a real
  // Identity Person, surface whether that person is currently excluded
  // from district property, so the confirmation can flag it. The citation
  // is already written by this point -- writing a citation for an excluded
  // person is legitimate and important, so this only informs. Soft-fails
  // silently if case-management is unreachable.
  let exclusionAdvisory = null;
  if (identityPersonId) {
    const check = await checkExclusions([identityPersonId]);
    exclusionAdvisory = check.available ? (check.results[identityPersonId] || null) : { available: false };
  }

  res.json({ id, citationNumber: data.citationNumber, citationType: type, recordsClassification: data.recordsClassification, exclusionAdvisory });
  } catch (err) {
    console.error('POST /api/citations failed:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal error creating citation.', detail: err.message });
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
