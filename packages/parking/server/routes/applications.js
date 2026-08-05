// server/routes/applications.js
// Self-registration workflow, same shape as Reunification's claimant-entry
// -> staff-approval pattern (design doc/dashboard already established this
// as the working model for "person self-enters, staff confirms before it
// becomes official"). No document upload yet -- see db.js's comment above
// the permit_applications table and RESUME_PROJECT_NOTE.md.
//
// IMPORTANT: there is no auth/role system anywhere in this monorepo yet
// (a red item on the dashboard for every package). This route does not
// distinguish "a student submitting their own application" from "staff
// reviewing/approving it" beyond which endpoint is called -- anyone who
// can reach this API can call the approve/reject routes today. That's a
// real gap, not an oversight to paper over; flagging it here so it isn't
// missed when auth eventually gets built.
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { requireActiveStaff } = require('./staff');

const PERMIT_TYPES = [
  'Student', 'Faculty/Staff', 'Visitor', 'Vendor/Contractor',
  'ADA/Accessible', 'Temporary', 'Reserved',
];

function nextPermitNumber() {
  const year = new Date().getFullYear();
  const prefix = `PERMIT-${year}-`;
  const latest = db.prepare(
    `SELECT permitNumber FROM parking_permits WHERE permitNumber LIKE ? ORDER BY permitNumber DESC LIMIT 1`
  ).get(`${prefix}%`);
  const parsed = latest ? parseInt(latest.permitNumber.split('-').pop(), 10) : NaN;
  const nextSeq = Number.isNaN(parsed) ? 1 : parsed + 1;
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

// GET /api/applications - review queue, optional status filter
router.get('/', (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT * FROM permit_applications WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY submittedAt DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM permit_applications WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  res.json(a);
});

// POST /api/applications -- self-submission. Same field set as a Permit
// (minus permit-issuance-only fields like permitNumber/status), since the
// applicant is providing everything staff would otherwise type in
// manually via the direct "Issue Permit" path in permits.js.
router.post('/', (req, res) => {
  const required = ['personId', 'registrantName', 'vehiclePlate'];
  for (const key of required) {
    if (!req.body[key]) return res.status(400).json({ error: `${key} is required.` });
  }
  const permitTypeRequested = PERMIT_TYPES.includes(req.body.permitTypeRequested) ? req.body.permitTypeRequested : 'Student';
  const id = uuidv4();
  const now = new Date().toISOString();
  const data = {
    id,
    personId: req.body.personId,
    registrantName: req.body.registrantName,
    affiliateType: req.body.affiliateType || '',
    studentIdNumber: req.body.studentIdNumber || '',
    employeeIdNumber: req.body.employeeIdNumber || '',
    vehiclePlate: req.body.vehiclePlate,
    vehicleState: req.body.vehicleState || 'OR',
    vehicleVin: req.body.vehicleVin || '',
    vehicleMake: req.body.vehicleMake || '',
    vehicleModel: req.body.vehicleModel || '',
    vehicleYear: req.body.vehicleYear || '',
    vehicleColor: req.body.vehicleColor || '',
    ownerName: req.body.ownerName || '',
    ownerRelationship: req.body.ownerRelationship || '',
    driverLicenseNumber: req.body.driverLicenseNumber || '',
    driverLicenseState: req.body.driverLicenseState || 'OR',
    insuranceCarrier: req.body.insuranceCarrier || '',
    insurancePolicyNumber: req.body.insurancePolicyNumber || '',
    insurancePolicyExpiration: req.body.insurancePolicyExpiration || null,
    permitTypeRequested,
    parkingZoneRequested: req.body.parkingZoneRequested || '',
    schoolSite: req.body.schoolSite || '',
    uploadNotes: req.body.uploadNotes || '',
    status: 'Submitted',
    submittedAt: now,
    reviewedBy: null, reviewedAt: null, reviewNotes: null,
    resultingVehicleId: null, resultingPermitId: null,
    createdAt: now, updatedAt: now,
  };
  db.prepare(`
    INSERT INTO permit_applications (id, personId, registrantName, affiliateType,
      studentIdNumber, employeeIdNumber, vehiclePlate, vehicleState, vehicleVin,
      vehicleMake, vehicleModel, vehicleYear, vehicleColor, ownerName, ownerRelationship,
      driverLicenseNumber, driverLicenseState, insuranceCarrier, insurancePolicyNumber,
      insurancePolicyExpiration, permitTypeRequested, parkingZoneRequested, schoolSite,
      uploadNotes, status, submittedAt, reviewedBy, reviewedAt, reviewNotes,
      resultingVehicleId, resultingPermitId, createdAt, updatedAt)
    VALUES ($id, $personId, $registrantName, $affiliateType,
      $studentIdNumber, $employeeIdNumber, $vehiclePlate, $vehicleState, $vehicleVin,
      $vehicleMake, $vehicleModel, $vehicleYear, $vehicleColor, $ownerName, $ownerRelationship,
      $driverLicenseNumber, $driverLicenseState, $insuranceCarrier, $insurancePolicyNumber,
      $insurancePolicyExpiration, $permitTypeRequested, $parkingZoneRequested, $schoolSite,
      $uploadNotes, $status, $submittedAt, $reviewedBy, $reviewedAt, $reviewNotes,
      $resultingVehicleId, $resultingPermitId, $createdAt, $updatedAt)
  `).run(data);
  res.json({ id });
});

// POST /api/applications/:id/approve
// Staff review confirms identity/license/insurance are valid, then this
// creates the real Vehicle + Permit records from the application's data
// and links back for audit trail (design doc's general pattern: track
// provenance, don't just overwrite).
router.post('/:id/approve', (req, res) => {
  try {
    const app = db.prepare('SELECT * FROM permit_applications WHERE id = ?').get(req.params.id);
    if (!app) return res.status(404).json({ error: 'Not found' });
    if (app.status !== 'Submitted' && app.status !== 'Under Review') {
      return res.status(400).json({ error: `Cannot approve an application with status "${app.status}".` });
    }
    const reviewer = requireActiveStaff(req.body.reviewedBy, 'reviewedBy');

    const now = new Date().toISOString();
    const vehicleId = uuidv4();
    db.prepare(`
      INSERT INTO vehicles (id, plate, state, vin, make, model, year, color,
        ownerPersonId, ownerName, ownerRelationship, enteredBy,
        selfReported, dmvVerified, dmvVerifiedAt, createdAt, updatedAt)
      VALUES ($id, $plate, $state, $vin, $make, $model, $year, $color,
        $ownerPersonId, $ownerName, $ownerRelationship, $enteredBy,
        1, 0, NULL, $createdAt, $updatedAt)
    `).run({
      id: vehicleId, plate: app.vehiclePlate, state: app.vehicleState, vin: app.vehicleVin,
      make: app.vehicleMake, model: app.vehicleModel, year: app.vehicleYear, color: app.vehicleColor,
      ownerPersonId: app.personId, ownerName: app.ownerName || app.registrantName,
      ownerRelationship: app.ownerRelationship || 'Self', enteredBy: reviewer.id,
      createdAt: now, updatedAt: now,
    });

    const permitId = uuidv4();
    const permitNumber = nextPermitNumber();
    db.prepare(`
      INSERT INTO parking_permits (id, personId, vehicleId, permitNumber, schoolSite,
        registrantName, affiliateType, studentIdNumber, employeeIdNumber,
        driverLicenseNumber, driverLicenseState,
        insuranceCarrier, insurancePolicyNumber, insurancePolicyExpiration,
        ownershipInfo, permitType, parkingZone, issuedBy,
        issuedDate, expirationDate, status, createdAt, updatedAt)
      VALUES ($id, $personId, $vehicleId, $permitNumber, $schoolSite,
        $registrantName, $affiliateType, $studentIdNumber, $employeeIdNumber,
        $driverLicenseNumber, $driverLicenseState,
        $insuranceCarrier, $insurancePolicyNumber, $insurancePolicyExpiration,
        $ownershipInfo, $permitType, $parkingZone, $issuedBy,
        $issuedDate, NULL, 'Active', $createdAt, $updatedAt)
    `).run({
      id: permitId, personId: app.personId, vehicleId, permitNumber, schoolSite: app.schoolSite,
      registrantName: app.registrantName, affiliateType: app.affiliateType,
      studentIdNumber: app.studentIdNumber, employeeIdNumber: app.employeeIdNumber,
      driverLicenseNumber: app.driverLicenseNumber, driverLicenseState: app.driverLicenseState,
      insuranceCarrier: app.insuranceCarrier, insurancePolicyNumber: app.insurancePolicyNumber,
      insurancePolicyExpiration: app.insurancePolicyExpiration,
      ownershipInfo: app.ownerName ? `Registered to ${app.ownerName} (${app.ownerRelationship || 'relationship not specified'})` : '',
      permitType: app.permitTypeRequested, parkingZone: app.parkingZoneRequested, issuedBy: reviewer.id,
      issuedDate: now, createdAt: now, updatedAt: now,
    });

    db.prepare(`
      UPDATE permit_applications SET status = 'Approved', reviewedBy = ?, reviewedAt = ?,
        reviewNotes = ?, resultingVehicleId = ?, resultingPermitId = ?, updatedAt = ?
      WHERE id = ?
    `).run(reviewer.id, now, req.body.reviewNotes || '', vehicleId, permitId, now, req.params.id);

    res.json({ id: req.params.id, vehicleId, permitId, permitNumber });
  } catch (err) {
    console.error('POST /api/applications/:id/approve failed:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal error approving application.', detail: err.message });
  }
});

// POST /api/applications/:id/reject
router.post('/:id/reject', (req, res) => {
  try {
    const app = db.prepare('SELECT * FROM permit_applications WHERE id = ?').get(req.params.id);
    if (!app) return res.status(404).json({ error: 'Not found' });
    const reviewer = requireActiveStaff(req.body.reviewedBy, 'reviewedBy');
    if (!req.body.reviewNotes) {
      return res.status(400).json({ error: 'reviewNotes is required to reject an application.' });
    }
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE permit_applications SET status = 'Rejected', reviewedBy = ?, reviewedAt = ?,
        reviewNotes = ?, updatedAt = ? WHERE id = ?
    `).run(reviewer.id, now, req.body.reviewNotes, now, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/applications/:id/reject failed:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal error rejecting application.', detail: err.message });
  }
});

module.exports = router;
