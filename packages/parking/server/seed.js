// server/seed.js
const { initDB, db } = require('./db');
const { v4: uuidv4 } = require('uuid');

async function run() {
  await initDB();

  // Sourced directly from proposed Board Policy ECD §4(A)-(M) --
  // wording, offense names, and classes are the policy's own, not
  // paraphrased. A and B adopt the Oregon Vehicle Code and Forest Grove
  // Traffic Code by reference (penalty follows the underlying statute, so
  // no fixed violationClass); C-M are District-created rules with a fixed
  // class under ORS 153.
  const VIOLATION_CODES = [
    { violationBasis: 'Vehicle Code', citation: 'FGSD Rule 4(A)', shortLabel: 'Violation of the Oregon Vehicle Code', description: 'The Oregon Vehicle Code (ORS 801-826) and ORS Chapter 153 are adopted by reference. Penalty is the same as prescribed by the statute violated.', violationClass: 'Per statute violated' },
    { violationBasis: 'Forest Grove Traffic Code', citation: 'FGSD Rule 4(B)', shortLabel: 'Violation of the Forest Grove Traffic Code', description: 'The Forest Grove Traffic Code (Title VII) is adopted by reference on District property within Forest Grove city limits. Penalty is the same as prescribed by the code provision violated.', violationClass: 'Per code provision violated' },
    { violationBasis: 'District Rule', citation: 'FGSD Rule 4(C)', shortLabel: 'Failure to Obey a District Parking Control Device', description: 'The driver of a vehicle commits this offense if they park or stop in any parking space designated by the Road Authority or Superintendent in violation of a parking control device.', violationClass: 'Class D Violation' },
    { violationBasis: 'District Rule', citation: 'FGSD Rule 4(D)', shortLabel: 'Failure to Obey a District Traffic Control Device', description: 'The driver of a vehicle commits this offense if they operate a vehicle in such a manner that fails to obey a traffic control device.', violationClass: 'Class C Traffic Violation' },
    { violationBasis: 'District Rule', citation: 'FGSD Rule 4(E)', shortLabel: 'Failure to Obey a District Official or Enforcement Officer', description: 'The driver of a vehicle commits this offense if a District Official or Enforcement Officer gives the driver a lawful order and the driver fails to obey.', violationClass: 'Class C Traffic Violation' },
    { violationBasis: 'District Rule', citation: 'FGSD Rule 4(F)', shortLabel: 'Interfering with or Obstructing District Official or Enforcement Officer', description: 'The driver of a vehicle commits this offense if the driver obstructs or interferes with a District Official or Enforcement Officer directing traffic, investigating violations, or enforcing this code.', violationClass: 'Class A Traffic Violation' },
    { violationBasis: 'District Rule', citation: 'FGSD Rule 4(G)', shortLabel: 'Obstructing a Fire Lane', description: 'The driver of a vehicle commits this offense if they stop within, park within, or otherwise obstruct a marked fire lane at any time. An Enforcement Officer may immediately tow as a public nuisance to be summarily abated.', violationClass: 'Class D Violation' },
    { violationBasis: 'District Rule', citation: 'FGSD Rule 4(H)', shortLabel: 'Parking in a Restricted Zone without Permit or Authority', description: 'The driver of a vehicle commits this offense if the driver parks a vehicle in a parking zone restricted by the Superintendent and lacks a permit or other authority to do so.', violationClass: 'Class D Violation' },
    { violationBasis: 'District Rule', citation: 'FGSD Rule 4(I)', shortLabel: 'Prohibited Parking', description: 'The driver of a vehicle commits this offense if they park outside of any clearly marked parking space, or in violation of any posted parking control signs or markings prohibiting parking. If obstructing traffic, an Enforcement Officer may immediately tow as a public nuisance.', violationClass: 'Class D Violation' },
    { violationBasis: 'District Rule', citation: 'FGSD Rule 4(J)', shortLabel: 'Driving on Closed Road or Area', description: 'The driver of a vehicle commits this offense if they operate a vehicle on any road or area posted by a traffic control device as closed to some or all vehicle traffic, in violation of that restriction.', violationClass: 'Class C Traffic Violation' },
    { violationBasis: 'District Rule', citation: 'FGSD Rule 4(K)', shortLabel: 'Driving on a Closed Road during Posted Hours', description: 'The driver of a vehicle commits this offense if they drive and enter or remain upon a closed road during hours the road is posted as closed to the public.', violationClass: 'Class B Traffic Violation' },
    { violationBasis: 'District Rule', citation: 'FGSD Rule 4(L)', shortLabel: 'Loitering in a Parked Vehicle', description: 'The driver and occupants of a vehicle commit this offense if a vehicle is parked on District Property for an extended period of time and the driver or passengers loiter with no valid or legitimate purpose or business on District property.', violationClass: 'Class B Traffic Violation' },
    { violationBasis: 'District Rule', citation: 'FGSD Rule 4(M)', shortLabel: 'Failure to Register a Vehicle', description: 'The registered owner of a vehicle required to register under §3(G) of this policy commits this offense by failing to do so.', violationClass: 'Class D Traffic Violation' },
  ];

  for (const v of VIOLATION_CODES) {
    try {
      db.prepare(`INSERT OR IGNORE INTO violation_codes (id, violationBasis, citation, shortLabel, description, violationClass)
        VALUES ($id, $violationBasis, $citation, $shortLabel, $description, $violationClass)`)
        .run({ id: uuidv4(), ...v });
    } catch (e) { /* already seeded */ }
  }
  console.log(`✓ Violation Code Library seeded (${VIOLATION_CODES.length} entries, from ECD §4)`);

  // Demo Staff/Officer roster. Names/IDs are placeholders (clearly
  // labeled "Demo"), not real district personnel -- do not treat these as
  // real employee records.
  const STAFF = [
    { id: uuidv4(), name: 'Demo Public Safety Officer', employeeIdNumber: 'E-DEMO-01', dpsstNumber: 'DPSST-DEMO-01', role: 'Public Safety Officer', dmv2uAuthorized: 1 },
    { id: uuidv4(), name: 'Demo Student Supervisor', employeeIdNumber: 'E-DEMO-02', dpsstNumber: '', role: 'Student Supervisor', dmv2uAuthorized: 1 },
    { id: uuidv4(), name: 'Demo District Safety Coordinator', employeeIdNumber: 'E-DEMO-03', dpsstNumber: 'DPSST-DEMO-03', role: 'District Safety Coordinator', dmv2uAuthorized: 1 },
  ];
  const now0 = new Date().toISOString();
  for (const s of STAFF) {
    try {
      db.prepare(`INSERT OR IGNORE INTO staff (id, name, employeeIdNumber, dpsstNumber, role, dmv2uAuthorized, active, createdAt, updatedAt)
        VALUES ($id, $name, $employeeIdNumber, $dpsstNumber, $role, $dmv2uAuthorized, 1, $now, $now)`)
        .run({ ...s, now: now0 });
    } catch (e) { /* already seeded */ }
  }
  console.log(`✓ Demo Staff roster seeded (${STAFF.length} entries)`);
  const demoStaffId = STAFF[0].id;

  // Minimal demo data so the module is exercisable end-to-end without
  // depending on case-management's persons table (no shared Person store
  // exists yet -- see RESUME_PROJECT_NOTE.md / dashboard red items).
  // personId values here are placeholder strings, not real Person records.
  const demoVehicleId = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`INSERT OR IGNORE INTO vehicles (id, plate, state, vin, make, model, year, color,
      ownerPersonId, ownerName, ownerRelationship, enteredBy,
      selfReported, dmvVerified, dmvVerifiedAt, createdAt, updatedAt)
    VALUES ($id, 'DEMO123', 'OR', '1FADP3F20EL123456', 'Ford', 'Focus', '2021', 'Blue',
      'demo-person-1', 'Pat Demo (Parent)', 'Parent', $enteredBy, 1, 0, NULL, $now, $now)`)
    .run({ id: demoVehicleId, now, enteredBy: demoStaffId });

  db.prepare(`INSERT OR IGNORE INTO parking_permits (id, personId, vehicleId, permitNumber, schoolSite,
      registrantName, affiliateType, studentIdNumber, employeeIdNumber,
      driverLicenseNumber, driverLicenseState,
      insuranceCarrier, insurancePolicyNumber, insurancePolicyExpiration,
      ownershipInfo, permitType, parkingZone, issuedBy,
      issuedDate, expirationDate, status, createdAt, updatedAt)
    VALUES ($id, 'demo-person-1', $vehicleId, 'PERMIT-2026-0001', 'Forest Grove High School',
      'Demo Student', 'Student', 'S1234567', '',
      'DEMO1234D', 'OR',
      'Demo Mutual Insurance', 'POL-DEMO-0001', '2026-12-31',
      'Registered to parent (see Vehicle record)', 'Student', 'Lot A - Student', $issuedBy,
      $now, NULL, 'Active', $now, $now)`)
    .run({ id: uuidv4(), vehicleId: demoVehicleId, now, issuedBy: demoStaffId });

  console.log('✓ Demo vehicle + active Student permit seeded (for Administrative-track citation testing)');

  // Second demo vehicle with an already-expired permit -- makes the sweep
  // and renewal flow visible/testable immediately after seeding, rather
  // than needing to wait for a real permit to actually expire.
  const expiredVehicleId = uuidv4();
  db.prepare(`INSERT OR IGNORE INTO vehicles (id, plate, state, vin, make, model, year, color,
      ownerPersonId, ownerName, ownerRelationship, enteredBy,
      selfReported, dmvVerified, dmvVerifiedAt, createdAt, updatedAt)
    VALUES ($id, 'EXPIRED1', 'OR', '2HGES16561H123456', 'Honda', 'Civic', '2019', 'Silver',
      'demo-person-2', 'Alex Demo', 'Self', $enteredBy, 1, 0, NULL, $now, $now)`)
    .run({ id: expiredVehicleId, now, enteredBy: demoStaffId });

  db.prepare(`INSERT OR IGNORE INTO parking_permits (id, personId, vehicleId, permitNumber, schoolSite,
      registrantName, affiliateType, studentIdNumber, employeeIdNumber,
      driverLicenseNumber, driverLicenseState,
      insuranceCarrier, insurancePolicyNumber, insurancePolicyExpiration,
      ownershipInfo, permitType, parkingZone, issuedBy,
      issuedDate, expirationDate, status, createdAt, updatedAt)
    VALUES ($id, 'demo-person-2', $vehicleId, 'PERMIT-2025-DEMO2', 'Forest Grove High School',
      'Alex Demo', 'Student', 'S7654321', '',
      'DEMO9876D', 'OR',
      'Demo Mutual Insurance', 'POL-DEMO-0002', '2025-12-31',
      '', 'Student', 'Lot A - Student', $issuedBy,
      '2025-01-15T00:00:00.000Z', '2025-06-30', 'Active', $createdAt, $now)`)
    .run({ id: uuidv4(), vehicleId: expiredVehicleId, issuedBy: demoStaffId, createdAt: '2025-01-15T00:00:00.000Z', now });

  console.log('✓ Demo vehicle with an already-expired permit seeded (status still says Active until the next read sweeps it -- demonstrates the expiration sweep)');
  console.log('\n✅ All parking module seed data complete. Run: npm run parking\n');
}

run().catch(e => { console.error(e); process.exit(1); });
