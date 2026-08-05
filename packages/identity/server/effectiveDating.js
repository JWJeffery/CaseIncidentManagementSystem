// server/effectiveDating.js
//
// Pure functions for the time-bound record pattern used by
// vehicle_registrations and vehicle_ownership: effectiveTo === null means
// "this is the current record." Separated out and tested independently,
// same reasoning as towWorkflow.js and permitExpiration.js -- the date
// logic is where a subtle off-by-one bug would actually matter (e.g.
// showing the wrong plate as "current" for a vehicle with a real
// registration history).

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Given a list of time-bound records (each with effectiveFrom and
 * effectiveTo, dates as YYYY-MM-DD strings, effectiveTo null meaning
 * open-ended), returns whichever one is current as of asOfDate (defaults
 * to today). Returns null if none apply.
 */
function findCurrent(records, asOfDate = todayDateString()) {
  if (!records || !records.length) return null;
  return records.find(r =>
    r.effectiveFrom <= asOfDate && (r.effectiveTo === null || r.effectiveTo === undefined || r.effectiveTo >= asOfDate)
  ) || null;
}

function isCurrentlyEffective(record, asOfDate = todayDateString()) {
  if (!record) return false;
  return record.effectiveFrom <= asOfDate && (record.effectiveTo === null || record.effectiveTo === undefined || record.effectiveTo >= asOfDate);
}

module.exports = { todayDateString, findCurrent, isCurrentlyEffective };
