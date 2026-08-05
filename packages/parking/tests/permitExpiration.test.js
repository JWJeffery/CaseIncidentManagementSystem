// tests/permitExpiration.test.js
const assert = require('assert');
const { todayDateString, isPermitCurrentlyValid, isPermitExpired } = require('../server/permitExpiration');

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function run() {
  const today = todayDateString();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);

  // -- isPermitCurrentlyValid --
  assert.strictEqual(isPermitCurrentlyValid(null), false, 'null permit is not valid');
  assert.strictEqual(isPermitCurrentlyValid({ status: 'Active', expirationDate: null }), true, 'Active with no expiration is valid indefinitely');
  assert.strictEqual(isPermitCurrentlyValid({ status: 'Active', expirationDate: tomorrow }), true, 'Active, expires tomorrow -- still valid today');
  assert.strictEqual(isPermitCurrentlyValid({ status: 'Active', expirationDate: today }), true, 'valid THROUGH its expiration date, not up to the day before');
  assert.strictEqual(isPermitCurrentlyValid({ status: 'Active', expirationDate: yesterday }), false, 'expired yesterday -- not valid today, even though status column still says Active');
  assert.strictEqual(isPermitCurrentlyValid({ status: 'Expired', expirationDate: tomorrow }), false, 'status Expired always invalid regardless of date');
  assert.strictEqual(isPermitCurrentlyValid({ status: 'Revoked', expirationDate: tomorrow }), false, 'status Revoked always invalid regardless of date');

  // -- isPermitExpired (what the sweep should flip to Expired) --
  assert.strictEqual(isPermitExpired({ status: 'Active', expirationDate: yesterday }), true, 'Active + past date -- should sweep to Expired');
  assert.strictEqual(isPermitExpired({ status: 'Active', expirationDate: today }), false, 'Active + expires today -- not expired yet');
  assert.strictEqual(isPermitExpired({ status: 'Active', expirationDate: tomorrow }), false, 'Active + future date -- not expired');
  assert.strictEqual(isPermitExpired({ status: 'Active', expirationDate: null }), false, 'no expiration date -- never auto-expires');
  assert.strictEqual(isPermitExpired({ status: 'Revoked', expirationDate: yesterday }), false, 'Revoked with a past date should NOT be reported as "expired" -- it is revoked, a different status, must not get overwritten');
  assert.strictEqual(isPermitExpired({ status: 'Expired', expirationDate: yesterday }), false, 'already Expired -- nothing to sweep');

  console.log('PASS permit expiration tests');
}

run();
