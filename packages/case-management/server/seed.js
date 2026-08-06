// server/seed.js
const { initDB, db } = require('./db');
const { v4: uuidv4 } = require('uuid');
const { identityFetch, IDENTITY_BASE_URL } = require('@fgsd/shared');

async function run() {
  await initDB();

  // Person biographic data now lives in the Identity Service -- seeding
  // a demo person means creating it there via HTTP, which means Identity
  // must actually be running (and already seeded) first. Same real
  // operational requirement already introduced for parking's vehicle
  // seeding; checked up front with a clear error rather than a confusing
  // downstream failure.
  try {
    await identityFetch('/api/locations');
  } catch (err) {
    console.error(`\n❌ Cannot reach the Identity Service at ${IDENTITY_BASE_URL}.`);
    console.error(`   Person seeding requires it to be running. In a separate terminal:`);
    console.error(`   npm run identity:seed && npm run identity\n`);
    throw err;
  }

const KGB_POLICIES = [
  { citation: 'KGB-1',  shortLabel: 'Injury / Threat of Injury', policyText: 'Injure or threaten to injure another.' },
  { citation: 'KGB-2',  shortLabel: 'Hazing / Harassment / Bullying', policyText: 'Haze, harass, intimidate, bully or menace another, or engage in behavior deemed by the district to endanger the safety of students, employees, self or others.' },
  { citation: 'KGB-3',  shortLabel: 'Abusive Conduct Interfering with Activities', policyText: 'Use or engage in abusive verbal or physical conduct that interferes with the performance of students, event officials or sponsors of approved activities.' },
  { citation: 'KGB-4',  shortLabel: 'Property Damage', policyText: 'Damage the property of another or of the district.' },
  { citation: 'KGB-5',  shortLabel: 'False Report of Emergency', policyText: 'Initiate or circulate a report, one knows to be false, concerning an alleged hazardous substance, impending fire, explosion, catastrophe or other emergency.' },
  { citation: 'KGB-6',  shortLabel: 'Unauthorized Structure', policyText: 'Construct or transport to district property any structure not approved for construction on, or transportation to district property.' },
  { citation: 'KGB-7',  shortLabel: 'Damage to Plant Life / Natural Resources', policyText: 'Uproot, pick, cut, mutilate or remove plant life or other natural resources of any kind.' },
  { citation: 'KGB-8',  shortLabel: 'Sewage / Fluid Dumping', policyText: 'Dump or spill any sewage, waste water or other fluids from any vehicle.' },
  { citation: 'KGB-9',  shortLabel: 'Improper Waste Disposal', policyText: 'Use district waste containers for deposit of waste generated from household, commercial, industrial, or construction uses not related to approved use on district property.' },
  { citation: 'KGB-10', shortLabel: 'Blocking / Obstructing Traffic or Access', policyText: 'Block, obstruct or interfere with vehicular or pedestrian traffic on any district road, parking area, walkway, pathway or common area.' },
  { citation: 'KGB-11', shortLabel: 'Unauthorized Model Aircraft / Rockets', policyText: 'Fly, launch or otherwise operate motorized model airplanes/helicopters/rockets or other similar propulsion devices unless approved in advance by the district.' },
  { citation: 'KGB-12', shortLabel: 'Unauthorized Drone Operation', policyText: 'Operate a drone (unmanned aircraft system) unless granted permission by the Superintendent or designee.' },
  { citation: 'KGB-13', shortLabel: 'Unauthorized Distribution of Materials', policyText: 'Distribute or post circulars, notices, leaflets, pamphlets or other written or printed material in violation of Board policy KJA.' },
  { citation: 'KGB-14', shortLabel: 'Unauthorized Sales / Solicitation', policyText: 'Operate a concession, solicit, sell or offer for sale any goods, wares, merchandise, food, beverages or services without prior district approval.' },
  { citation: 'KGB-15', shortLabel: 'Unauthorized / Unsafe Motor Vehicle Operation', policyText: 'Operate a motor vehicle in an area other than roads and parking areas designated for motor vehicle use. Minibikes, scooters, go-carts, ATVs, snowmobiles and similar devices are prohibited.' },
  { citation: 'KGB-16', shortLabel: 'Unauthorized Roller Devices / Activities', policyText: 'Use any roller device (roller shoes, skateboard, scooter, etc), ride a horse, or practice golf or archery without permission of an administrator.' },
  { citation: 'KGB-17', shortLabel: 'Unauthorized Animals', policyText: 'Bring an animal into a district building without prior administrator approval. Dogs permitted on grounds only when on leash and under physical control at all times.' },
  { citation: 'KGB-18', shortLabel: 'Camping / Loitering / Unauthorized Presence', policyText: 'Camp overnight, loiter or otherwise be present on district property after the conclusion of approved activities or as otherwise posted or authorized by the district.' },
  { citation: 'KGB-19', shortLabel: 'Noise Disturbance', policyText: 'Use or operate any noise-producing machine, vehicle, device or instrument in a manner that is disturbing to or interferes with the orderly conduct of district programs or approved activities.' },
  { citation: 'KGB-20', shortLabel: 'Interference with Educational Program', policyText: 'Impede, delay or otherwise interfere with the orderly conduct of the district\'s educational program or any other authorized activity on district property.' },
  { citation: 'KGB-21', shortLabel: 'Weapons', policyText: 'Bring, possess or use a weapon as prohibited by Board policies JFCJ - Weapons in the Schools, KGBB – Firearms Prohibited, and state and federal law.' },
  { citation: 'KGB-22', shortLabel: 'Drugs / Alcohol / Drug Paraphernalia', policyText: 'Possess, consume, sell, give or deliver unlawful drugs and/or alcoholic beverages. Possess, sell, give or deliver drug paraphernalia.' },
  { citation: 'KGB-23', shortLabel: 'Tobacco / Inhalant Delivery Systems', policyText: 'Use, distribute or sell tobacco products or inhalant delivery systems, in any form, in buildings, vehicles, and any outdoor area. (Pro-Children Act of 1994; ORS 433.835)' },
  { citation: 'KGB-24', shortLabel: 'Gang Activity / Affiliation', policyText: 'Wear, possess, use, distribute, display or sell any clothing, jewelry, emblem, badge, symbol, sign or other items which are evidence of membership or affiliation in any gang.' },
  { citation: 'KGB-25', shortLabel: 'Violation of Posted Regulatory Signs', policyText: 'Violate posted regulatory signs.' },
  { citation: 'KGB-26', shortLabel: 'Violation of Other District Policies / Rules', policyText: 'Willfully violate other district policies, administrative regulations or school rules designed to maintain public order on district property.' }
];

for (const p of KGB_POLICIES) {
  try {
    db.prepare(`INSERT OR IGNORE INTO policy_library (id, basisType, citation, shortLabel, policyText)
      VALUES ($id, 'KGB', $citation, $shortLabel, $policyText)`)
      .run({ id: uuidv4(), citation: p.citation, shortLabel: p.shortLabel, policyText: p.policyText });
  } catch(e) { /* skip dupes */ }
}
console.log('✓ KGB policy library seeded (26 entries)');

const now = new Date().toISOString();

const persons = [
  { firstName: 'Robert', middleName: 'James', lastName: 'Simmons',
    aliases: 'Bobby Simmons', phone: '503-555-0142', address: '411 Oak Street', city: 'Forest Grove',
    state: 'OR', zip: '97116', dob: '1982-04-15', idType: 'Oregon DL', idNumber: 'OR1234567',
    sex: 'Male', race: 'White', height: "5'11\"", weight: '185', hair: 'Brown', eyes: 'Blue',
    personType: 'visitor', notes: 'Known to district. Prior incident at FGHS 2023.' },
  { firstName: 'Maria', middleName: '', lastName: 'Castillo',
    aliases: '', phone: '503-555-0287', address: '2204 Cedar Lane', city: 'Cornelius', state: 'OR',
    zip: '97113', dob: '1975-11-02', idType: 'Oregon DL', idNumber: 'OR7654321', sex: 'Female',
    race: 'Hispanic', height: "5'4\"", weight: '140', hair: 'Black', eyes: 'Brown',
    personType: 'parent_guardian', notes: '' },
  { firstName: 'Derek', middleName: '', lastName: 'Nguyen',
    aliases: '', phone: '503-555-0399', address: '810 Maple Ave', city: 'Forest Grove', state: 'OR',
    zip: '97116', dob: '1988-06-20', idType: 'Employee ID', idNumber: 'FGSD-4412', sex: 'Male',
    race: 'Asian', height: "5'9\"", weight: '170', hair: 'Black', eyes: 'Brown',
    personType: 'staff', notes: 'Security coordinator, Neil Armstrong MS.' },
];

// Checked by lastName+firstName+dob before creating -- Identity has no
// single clean natural key for these (unlike its own seed.js, which had
// a deliberate synergyImportId for exactly this purpose), so this is the
// best available check-first key for demo data. Same idempotency lesson
// already learned and fixed in identity/server/seed.js: INSERT OR IGNORE
// on a table keyed by a fresh UUID does nothing, and this file now
// creates people via HTTP where that lesson applies just as much.
const personIds = [];
for (const p of persons) {
  const searchResults = await identityFetch(`/api/persons?search=${encodeURIComponent(p.lastName)}`);
  const existing = searchResults.find(r => r.firstName === p.firstName && r.dob === p.dob);
  let id;
  if (existing) {
    id = existing.id;
  } else {
    const created = await identityFetch('/api/persons', {
      method: 'POST',
      body: JSON.stringify({
        lastName: p.lastName, firstName: p.firstName, middleName: p.middleName, dob: p.dob,
        sex: p.sex, race: p.race, height: p.height, weight: p.weight, hairColor: p.hair, eyeColor: p.eyes,
      }),
    });
    id = created.id;
    if (p.idType && p.idNumber) {
      await identityFetch(`/api/persons/${id}/identifiers`, {
        method: 'POST',
        body: JSON.stringify({ identifierType: p.idType, identifierValue: p.idNumber }),
      });
    }
    if (p.aliases) {
      for (const aliasName of p.aliases.split(',').map(s => s.trim()).filter(Boolean)) {
        await identityFetch(`/api/persons/${id}/aliases`, { method: 'POST', body: JSON.stringify({ aliasName, aliasType: 'Other' }) });
      }
    }
  }
  personIds.push(id);

  const localExisting = db.prepare('SELECT identityPersonId FROM person_local_info WHERE identityPersonId = ?').get(id);
  if (!localExisting) {
    db.prepare(`INSERT INTO person_local_info (identityPersonId, personType, phone, address, city, state, zip, notes, createdAt, updatedAt)
      VALUES ($id, $personType, $phone, $address, $city, $state, $zip, $notes, $now, $now)`)
      .run({ id, personType: p.personType, phone: p.phone, address: p.address, city: p.city, state: p.state, zip: p.zip, notes: p.notes, now });
  }
}
console.log(`✓ Demo persons: ${personIds.length} on file (created in the Identity Service, safe to re-run)`);

const cases = [
  { id: uuidv4(), caseNumber: 'FGSD-2024-0001', openedAt: '2024-09-15T10:30:00Z',
    incidentAt: '2024-09-14T14:45:00Z', schoolSite: 'Forest Grove High School',
    location: 'Main Parking Lot', incidentType: 'Threatening Behavior',
    createdBy: 'J. Martinez', assignedTo: 'T. Hoffman',
    initialNarrative: 'Subject approached a student near the parking lot and made verbal threats. Student reported to office immediately. Subject was not enrolled and had no business on campus.',
    immediateActions: 'Subject verbally warned and asked to leave. Student provided statement. Parent notified.',
    status: 'Action Issued', disposition: 'Exclusion', lawEnforcementInvolved: 0,
    safetyRiskLevel: 'high', createdAt: '2024-09-15T10:30:00Z', updatedAt: '2024-09-16T09:00:00Z' },
  { id: uuidv4(), caseNumber: 'FGSD-2024-0002', openedAt: '2024-10-03T08:15:00Z',
    incidentAt: '2024-10-03T07:55:00Z', schoolSite: 'Neil Armstrong Middle School',
    location: 'Front Entrance', incidentType: 'Trespassing / Loitering',
    createdBy: 'S. Kim', assignedTo: 'S. Kim',
    initialNarrative: 'Unknown individual observed loitering near front entrance before school hours. Did not respond to staff requests to identify purpose.',
    immediateActions: 'Individual escorted off property. Description logged.',
    status: 'Open', disposition: null, lawEnforcementInvolved: 0,
    safetyRiskLevel: 'medium', createdAt: '2024-10-03T08:15:00Z', updatedAt: '2024-10-03T08:15:00Z' },
  { id: uuidv4(), caseNumber: 'FGSD-2024-0003', openedAt: '2024-10-10T13:00:00Z',
    incidentAt: '2024-10-10T12:30:00Z', schoolSite: 'Cornelius Elementary School',
    location: 'Gymnasium', incidentType: 'Disruptive Behavior',
    createdBy: 'P. Okafor', assignedTo: 'P. Okafor',
    initialNarrative: 'Parent became verbally abusive toward staff during a school event. Raised voice, used profanity, and refused to leave when asked by the principal.',
    immediateActions: 'Police non-emergency line consulted. Parent eventually left voluntarily.',
    status: 'Under Review', disposition: null, lawEnforcementInvolved: 0,
    safetyRiskLevel: 'medium', createdAt: '2024-10-10T13:00:00Z', updatedAt: '2024-10-10T15:30:00Z' },
  // A RECENT exclusion (2026) with a served notice -- so the cross-module
  // exclusion check has a genuinely ACTIVE example to surface, alongside
  // Castillo's now-EXPIRED 2024 exclusion (below) and Nguyen's
  // cease-and-desist (not an exclusion at all). Three distinct states,
  // which is exactly what makes the feature verifiable end to end.
  { id: uuidv4(), caseNumber: 'FGSD-2026-0004', openedAt: '2026-05-20T09:00:00Z',
    incidentAt: '2026-05-19T15:10:00Z', schoolSite: 'Forest Grove High School',
    location: 'Student Parking Lot', incidentType: 'Threatening Behavior',
    createdBy: 'T. Hoffman', assignedTo: 'T. Hoffman',
    initialNarrative: 'Non-student entered the student lot during dismissal and threatened a staff member who asked him to leave. Recognized from a prior campus contact.',
    immediateActions: 'Subject escorted off property. Notice of Exclusion prepared and served the same week.',
    status: 'Action Issued', disposition: 'Exclusion', lawEnforcementInvolved: 0,
    safetyRiskLevel: 'high', createdAt: '2026-05-20T09:00:00Z', updatedAt: '2026-05-22T16:00:00Z' }
];

const caseFields = ['id','caseNumber','openedAt','incidentAt','schoolSite','location','incidentType',
  'createdBy','assignedTo','initialNarrative','immediateActions','status','disposition',
  'lawEnforcementInvolved','safetyRiskLevel','createdAt','updatedAt'];

for (const c of cases) {
  try {
    db.prepare(`INSERT OR IGNORE INTO cases (${caseFields.join(',')})
      VALUES (${caseFields.map(f => '$'+f).join(',')})`)
      .run(c);
  } catch(e) { /* skip */ }
}
console.log('✓ Demo cases seeded');

const allCases   = db.prepare('SELECT id FROM cases ORDER BY caseNumber').all();
// personIds is in the same order as the `persons` array above:
// [0]=Simmons, [1]=Castillo, [2]=Nguyen. Named here instead of reused as
// magic indices below, since the old code's allPersons[N] indices relied
// on SQL's alphabetical-by-lastName ordering (Castillo, Nguyen, Simmons)
// which no longer applies now that persons come from an array, not a
// query.
const [simmonsId, castilloId, nguyenId] = personIds;

// Checked by (caseId, personId, role) before inserting -- same
// idempotency fix as everywhere else touched during Person wiring
// (INSERT OR IGNORE on a table keyed by a fresh UUID id does nothing to
// prevent duplicates; this table had the same latent bug, just not yet
// caught because nothing had re-run this section of seed.js enough
// times to notice).
function linkPersonToCase(caseId, personId, role) {
  const existing = db.prepare('SELECT id FROM case_persons WHERE caseId = ? AND personId = ? AND role = ?').get(caseId, personId, role);
  if (existing) return;
  db.prepare('INSERT INTO case_persons (id, caseId, personId, role) VALUES (?, ?, ?, ?)').run(uuidv4(), caseId, personId, role);
}

// Check-first inserts for notes / violations / documents. These replaced
// the earlier `INSERT OR IGNORE ... VALUES ($id=uuidv4() ...)` pattern,
// which is the SAME latent idempotency bug documented in
// RESUME_PROJECT_NOTE.md: IGNORE only suppresses a PRIMARY KEY collision,
// and a fresh UUID never collides, so every re-run silently duplicated
// every note and violation. Only case_persons had been fixed during
// Person wiring; notes/violations still had it until the exclusion-check
// work touched this section. Natural keys used: (caseId, body) for notes,
// (caseId, citation) for violations, (caseId, subjectPersonId) for a
// served exclusion notice.
function addNoteOnce(caseId, author, noteType, body, createdAt) {
  const existing = db.prepare('SELECT id FROM notes WHERE caseId = ? AND body = ?').get(caseId, body);
  if (existing) return;
  db.prepare('INSERT INTO notes (id,caseId,author,noteType,body,createdAt) VALUES ($id,$caseId,$author,$noteType,$body,$createdAt)')
    .run({ id: uuidv4(), caseId, author, noteType, body, createdAt });
}
function addViolationOnce(caseId, v) {
  const existing = db.prepare('SELECT id FROM violations WHERE caseId = ? AND citation = ?').get(caseId, v.citation);
  if (existing) return;
  db.prepare(`INSERT INTO violations (id,caseId,basisType,citation,shortLabel,description,recommendedAction,exclusionLength,createdAt,updatedAt)
    VALUES ($id,$caseId,$basisType,$citation,$shortLabel,$description,$recommendedAction,$exclusionLength,$createdAt,$updatedAt)`)
    .run({ id: uuidv4(), caseId, basisType: 'KGB', citation: v.citation, shortLabel: v.shortLabel,
      description: v.description, recommendedAction: v.recommendedAction, exclusionLength: v.exclusionLength,
      createdAt: now, updatedAt: now });
}
function addExclusionNoticeOnce(caseId, subjectPersonId, issuedDate, generatedAt, generatedBy) {
  const existing = db.prepare("SELECT id FROM documents WHERE caseId = ? AND documentType = 'exclusion_notice' AND subjectPersonId = ?").get(caseId, subjectPersonId);
  if (existing) return;
  db.prepare(`INSERT INTO documents (id, caseId, documentType, generatedAt, generatedBy, storedContent, subjectPersonId, issuedDate)
    VALUES (?, ?, 'exclusion_notice', ?, ?, ?, ?, ?)`)
    .run(uuidv4(), caseId, generatedAt, generatedBy,
      '<!DOCTYPE html><html><body><!-- Seeded served Notice of Exclusion (demo). The real generator lives in routes/documents.js. --></body></html>',
      subjectPersonId, issuedDate);
}

const case4 = db.prepare("SELECT id FROM cases WHERE caseNumber = 'FGSD-2026-0004'").get();

if (allCases[0] && castilloId) linkPersonToCase(allCases[0].id, castilloId, 'subject');
if (allCases[1] && simmonsId) linkPersonToCase(allCases[1].id, simmonsId, 'reporting_party');
if (allCases[2] && nguyenId) linkPersonToCase(allCases[2].id, nguyenId, 'subject');
if (case4 && simmonsId) linkPersonToCase(case4.id, simmonsId, 'subject');
console.log('✓ Case-person links seeded');

if (allCases[0]) {
  addNoteOnce(allCases[0].id, 'T. Hoffman', 'investigation',
    'Reviewed security camera footage from 2:40–2:50 PM. Subject clearly visible near student. Footage saved to district server.',
    '2024-09-15T11:00:00Z');
  addNoteOnce(allCases[0].id, 'T. Hoffman', 'admin',
    'Exclusion notice generated and served to subject at district office. Copy provided to FGHS principal.',
    '2024-09-16T09:00:00Z');
}
if (allCases[2]) {
  addNoteOnce(allCases[2].id, 'P. Okafor', 'witness',
    'PE teacher Ms. Reyes witnessed entire incident. Statement collected and on file.',
    '2024-10-10T14:00:00Z');
}
if (case4) {
  addNoteOnce(case4.id, 'T. Hoffman', 'admin',
    'Notice of Exclusion served to subject in person on 2026-05-22. One-year exclusion from all district property. Copy provided to FGHS principal and District Public Safety.',
    '2026-05-22T16:00:00Z');
}
console.log('✓ Demo notes seeded');

if (allCases[0]) {
  addViolationOnce(allCases[0].id, { citation: 'KGB-1', shortLabel: 'Injury / Threat of Injury',
    description: 'Subject made verbal threats toward a student in the parking lot.',
    recommendedAction: 'Exclusion from all district property', exclusionLength: '1 year' });
  addViolationOnce(allCases[0].id, { citation: 'KGB-18', shortLabel: 'Camping / Loitering / Unauthorized Presence',
    description: 'Subject had no legitimate purpose on campus and was not authorized to be present.',
    recommendedAction: 'Exclusion from all district property', exclusionLength: '1 year' });
}
if (allCases[2]) {
  addViolationOnce(allCases[2].id, { citation: 'KGB-3', shortLabel: 'Abusive Conduct Interfering with Activities',
    description: 'Parent used abusive verbal conduct toward staff during a school-sanctioned event.',
    recommendedAction: 'Warning / Cease and Desist', exclusionLength: 'N/A' });
}
if (case4) {
  addViolationOnce(case4.id, { citation: 'KGB-1', shortLabel: 'Injury / Threat of Injury',
    description: 'Subject threatened a staff member in the student parking lot during dismissal.',
    recommendedAction: 'Exclusion from all district property', exclusionLength: '1 year' });
  // The served Notice of Exclusion -- issued 2026-05-22, so with a
  // one-year length this exclusion is currently ACTIVE (expires
  // 2027-05-22). subjectPersonId ties it to Simmons; issuedDate is the
  // effective date the exclusion check computes the window from.
  if (simmonsId) addExclusionNoticeOnce(case4.id, simmonsId, '2026-05-22', '2026-05-22T15:30:00Z', 'T. Hoffman');
}
console.log('✓ Demo violations seeded');

// Owner-excluded demo vehicle -- created in the Identity Service (the
// vehicle master file) and owned by Simmons, who is now actively excluded
// (case FGSD-2026-0004 above). This makes the cross-module check
// demonstrable end to end FROM PARKING: looking plate EXCL123 up in the
// Field Lookup returns the vehicle AND a red "registered owner is excluded
// from district property" alert, because parking asks case-management
// about the resolved owner. Seeded here rather than in identity's own seed
// because that seed runs before these Person records exist, and this is
// the only seed that knows simmonsId. Idempotent: skipped if the plate is
// already on file.
const EXCLUDED_OWNER_PLATE = 'EXCL123';
if (simmonsId) {
  const existing = await identityFetch(`/api/vehicles?search=${EXCLUDED_OWNER_PLATE}`);
  const already = existing.find(v => v.currentPlate === EXCLUDED_OWNER_PLATE);
  if (!already) {
    await identityFetch('/api/vehicles', {
      method: 'POST',
      body: JSON.stringify({ plate: EXCLUDED_OWNER_PLATE, state: 'OR', make: 'Chevrolet',
        model: 'Silverado', year: '2016', color: 'Black',
        ownerPersonId: simmonsId, ownerRelationship: 'Self' }),
    });
    console.log(`✓ Demo owner-excluded vehicle created in Identity (plate ${EXCLUDED_OWNER_PLATE}, owned by the excluded subject)`);
  } else {
    console.log(`✓ Demo owner-excluded vehicle already on file (plate ${EXCLUDED_OWNER_PLATE})`);
  }
}

console.log('\n✅ All seed data complete. Run: npm start');
}

run().catch(e => { console.error(e); process.exit(1); });
