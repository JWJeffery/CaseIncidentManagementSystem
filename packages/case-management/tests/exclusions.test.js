// tests/exclusions.test.js
//
// Pure unit tests for the exclusion computation logic. No DB, no server
// -- the whole point of keeping server/exclusions.js DB-free is that the
// fiddly date/duration math can be tested deterministically against a
// fixed "now".
const assert = require('assert');
const {
  isSubjectRole,
  isExclusionAction,
  parseExclusionLength,
  addDuration,
  computeStatus,
  buildPersonExclusions,
  emptyPersonExclusion,
} = require('../server/exclusions');

const NOW = '2026-08-06T00:00:00.000Z';

function run() {
  // ---- isSubjectRole -------------------------------------------------
  assert.strictEqual(isSubjectRole('subject'), true);
  assert.strictEqual(isSubjectRole('Subject'), true);
  assert.strictEqual(isSubjectRole('respondent'), true);
  assert.strictEqual(isSubjectRole('reporting_party'), false, 'a reporting party is not excluded');
  assert.strictEqual(isSubjectRole('witness'), false);
  assert.strictEqual(isSubjectRole(''), false);
  assert.strictEqual(isSubjectRole(null), false);

  // ---- isExclusionAction ---------------------------------------------
  assert.strictEqual(isExclusionAction('Exclusion from all district property'), true);
  assert.strictEqual(isExclusionAction('EXCLUDED'), true);
  assert.strictEqual(isExclusionAction('Warning / Cease and Desist'), false, 'cease-and-desist is not an exclusion');
  assert.strictEqual(isExclusionAction('N/A'), false);
  assert.strictEqual(isExclusionAction(''), false);

  // ---- parseExclusionLength ------------------------------------------
  assert.strictEqual(parseExclusionLength('').kind, 'none');
  assert.strictEqual(parseExclusionLength('N/A').kind, 'none');
  assert.strictEqual(parseExclusionLength('none').kind, 'none');
  assert.strictEqual(parseExclusionLength('permanent').kind, 'indefinite');
  assert.strictEqual(parseExclusionLength('Until further notice').kind, 'indefinite');
  assert.deepStrictEqual(
    { kind: parseExclusionLength('1 year').kind, value: parseExclusionLength('1 year').value, unit: parseExclusionLength('1 year').unit },
    { kind: 'duration', value: 1, unit: 'year' });
  assert.strictEqual(parseExclusionLength('6 months').unit, 'month');
  assert.strictEqual(parseExclusionLength('90 days').value, 90);
  assert.strictEqual(parseExclusionLength('2 yrs').unit, 'year', 'yr/yrs normalizes to year');
  assert.strictEqual(parseExclusionLength('gibberish').kind, 'unknown', 'unparseable-but-present length is unknown, not none');

  // ---- addDuration ---------------------------------------------------
  assert.strictEqual(addDuration('2026-01-01T00:00:00.000Z', parseExclusionLength('1 year')), '2027-01-01T00:00:00.000Z');
  assert.strictEqual(addDuration('2026-01-01T00:00:00.000Z', parseExclusionLength('30 days')), '2026-01-31T00:00:00.000Z');
  assert.strictEqual(addDuration('2026-01-01T00:00:00.000Z', parseExclusionLength('permanent')), null, 'indefinite has no computable end');
  assert.strictEqual(addDuration(null, parseExclusionLength('1 year')), null, 'no effective date -> no expiry');

  // ---- computeStatus -------------------------------------------------
  // Served ~3 months ago, 1 year -> active.
  let st = computeStatus('2026-05-01T00:00:00.000Z', parseExclusionLength('1 year'), NOW);
  assert.strictEqual(st.status, 'active');
  assert.strictEqual(st.expiresDate, '2027-05-01T00:00:00.000Z');
  // Served ~2 years ago, 1 year -> expired.
  st = computeStatus('2024-09-14T00:00:00.000Z', parseExclusionLength('1 year'), NOW);
  assert.strictEqual(st.status, 'expired');
  // Indefinite -> active, no expiry.
  st = computeStatus('2020-01-01T00:00:00.000Z', parseExclusionLength('permanent'), NOW);
  assert.strictEqual(st.status, 'active');
  assert.strictEqual(st.expiresDate, null);
  assert.strictEqual(st.indefinite, true);
  // Unknown length -> active w/ unknown end (safety direction).
  st = computeStatus('2020-01-01T00:00:00.000Z', parseExclusionLength('gibberish'), NOW);
  assert.strictEqual(st.status, 'active');
  assert.strictEqual(st.indefinite, true);
  // Exactly on the expiry boundary -> still active (excluded THROUGH the date).
  st = computeStatus('2025-08-06T00:00:00.000Z', parseExclusionLength('1 year'), NOW);
  assert.strictEqual(st.status, 'active', 'active through the expiration instant, not before it');

  // ---- buildPersonExclusions -----------------------------------------
  const caseRows = [
    // P1: active, served exclusion (recent notice, 1 year)
    { personId: 'P1', role: 'subject', caseId: 'C1', caseNumber: 'FGSD-2026-0004',
      incidentType: 'Threatening Behavior', schoolSite: 'FGHS',
      openedAt: '2026-05-20T00:00:00.000Z', incidentAt: '2026-05-19T00:00:00.000Z',
      disposition: 'Exclusion', noticeIssuedDate: '2026-05-22T00:00:00.000Z', noticeGeneratedAt: '2026-05-22T10:00:00.000Z' },
    // P2: expired exclusion (2024 case, 1 year, no served notice -> falls back to case date)
    { personId: 'P2', role: 'subject', caseId: 'C2', caseNumber: 'FGSD-2024-0001',
      incidentType: 'Threatening Behavior', schoolSite: 'FGHS',
      openedAt: '2024-09-15T00:00:00.000Z', incidentAt: '2024-09-14T00:00:00.000Z',
      disposition: 'Exclusion', noticeIssuedDate: null, noticeGeneratedAt: null },
    // P3: subject of a NON-exclusion case (cease and desist) -> must not appear
    { personId: 'P3', role: 'subject', caseId: 'C3', caseNumber: 'FGSD-2024-0003',
      incidentType: 'Disruptive Behavior', schoolSite: 'Cornelius',
      openedAt: '2024-10-10T00:00:00.000Z', incidentAt: '2024-10-10T00:00:00.000Z',
      disposition: null, noticeIssuedDate: null, noticeGeneratedAt: null },
    // P4: linked to the ACTIVE exclusion case but only as reporting_party -> not excluded
    { personId: 'P4', role: 'reporting_party', caseId: 'C1', caseNumber: 'FGSD-2026-0004',
      incidentType: 'Threatening Behavior', schoolSite: 'FGHS',
      openedAt: '2026-05-20T00:00:00.000Z', incidentAt: '2026-05-19T00:00:00.000Z',
      disposition: 'Exclusion', noticeIssuedDate: '2026-05-22T00:00:00.000Z', noticeGeneratedAt: '2026-05-22T10:00:00.000Z' },
  ];
  const violationRows = [
    { caseId: 'C1', recommendedAction: 'Exclusion from all district property', exclusionLength: '1 year', citation: 'KGB-1', shortLabel: 'Injury / Threat of Injury' },
    { caseId: 'C1', recommendedAction: 'Exclusion from all district property', exclusionLength: '6 months', citation: 'KGB-18', shortLabel: 'Loitering' },
    { caseId: 'C2', recommendedAction: 'Exclusion from all district property', exclusionLength: '1 year', citation: 'KGB-1', shortLabel: 'Injury / Threat of Injury' },
    { caseId: 'C3', recommendedAction: 'Warning / Cease and Desist', exclusionLength: 'N/A', citation: 'KGB-3', shortLabel: 'Abusive Conduct' },
  ];

  const map = buildPersonExclusions(caseRows, violationRows, NOW);

  // P1 -- active
  assert.ok(map.P1, 'P1 present');
  assert.strictEqual(map.P1.isExcluded, true, 'P1 actively excluded');
  assert.strictEqual(map.P1.activeCount, 1);
  assert.strictEqual(map.P1.exclusions[0].status, 'active');
  assert.strictEqual(map.P1.exclusions[0].served, true, 'P1 exclusion was served');
  assert.strictEqual(map.P1.exclusions[0].exclusionLength, '1 year', 'longest length (1 year) governs over 6 months');
  assert.strictEqual(map.P1.exclusions[0].expiresDate, '2027-05-22T00:00:00.000Z');
  assert.strictEqual(map.P1.exclusions[0].violations.length, 2, 'both exclusion violations captured');

  // P2 -- expired, so NOT currently excluded
  assert.ok(map.P2, 'P2 present (has an exclusion on record)');
  assert.strictEqual(map.P2.isExcluded, false, 'P2 exclusion has expired -> not currently excluded');
  assert.strictEqual(map.P2.activeCount, 0);
  assert.strictEqual(map.P2.exclusions[0].status, 'expired');
  assert.strictEqual(map.P2.exclusions[0].served, false, 'P2 notice never generated');

  // P3 -- cease & desist, not an exclusion at all
  assert.strictEqual(map.P3, undefined, 'P3 has no exclusion basis -> absent from the map');

  // P4 -- reporting party, never excluded even though the case is an exclusion
  assert.strictEqual(map.P4, undefined, 'P4 is only a reporting party -> absent from the map');

  // emptyPersonExclusion
  assert.deepStrictEqual(emptyPersonExclusion('X'),
    { personId: 'X', isExcluded: false, activeCount: 0, totalCount: 0, exclusions: [] });

  // Disposition Exclusion with NO length-bearing violation -> unknown -> active (safety direction)
  const noLenMap = buildPersonExclusions(
    [{ personId: 'P9', role: 'subject', caseId: 'C9', caseNumber: 'X', openedAt: '2026-07-01T00:00:00.000Z', incidentAt: null, disposition: 'Exclusion', noticeIssuedDate: null, noticeGeneratedAt: null }],
    [],
    NOW);
  assert.strictEqual(noLenMap.P9.isExcluded, true, 'exclusion disposition with no parseable length still flags (safety direction)');
  assert.strictEqual(noLenMap.P9.exclusions[0].indefinite, true);

  console.log('PASS exclusion computation tests');
}

run();
