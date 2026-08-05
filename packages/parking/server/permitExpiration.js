// server/permitExpiration.js
//
// Pure functions for permit expiration, same pattern as towWorkflow.js --
// DB-free, separately tested (tests/permitExpiration.test.js).
//
// This closes a real gap, not just a UI one: before this module existed,
// a permit's `expirationDate` was collected but nothing ever compared it
// to today, so a permit that expired last month still read `status:
// "Active"` everywhere -- including in Citation's Administrative-track
// eligibility check (routes/citations.js), which is a compliance-relevant
// bug, not a cosmetic one: an actually-expired permit should not qualify
// a vehicle for administrative treatment under ECD §5(A).
//
// expirationDate is stored as a plain YYYY-MM-DD date (from an HTML date
// input), not a full timestamp -- a permit is valid THROUGH its
// expiration date, expiring at the start of the next day. Comparisons
// below are date-only for that reason.

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

// Is this permit currently valid *as of right now*, independent of
// whatever its `status` column says? This is the source of truth other
// modules (Citation eligibility, Field Lookup) should check against
// directly, rather than trusting a possibly-stale status column.
function isPermitCurrentlyValid(permit) {
  if (!permit) return false;
  if (permit.status !== 'Active') return false;
  if (!permit.expirationDate) return true; // no expiration set -- valid indefinitely
  return permit.expirationDate >= todayDateString();
}

function isPermitExpired(permit) {
  return !!permit && permit.status === 'Active' && !!permit.expirationDate
    && permit.expirationDate < todayDateString();
}

module.exports = { todayDateString, isPermitCurrentlyValid, isPermitExpired };
