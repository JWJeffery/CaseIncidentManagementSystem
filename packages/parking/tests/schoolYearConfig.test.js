// tests/schoolYearConfig.test.js
const assert = require('assert');
const { computeSchoolYearStatus, defaultExpirationDate } = require('../server/schoolYearConfig');
const { todayDateString } = require('../server/permitExpiration');

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function run() {
  const today = todayDateString();
  const future = addDays(today, 60);
  const past = addDays(today, -1);

  // -- computeSchoolYearStatus --
  const neverSet = computeSchoolYearStatus(null);
  assert.strictEqual(neverSet.needsUpdate, true, 'no config ever set -- needs update');
  assert.strictEqual(neverSet.reason, 'never-configured');

  const stillCurrent = computeSchoolYearStatus({ schoolYearEndDate: future });
  assert.strictEqual(stillCurrent.needsUpdate, false, 'future end date -- does not need update yet');

  const validThroughToday = computeSchoolYearStatus({ schoolYearEndDate: today });
  assert.strictEqual(validThroughToday.needsUpdate, false, 'valid THROUGH the end date itself, not before it');

  const lapsed = computeSchoolYearStatus({ schoolYearEndDate: past });
  assert.strictEqual(lapsed.needsUpdate, true, 'end date already passed -- needs update');
  assert.strictEqual(lapsed.reason, 'expired');

  // -- defaultExpirationDate: what a new/renewed permit should default to --
  assert.strictEqual(defaultExpirationDate(null), null, 'no config -- no default, caller must supply one explicitly');
  assert.strictEqual(defaultExpirationDate({ schoolYearEndDate: past }), null, 'lapsed config -- no default, do not silently issue an already-expired permit');
  assert.strictEqual(defaultExpirationDate({ schoolYearEndDate: future }), future, 'current config -- defaults to the configured school year end date');

  console.log('PASS school year config tests');
}

run();
