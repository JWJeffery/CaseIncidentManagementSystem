// server/seed.js
const { initDB, db } = require('./db');
const { v4: uuidv4 } = require('uuid');

async function run() {
  await initDB();

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
  { id: uuidv4(), personType: 'visitor', firstName: 'Robert', middleName: 'James', lastName: 'Simmons',
    aliases: 'Bobby Simmons', phone: '503-555-0142', address: '411 Oak Street', city: 'Forest Grove',
    state: 'OR', zip: '97116', dob: '1982-04-15', idType: 'Oregon DL', idNumber: 'OR1234567',
    sex: 'Male', race: 'White', height: "5'11\"", weight: '185', hair: 'Brown', eyes: 'Blue',
    notes: 'Known to district. Prior incident at FGHS 2023.', createdAt: now, updatedAt: now },
  { id: uuidv4(), personType: 'parent_guardian', firstName: 'Maria', middleName: '', lastName: 'Castillo',
    aliases: '', phone: '503-555-0287', address: '2204 Cedar Lane', city: 'Cornelius', state: 'OR',
    zip: '97113', dob: '1975-11-02', idType: 'Oregon DL', idNumber: 'OR7654321', sex: 'Female',
    race: 'Hispanic', height: "5'4\"", weight: '140', hair: 'Black', eyes: 'Brown',
    notes: '', createdAt: now, updatedAt: now },
  { id: uuidv4(), personType: 'staff', firstName: 'Derek', middleName: '', lastName: 'Nguyen',
    aliases: '', phone: '503-555-0399', address: '810 Maple Ave', city: 'Forest Grove', state: 'OR',
    zip: '97116', dob: '1988-06-20', idType: 'Employee ID', idNumber: 'FGSD-4412', sex: 'Male',
    race: 'Asian', height: "5'9\"", weight: '170', hair: 'Black', eyes: 'Brown',
    notes: 'Security coordinator, Neil Armstrong MS.', createdAt: now, updatedAt: now }
];

const personFields = ['id','personType','firstName','middleName','lastName','aliases','phone',
  'address','city','state','zip','dob','idType','idNumber','sex','race',
  'height','weight','hair','eyes','notes','createdAt','updatedAt'];

for (const p of persons) {
  try {
    db.prepare(`INSERT OR IGNORE INTO persons (${personFields.join(',')})
      VALUES (${personFields.map(f => '$'+f).join(',')})`)
      .run(p);
  } catch(e) { /* skip */ }
}
console.log('✓ Demo persons seeded');

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
    safetyRiskLevel: 'medium', createdAt: '2024-10-10T13:00:00Z', updatedAt: '2024-10-10T15:30:00Z' }
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
const allPersons = db.prepare('SELECT id FROM persons ORDER BY lastName').all();

if (allCases[0] && allPersons[0]) {
  try { db.prepare('INSERT OR IGNORE INTO case_persons (id,caseId,personId,role) VALUES ($id,$caseId,$personId,$role)')
    .run({ id: uuidv4(), caseId: allCases[0].id, personId: allPersons[0].id, role: 'subject' }); } catch(e){}
}
if (allCases[1] && allPersons[2]) {
  try { db.prepare('INSERT OR IGNORE INTO case_persons (id,caseId,personId,role) VALUES ($id,$caseId,$personId,$role)')
    .run({ id: uuidv4(), caseId: allCases[1].id, personId: allPersons[2].id, role: 'reporting_party' }); } catch(e){}
}
if (allCases[2] && allPersons[1]) {
  try { db.prepare('INSERT OR IGNORE INTO case_persons (id,caseId,personId,role) VALUES ($id,$caseId,$personId,$role)')
    .run({ id: uuidv4(), caseId: allCases[2].id, personId: allPersons[1].id, role: 'subject' }); } catch(e){}
}
console.log('✓ Case-person links seeded');

if (allCases[0]) {
  try { db.prepare('INSERT OR IGNORE INTO notes (id,caseId,author,noteType,body,createdAt) VALUES ($id,$caseId,$author,$noteType,$body,$createdAt)')
    .run({ id: uuidv4(), caseId: allCases[0].id, author: 'T. Hoffman', noteType: 'investigation',
      body: 'Reviewed security camera footage from 2:40–2:50 PM. Subject clearly visible near student. Footage saved to district server.',
      createdAt: '2024-09-15T11:00:00Z' }); } catch(e){}
  try { db.prepare('INSERT OR IGNORE INTO notes (id,caseId,author,noteType,body,createdAt) VALUES ($id,$caseId,$author,$noteType,$body,$createdAt)')
    .run({ id: uuidv4(), caseId: allCases[0].id, author: 'T. Hoffman', noteType: 'admin',
      body: 'Exclusion notice generated and served to subject at district office. Copy provided to FGHS principal.',
      createdAt: '2024-09-16T09:00:00Z' }); } catch(e){}
}
if (allCases[2]) {
  try { db.prepare('INSERT OR IGNORE INTO notes (id,caseId,author,noteType,body,createdAt) VALUES ($id,$caseId,$author,$noteType,$body,$createdAt)')
    .run({ id: uuidv4(), caseId: allCases[2].id, author: 'P. Okafor', noteType: 'witness',
      body: 'PE teacher Ms. Reyes witnessed entire incident. Statement collected and on file.',
      createdAt: '2024-10-10T14:00:00Z' }); } catch(e){}
}
console.log('✓ Demo notes seeded');

if (allCases[0]) {
  try { db.prepare('INSERT OR IGNORE INTO violations (id,caseId,basisType,citation,shortLabel,description,recommendedAction,exclusionLength,createdAt,updatedAt) VALUES ($id,$caseId,$basisType,$citation,$shortLabel,$description,$recommendedAction,$exclusionLength,$createdAt,$updatedAt)')
    .run({ id: uuidv4(), caseId: allCases[0].id, basisType: 'KGB', citation: 'KGB-1',
      shortLabel: 'Injury / Threat of Injury',
      description: 'Subject made verbal threats toward a student in the parking lot.',
      recommendedAction: 'Exclusion from all district property', exclusionLength: '1 year',
      createdAt: now, updatedAt: now }); } catch(e){}
  try { db.prepare('INSERT OR IGNORE INTO violations (id,caseId,basisType,citation,shortLabel,description,recommendedAction,exclusionLength,createdAt,updatedAt) VALUES ($id,$caseId,$basisType,$citation,$shortLabel,$description,$recommendedAction,$exclusionLength,$createdAt,$updatedAt)')
    .run({ id: uuidv4(), caseId: allCases[0].id, basisType: 'KGB', citation: 'KGB-18',
      shortLabel: 'Camping / Loitering / Unauthorized Presence',
      description: 'Subject had no legitimate purpose on campus and was not authorized to be present.',
      recommendedAction: 'Exclusion from all district property', exclusionLength: '1 year',
      createdAt: now, updatedAt: now }); } catch(e){}
}
if (allCases[2]) {
  try { db.prepare('INSERT OR IGNORE INTO violations (id,caseId,basisType,citation,shortLabel,description,recommendedAction,exclusionLength,createdAt,updatedAt) VALUES ($id,$caseId,$basisType,$citation,$shortLabel,$description,$recommendedAction,$exclusionLength,$createdAt,$updatedAt)')
    .run({ id: uuidv4(), caseId: allCases[2].id, basisType: 'KGB', citation: 'KGB-3',
      shortLabel: 'Abusive Conduct Interfering with Activities',
      description: 'Parent used abusive verbal conduct toward staff during a school-sanctioned event.',
      recommendedAction: 'Warning / Cease and Desist', exclusionLength: 'N/A',
      createdAt: now, updatedAt: now }); } catch(e){}
}
console.log('✓ Demo violations seeded');
console.log('\n✅ All seed data complete. Run: npm start');
}

run().catch(e => { console.error(e); process.exit(1); });
