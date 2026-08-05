// server/seed.js
//
// Every insert below checks for an existing row by a real NATURAL key
// (name, VIN, synergyImportId, etc.) before creating one. This matters:
// `id` is a freshly generated uuidv4() on every run, so `INSERT OR
// IGNORE` alone does nothing to prevent duplicates -- it only dedupes on
// a PRIMARY KEY collision, and a new random UUID never collides with
// anything. An earlier version of this file used INSERT OR IGNORE
// without a natural-key check first, and running `npm run identity:seed`
// more than once (easy to do by accident) silently doubled every
// location and demo person. Caught from a live screenshot showing
// Locations (32) instead of 16 and duplicate Demo, Alex / Demo, Jamie
// rows -- fixed here for real, not just noted.
const { initDB, db } = require('./db');
const { v4: uuidv4 } = require('uuid');

async function run() {
  await initDB();

  // Real FGSD building directory (the "School file"), matching the more
  // complete 16-site list used elsewhere in this project (the AAR
  // building directory), not the older 14-site list from the KGB
  // Exclusion Notice form. Addresses are filled in where confirmed from
  // that earlier document; left blank where not confirmed rather than
  // guessed -- fabricating an address for a real school building is
  // exactly the kind of unverified-data-in-a-compliance-relevant-record
  // this project has consistently avoided. Josh can fill in the rest via
  // the Locations tab.
  const LOCATIONS = [
    { name: 'District Office', address: '1728 Main Street, Forest Grove, OR 97116', siteType: 'District Office' },
    { name: 'Cornelius Elementary School', address: '200 N 14th Avenue, Cornelius, OR 97113', siteType: 'School' },
    { name: 'Dilley Elementary School', address: '4115 SW Dilley Road, Forest Grove, OR 97116', siteType: 'School' },
    { name: 'Echo Shaw Elementary School', address: '914 S Linden Street, Cornelius, OR 97113', siteType: 'School' },
    { name: 'Fern Hill Elementary School', address: '4445 Heather Street, Forest Grove, OR 97116', siteType: 'School' },
    { name: 'Forest Grove High School', address: '1401 Nichols Lane, Forest Grove, OR 97116', siteType: 'School' },
    { name: 'Harvey Clarke Elementary School', address: '2516 B Street, Forest Grove, OR 97116', siteType: 'School' },
    { name: 'Joseph Gale Elementary School', address: '3130 18th Avenue, Forest Grove, OR 97116', siteType: 'School' },
    { name: 'Neil Armstrong Middle School', address: '1777 Mountain View Lane, Forest Grove, OR 97116', siteType: 'School' },
    { name: 'Oak Grove Academy - Gales Creek', address: '9125 NW Sargent Road, Gales Creek, OR 97117', siteType: 'School' },
    { name: 'Oak Grove Academy - Tom McCall', address: '', siteType: 'School' },
    { name: 'Taylor Way Support Annex (TWSA)', address: '2701 Taylor Way, Forest Grove, OR 97116', siteType: 'Annex' },
    { name: 'Tom McCall Upper Elementary School', address: '1255 Pacific Avenue, Forest Grove, OR 97116', siteType: 'School' },
    { name: 'Tuality Plains High School', address: '2701 Taylor Way, Forest Grove, OR 97116', siteType: 'School' },
    { name: 'Cedar Street Transitional Campus (FGHS)', address: '', siteType: 'Annex' },
    { name: 'Douglas Street Transitional Campus (FGHS)', address: '', siteType: 'Annex' },
  ];
  const now = new Date().toISOString();
  const locationIds = {};
  let locationsCreated = 0;
  for (const l of LOCATIONS) {
    const existing = db.prepare('SELECT id FROM locations WHERE name = ?').get(l.name);
    if (existing) {
      locationIds[l.name] = existing.id;
      continue;
    }
    const id = uuidv4();
    locationIds[l.name] = id;
    db.prepare(`INSERT INTO locations (id, name, address, siteType, active, createdAt, updatedAt)
      VALUES ($id, $name, $address, $siteType, 1, $createdAt, $updatedAt)`)
      .run({ id, name: l.name, address: l.address, siteType: l.siteType, createdAt: now, updatedAt: now });
    locationsCreated++;
  }
  console.log(`✓ Location (School) file: ${locationsCreated} created, ${LOCATIONS.length - locationsCreated} already on file (${LOCATIONS.length} total)`);

  // Demo persons -- one Student, one Staff, both with a SIS ID (per
  // Josh's confirmation that staff carry SIS IDs too, so this is a
  // single identifier type covering both, not split Student/Employee ID
  // types the way earlier per-module schemas had it). Checked by
  // synergyImportId, a deliberate clean natural key for exactly this
  // purpose.
  function getOrCreatePerson(synergyImportId, fields) {
    const existing = db.prepare('SELECT * FROM persons WHERE synergyImportId = ?').get(synergyImportId);
    if (existing) return { id: existing.id, created: false };
    const id = uuidv4();
    db.prepare(`INSERT INTO persons (id, lastName, firstName, middleName, dob, sex, race,
        height, weight, hairColor, eyeColor, personType, primarySchoolSite, synergyImportId, importedAt, createdAt, updatedAt)
      VALUES ($id, $lastName, $firstName, $middleName, $dob, $sex, $race,
        $height, $weight, $hairColor, $eyeColor, $personType, $primarySchoolSite, $synergyImportId, $now, $now, $now)`)
      .run({ id, synergyImportId, now, ...fields });
    return { id, created: true };
  }

  function getOrCreateIdentifier(personId, identifierType, identifierValue, issuingState) {
    const existing = db.prepare('SELECT id FROM person_identifiers WHERE personId = ? AND identifierType = ? AND identifierValue = ?')
      .get(personId, identifierType, identifierValue);
    if (existing) return;
    db.prepare(`INSERT INTO person_identifiers (id, personId, identifierType, identifierValue, issuingState, verified, verifiedBy, verifiedAt, createdAt)
      VALUES ($id, $personId, $identifierType, $identifierValue, $issuingState, 0, NULL, NULL, $now)`)
      .run({ id: uuidv4(), personId, identifierType, identifierValue, issuingState: issuingState || null, now });
  }

  const student = getOrCreatePerson('SYN-DEMO-001', {
    lastName: 'Demo', firstName: 'Jamie', middleName: '', dob: '2009-04-12', sex: 'F', race: '',
    height: '5-06', weight: '140', hairColor: 'Brown', eyeColor: 'Brown',
    personType: 'Student', primarySchoolSite: locationIds['Forest Grove High School'],
  });
  getOrCreateIdentifier(student.id, 'SIS ID', 'S1234567');
  getOrCreateIdentifier(student.id, 'Driver License', 'DEMO1234D', 'OR');

  const staff = getOrCreatePerson('SYN-DEMO-002', {
    lastName: 'Demo', firstName: 'Alex', middleName: '', dob: '1985-09-01', sex: 'M', race: '',
    height: '5-11', weight: '180', hairColor: 'Black', eyeColor: 'Brown',
    personType: 'Staff', primarySchoolSite: locationIds['District Office'],
  });
  getOrCreateIdentifier(staff.id, 'SIS ID', 'E7654321');

  console.log(`✓ Demo persons: ${[student, staff].filter(p => p.created).length} created, ${[student, staff].filter(p => !p.created).length} already on file (1 Student, 1 Staff -- both clearly labeled Demo, not real district records)`);

  // Demo vehicle with real registration/ownership history -- two
  // registrations (an old plate that was replaced, and the current one)
  // to make the effective-dating close-out behavior visible/testable,
  // not just a single current record that looks the same either way.
  // Checked by VIN, the one genuinely unique natural key a vehicle has.
  const existingVehicle = db.prepare('SELECT id FROM vehicles WHERE vin = ?').get('1FADP3F20EL123456');
  let vehicleId, vehicleCreated;
  if (existingVehicle) {
    vehicleId = existingVehicle.id;
    vehicleCreated = false;
  } else {
    vehicleId = uuidv4();
    vehicleCreated = true;
    db.prepare(`INSERT INTO vehicles (id, vin, make, model, year, color, createdAt, updatedAt)
      VALUES ($id, '1FADP3F20EL123456', 'Ford', 'Focus', '2021', 'Blue', $createdAt, $now)`)
      .run({ id: vehicleId, createdAt: '2024-01-15T00:00:00.000Z', now });
  }

  function getOrCreateRegistration(plate, state, effectiveFrom, effectiveTo, createdAt) {
    const existing = db.prepare('SELECT id FROM vehicle_registrations WHERE vehicleId = ? AND plate = ?').get(vehicleId, plate);
    if (existing) return;
    db.prepare(`INSERT INTO vehicle_registrations (id, vehicleId, plate, state, effectiveFrom, effectiveTo, createdAt)
      VALUES ($id, $vehicleId, $plate, $state, $effectiveFrom, $effectiveTo, $createdAt)`)
      .run({ id: uuidv4(), vehicleId, plate, state, effectiveFrom, effectiveTo: effectiveTo || null, createdAt });
  }
  getOrCreateRegistration('OLDTAG1', 'OR', '2024-01-15', '2025-08-01', '2024-01-15T00:00:00.000Z');
  getOrCreateRegistration('DEMO123', 'OR', '2025-08-02', null, '2025-08-02T00:00:00.000Z');

  const existingOwnership = db.prepare('SELECT id FROM vehicle_ownership WHERE vehicleId = ? AND personId = ?').get(vehicleId, student.id);
  if (!existingOwnership) {
    db.prepare(`INSERT INTO vehicle_ownership (id, vehicleId, personId, relationship, effectiveFrom, effectiveTo, createdAt)
      VALUES ($id, $vehicleId, $personId, 'Parent', '2024-01-15', NULL, $createdAt)`)
      .run({ id: uuidv4(), vehicleId, personId: student.id, createdAt: '2024-01-15T00:00:00.000Z' });
  }
  console.log(`✓ Demo vehicle: ${vehicleCreated ? 'created' : 'already on file'} (real registration history -- old plate OLDTAG1 -> current DEMO123 -- and ownership linked to the demo Student)`);

  console.log('\n✅ Identity service seed data complete -- safe to re-run any time. Run: npm run identity\n');
}

run().catch(e => { console.error(e); process.exit(1); });
