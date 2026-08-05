// server/seed.js
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
  for (const l of LOCATIONS) {
    const id = uuidv4();
    locationIds[l.name] = id;
    try {
      db.prepare(`INSERT OR IGNORE INTO locations (id, name, address, siteType, active, createdAt, updatedAt)
        VALUES ($id, $name, $address, $siteType, 1, $createdAt, $updatedAt)`)
        .run({ id, name: l.name, address: l.address, siteType: l.siteType, createdAt: now, updatedAt: now });
    } catch (e) { /* already seeded */ }
  }
  console.log(`✓ Location (School) file seeded (${LOCATIONS.length} sites)`);

  // Demo persons -- one Student, one Staff, both with a SIS ID (per
  // Josh's confirmation that staff carry SIS IDs too, so this is a
  // single identifier type covering both, not split Student/Employee ID
  // types the way earlier per-module schemas had it).
  const studentId = uuidv4();
  db.prepare(`INSERT OR IGNORE INTO persons (id, lastName, firstName, middleName, dob, sex, race,
      height, weight, hairColor, eyeColor, personType, primarySchoolSite, synergyImportId, importedAt, createdAt, updatedAt)
    VALUES ($id, 'Demo', 'Jamie', '', '2009-04-12', 'F', '',
      '5-06', '140', 'Brown', 'Brown', 'Student', $schoolSite, 'SYN-DEMO-001', $now, $now, $now)`)
    .run({ id: studentId, schoolSite: locationIds['Forest Grove High School'], now });
  db.prepare(`INSERT OR IGNORE INTO person_identifiers (id, personId, identifierType, identifierValue, issuingState, verified, verifiedBy, verifiedAt, createdAt)
    VALUES ($id, $personId, 'SIS ID', 'S1234567', NULL, 0, NULL, NULL, $now)`)
    .run({ id: uuidv4(), personId: studentId, now });
  db.prepare(`INSERT OR IGNORE INTO person_identifiers (id, personId, identifierType, identifierValue, issuingState, verified, verifiedBy, verifiedAt, createdAt)
    VALUES ($id, $personId, 'Driver License', 'DEMO1234D', 'OR', 0, NULL, NULL, $now)`)
    .run({ id: uuidv4(), personId: studentId, now });

  const staffId = uuidv4();
  db.prepare(`INSERT OR IGNORE INTO persons (id, lastName, firstName, middleName, dob, sex, race,
      height, weight, hairColor, eyeColor, personType, primarySchoolSite, synergyImportId, importedAt, createdAt, updatedAt)
    VALUES ($id, 'Demo', 'Alex', '', '1985-09-01', 'M', '',
      '5-11', '180', 'Black', 'Brown', 'Staff', $schoolSite, 'SYN-DEMO-002', $now, $now, $now)`)
    .run({ id: staffId, schoolSite: locationIds['District Office'], now });
  db.prepare(`INSERT OR IGNORE INTO person_identifiers (id, personId, identifierType, identifierValue, issuingState, verified, verifiedBy, verifiedAt, createdAt)
    VALUES ($id, $personId, 'SIS ID', 'E7654321', NULL, 0, NULL, NULL, $now)`)
    .run({ id: uuidv4(), personId: staffId, now });
  console.log('✓ Demo persons seeded (1 Student, 1 Staff -- both clearly labeled Demo, not real district records)');

  // Demo vehicle with real registration/ownership history -- two
  // registrations (an old plate that was replaced, and the current one)
  // to make the effective-dating close-out behavior visible/testable,
  // not just a single current record that looks the same either way.
  const vehicleId = uuidv4();
  db.prepare(`INSERT OR IGNORE INTO vehicles (id, vin, make, model, year, color, createdAt, updatedAt)
    VALUES ($id, '1FADP3F20EL123456', 'Ford', 'Focus', '2021', 'Blue', $createdAt, $now)`)
    .run({ id: vehicleId, createdAt: '2024-01-15T00:00:00.000Z', now });
  db.prepare(`INSERT OR IGNORE INTO vehicle_registrations (id, vehicleId, plate, state, effectiveFrom, effectiveTo, createdAt)
    VALUES ($id, $vehicleId, 'OLDTAG1', 'OR', '2024-01-15', '2025-08-01', $createdAt)`)
    .run({ id: uuidv4(), vehicleId, createdAt: '2024-01-15T00:00:00.000Z' });
  db.prepare(`INSERT OR IGNORE INTO vehicle_registrations (id, vehicleId, plate, state, effectiveFrom, effectiveTo, createdAt)
    VALUES ($id, $vehicleId, 'DEMO123', 'OR', '2025-08-02', NULL, $createdAt)`)
    .run({ id: uuidv4(), vehicleId, createdAt: '2025-08-02T00:00:00.000Z' });
  db.prepare(`INSERT OR IGNORE INTO vehicle_ownership (id, vehicleId, personId, relationship, effectiveFrom, effectiveTo, createdAt)
    VALUES ($id, $vehicleId, $personId, 'Parent', '2024-01-15', NULL, $createdAt)`)
    .run({ id: uuidv4(), vehicleId, personId: studentId, createdAt: '2024-01-15T00:00:00.000Z' });
  console.log('✓ Demo vehicle seeded with real registration history (old plate OLDTAG1 -> current DEMO123) and ownership linked to the demo Student');

  console.log('\n✅ Identity service seed data complete. Run: npm run identity\n');
}

run().catch(e => { console.error(e); process.exit(1); });
