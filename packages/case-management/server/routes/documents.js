// server/routes/documents.js
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { identityFetch } = require('@fgsd/shared');
const { flatten: flattenPerson } = require('./persons');

const DISTRICT_PROPERTIES = [
  { name: 'District Office', address: '1728 Main Street, Forest Grove, OR 97116' },
  { name: 'Taylor Way Annex', address: '2701 Taylor Way, Forest Grove, OR 97116' },
  { name: 'Cornelius Elementary School', address: '200 N 14th Avenue, Cornelius, OR 97113' },
  { name: 'Dilley Elementary School', address: '4115 SW Dilley Road, Forest Grove, OR 97116' },
  { name: 'Echo Shaw Elementary School', address: '914 S Linden Street, Cornelius, OR 97113' },
  { name: 'Fern Hill Elementary School', address: '4445 Heather Street, Forest Grove, OR 97116' },
  { name: 'Forest Grove Community School', address: '1914 Pacific Avenue, Forest Grove, OR 97116' },
  { name: 'Harvey Clarke Elementary School', address: '2516 B Street, Forest Grove, OR 97116' },
  { name: 'Joseph Gale Elementary School', address: '3130 18th Avenue, Forest Grove, OR 97116' },
  { name: 'Tom McCall Upper Elementary School', address: '1255 Pacific Avenue, Forest Grove, OR 97116' },
  { name: 'Neil Armstrong Middle School', address: '1777 Mountain View Lane, Forest Grove, OR 97116' },
  { name: 'Forest Grove High School', address: '1401 Nichols Lane, Forest Grove, OR 97116' },
  { name: 'Oak Grove Academy', address: '9125 NW Sargent Road, Gales Creek, OR 97117' },
  { name: 'Tuality Plains High School', address: '2701 Taylor Way, Forest Grove, OR 97116' }
];

// GET /api/documents/vehicle-lookup?plate=X
// Convenience only -- looks up a vehicle in the Identity Service and
// returns fields shaped to autofill the Exclusion Notice's Vehicle
// section, but nothing about the notice itself is linked or required to
// resolve here. Not every vehicle mentioned on an exclusion notice will
// be in Identity (a visitor's car, a one-time contact), and this is a
// generated document, not a live record -- manual entry stays fully
// available either way. "type" (Auto/Motorcycle/etc) is left blank on a
// match: Identity doesn't track that distinction, and fabricating a
// value here would be worse than leaving it for a human to fill in.
router.get('/vehicle-lookup', async (req, res) => {
  try {
    const plate = (req.query.plate || '').trim();
    if (!plate) return res.status(400).json({ error: 'plate is required.' });
    const result = await identityFetch(`/api/vehicles/lookup?plate=${encodeURIComponent(plate)}`);
    if (!result.found) return res.json({ found: false });
    const v = result.vehicle;
    const reg = v.currentRegistration;
    res.json({
      found: true,
      vehicleInfo: {
        type: '',
        state: reg ? reg.state : '',
        regId: reg ? reg.plate : '',
        description: [v.year, v.make, v.model, v.color].filter(Boolean).join(' '),
      },
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET /api/documents/properties
router.get('/properties', (req, res) => {
  res.json(DISTRICT_PROPERTIES);
});

// GET /api/documents/case/:caseId
router.get('/case/:caseId', (req, res) => {
  res.json(db.prepare('SELECT * FROM documents WHERE caseId = ? ORDER BY generatedAt DESC').all(req.params.caseId));
});

// POST /api/documents/generate-exclusion
router.post('/generate-exclusion', async (req, res) => {
  try {
    const { caseId, subjectPersonId, noticeType, issuingOfficial, officialTitle,
      employeeId, agency, issuedDate, violationIds, vehicleInfo, otherInfo } = req.body;

    const caseData = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
    if (!caseData) return res.status(404).json({ error: 'Case not found' });

    let subject = null;
    if (subjectPersonId) {
      // Person biographic data now lives in the Identity Service -- see
      // routes/persons.js's flatten(), reused here so this document
      // generator doesn't maintain a second, separately-drifting version
      // of the same flattening logic. Soft-fail on its own: if Identity
      // is briefly unreachable, the notice still generates without
      // subject details rather than failing the whole request.
      try {
        const raw = await identityFetch(`/api/persons/${subjectPersonId}`);
        subject = flattenPerson(raw);
      } catch (err) {
        console.warn(`Exclusion notice generation: could not fetch subject ${subjectPersonId} from Identity Service:`, err.message);
      }
    }

    const violations = (violationIds && violationIds.length)
      ? db.prepare(`SELECT * FROM violations WHERE id IN (${violationIds.map(() => '?').join(',')})`)
          .all(...violationIds)
      : db.prepare('SELECT * FROM violations WHERE caseId = ?').all(caseId);

    const incidentDate = caseData.incidentAt ? new Date(caseData.incidentAt) : new Date();
    const isExclusion = noticeType === 'exclusion';

    const html = generateNoticeHTML({
      caseData, subject, violations, incidentDate,
      isExclusion, issuingOfficial, officialTitle,
      employeeId, agency, issuedDate, vehicleInfo, otherInfo
    });

    const docId = uuidv4();
    const now = new Date().toISOString();
    // Persist subjectPersonId + issuedDate so the cross-module exclusion
    // check (server/exclusions.js) can tie a served notice exactly to the
    // Identity Person it excluded and compute the correct active/expired
    // window from the date it took effect. issuedDate falls back to the
    // generation time when the form didn't supply one.
    db.prepare(`
      INSERT INTO documents (id, caseId, documentType, generatedAt, generatedBy, storedContent, subjectPersonId, issuedDate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(docId, caseId, isExclusion ? 'exclusion_notice' : 'cease_desist_notice',
      now, issuingOfficial || '', html, subjectPersonId || null, issuedDate || now);

    res.json({ id: docId, html });
  } catch (err) {
    console.error('POST /api/documents/generate-exclusion failed:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal error generating notice.', detail: err.message });
  }
});

// GET /api/documents/:id/html
router.get('/:id/html', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Type', 'text/html');
  res.send(doc.storedContent);
});

function fmt(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function fmtTime(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function generateNoticeHTML({ caseData, subject, violations, incidentDate, isExclusion,
  issuingOfficial, officialTitle, employeeId, agency, issuedDate, vehicleInfo, otherInfo }) {

  const s = subject || {};
  const violationRows = violations.map((v, i) => `
    <tr>
      <td class="vnum">${i + 1}. Violated<br><span class="cite">${v.citation || ''}</span></td>
      <td class="vdesc">${v.description || v.shortLabel || ''}</td>
      <td class="vlen">${v.exclusionLength || ''}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Notice of Violation / ${isExclusion ? 'Exclusion' : 'Cease and Desist'} – ${caseData.caseNumber}</title>
<style>
  @media print { .no-print { display: none; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11pt; background: #fff; color: #111; padding: 20px; }
  .page { max-width: 760px; margin: 0 auto; }
  .header { text-align: center; margin-bottom: 18px; }
  .header img { height: 80px; margin-bottom: 8px; }
  h1 { font-size: 15pt; font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
  td, th { border: 1px solid #555; padding: 5px 8px; vertical-align: top; }
  .section-header td { background: #1a1a2e; color: #fff; font-weight: bold; font-size: 10pt; padding: 4px 8px; }
  .label { font-weight: bold; font-size: 9.5pt; }
  .field { min-height: 18px; }
  .vnum { width: 130px; font-size: 9.5pt; }
  .cite { font-weight: bold; }
  .vdesc { font-size: 9.5pt; }
  .vlen { width: 130px; font-size: 9.5pt; }
  .checkbox-row td { padding: 10px 8px; font-size: 10pt; }
  .checkbox { display: inline-block; width: 14px; height: 14px; border: 2px solid #111;
    margin-right: 8px; vertical-align: middle; background: ${isExclusion ? '#111' : '#fff'}; }
  .checkbox2 { display: inline-block; width: 14px; height: 14px; border: 2px solid #111;
    margin-right: 8px; vertical-align: middle; background: ${!isExclusion ? '#111' : '#fff'}; }
  .appeal-text td { font-size: 9.5pt; padding: 8px; }
  .print-btn { display: block; margin: 18px auto; padding: 10px 32px; background: #1a1a2e;
    color: #fff; border: none; font-size: 12pt; cursor: pointer; border-radius: 4px; }
  .case-ref { font-size: 9pt; color: #555; text-align: right; margin-bottom: 6px; }
</style>
</head>
<body>
<div class="page">
  <div class="no-print case-ref">Case: ${caseData.caseNumber} | Generated: ${fmt(new Date().toISOString())}</div>
  <div class="header">
    <h1>Notice of Violation / ${isExclusion ? 'Exclusion' : 'Cease and Desist'}</h1>
  </div>
  <table>
    <tr><td class="section-header" colspan="4">The following subject:</td></tr>
    <tr>
      <td><span class="label">ID Type</span><br><span class="field">${s.idType || ''}</span></td>
      <td><span class="label">ID No.</span><br><span class="field">${s.idNumber || ''}</span></td>
      <td><span class="label">State</span><br><span class="field">${s.state || ''}</span></td>
      <td><span class="label">Phone</span><br><span class="field">${s.phone || ''}</span></td>
    </tr>
    <tr>
      <td colspan="2"><span class="label">Name (Last, First, Middle)</span><br>
        <span class="field">${s.lastName || ''}${s.lastName ? ',' : ''} ${s.firstName || ''} ${s.middleName || ''}</span></td>
      <td colspan="2"><span class="label">Aliases</span><br><span class="field">${s.aliases || ''}</span></td>
    </tr>
    <tr>
      <td colspan="4"><span class="label">Address</span><br><span class="field">${s.address || ''}</span></td>
    </tr>
    <tr>
      <td colspan="2"><span class="label">City</span><br><span class="field">${s.city || ''}</span></td>
      <td><span class="label">State</span><br><span class="field">${s.state || ''}</span></td>
      <td><span class="label">ZIP</span><br><span class="field">${s.zip || ''}</span></td>
    </tr>
    <tr>
      <td><span class="label">Sex</span><br><span class="field">${s.sex || ''}</span></td>
      <td><span class="label">Race</span><br><span class="field">${s.race || ''}</span></td>
      <td><span class="label">DOB</span><br><span class="field">${s.dob || ''}</span></td>
      <td><span class="label">Height</span><br><span class="field">${s.height || ''}</span></td>
    </tr>
    <tr>
      <td><span class="label">Weight</span><br><span class="field">${s.weight || ''}</span></td>
      <td><span class="label">Hair</span><br><span class="field">${s.hair || ''}</span></td>
      <td colspan="2"><span class="label">Eyes</span><br><span class="field">${s.eyes || ''}</span></td>
    </tr>

    <tr><td class="section-header" colspan="4">At the following time and place:</td></tr>
    <tr>
      <td colspan="2"><span class="label">Violation Date (on or about)</span><br>
        <span class="field">${fmt(incidentDate)}</span></td>
      <td colspan="2"><span class="label">Time</span><br>
        <span class="field">${fmtTime(caseData.incidentAt)}</span></td>
    </tr>
    <tr>
      <td colspan="4"><span class="label">Location</span><br>
        <span class="field">${caseData.location || caseData.schoolSite || ''}</span></td>
    </tr>

    <tr><td class="section-header" colspan="4">Involving the following:</td></tr>
    <tr>
      <td><span class="label">Type</span><br><span class="field">${vehicleInfo?.type || ''}</span></td>
      <td><span class="label">State</span><br><span class="field">${vehicleInfo?.state || ''}</span></td>
      <td colspan="2"><span class="label">Reg/VIN/ID No.</span><br><span class="field">${vehicleInfo?.regId || ''}</span></td>
    </tr>
    <tr>
      <td colspan="4"><span class="label">Vehicle year, make, model, style, color</span><br>
        <span class="field">${vehicleInfo?.description || ''}</span></td>
    </tr>
    <tr>
      <td colspan="4"><span class="label">Other</span><br>
        <span class="field">${otherInfo || ''}</span></td>
    </tr>

    <tr><td class="section-header" colspan="4">Did then and there violate the following:</td></tr>
    ${violationRows || `<tr><td colspan="4" style="text-align:center;color:#888;">No violations recorded.</td></tr>`}

    <tr class="checkbox-row">
      <td colspan="4">
        <p><span class="checkbox"></span>
        <strong>If this box is checked,</strong> you are hereby notified that due to your conduct described above,
        you have been <strong>excluded from entering any properties under the control of the Forest Grove School District.</strong>
        Entering upon such property while this notice is in effect, or refusing to leave the property at this time,
        will subject you to arrest and prosecution for <strong>ORS 164.245 Criminal Trespass in the Second Degree.</strong></p>
        <br>
        <p><span class="checkbox2"></span>
        <strong>If this box is checked,</strong> you are hereby notified to <strong>cease and desist</strong> the behavior described above.
        Failure to do so will subject you to being excluded from Forest Grove School District property.</p>
      </td>
    </tr>

    <tr class="appeal-text">
      <td colspan="4">
        You may appeal this notice by filing a written objection with the Superintendent within <strong>ten (10) days</strong>
        of receipt of this notice. Appeals may be mailed to: <strong>Dr. Suzanne West, Superintendent,
        Forest Grove School District, 1728 Main St, Forest Grove, OR 97116.</strong>
      </td>
    </tr>
    <tr>
      <td colspan="2"><span class="label">Date Issued</span><br><span class="field">${fmt(issuedDate) || fmt(new Date().toISOString())}</span></td>
      <td colspan="2"><span class="label">District Official / Officer's Signature</span><br>
        <span class="field" style="min-height:36px;">&nbsp;</span></td>
    </tr>
    <tr>
      <td colspan="2"><span class="label">Print Name</span><br>
        <span class="field">${issuingOfficial || ''}</span></td>
      <td><span class="label">Employee ID / DPSST</span><br><span class="field">${employeeId || ''}</span></td>
      <td><span class="label">Agency</span><br><span class="field">${agency || 'Forest Grove School District'}</span></td>
    </tr>
  </table>

  <button class="print-btn no-print" onclick="window.print()">🖨 Print / Save as PDF</button>
</div>
</body>
</html>`;
}

module.exports = router;
