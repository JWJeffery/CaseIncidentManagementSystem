// server/schoolYearConfig.js
//
// Pure functions for the district-wide "school year end date" setting.
// Permits default their expirationDate to this value (parking permits are
// issued for the school year, not an arbitrary date range), and the
// system prompts once a year to set the next one -- not every time
// someone opens the app, only when the currently-configured date has
// actually passed.
const { todayDateString } = require('./permitExpiration');

/**
 * Given the most recently set config row (or null if none has ever been
 * set), determines whether an admin needs to be prompted for a new
 * school year end date right now.
 */
function computeSchoolYearStatus(config) {
  if (!config || !config.schoolYearEndDate) {
    return { currentEndDate: null, needsUpdate: true, reason: 'never-configured' };
  }
  const needsUpdate = config.schoolYearEndDate < todayDateString();
  return { currentEndDate: config.schoolYearEndDate, needsUpdate, reason: needsUpdate ? 'expired' : null };
}

/**
 * The default expirationDate a new/renewed permit should get when the
 * caller didn't explicitly provide one. Returns null (meaning "no
 * default available, require explicit input") if there's no config or
 * the configured date has already passed -- we don't want to silently
 * issue a permit that defaults to an already-expired date.
 */
function defaultExpirationDate(config) {
  const status = computeSchoolYearStatus(config);
  return status.needsUpdate ? null : status.currentEndDate;
}

module.exports = { computeSchoolYearStatus, defaultExpirationDate };
