// packages/shared/src/identifiers.js
//
// Central counter service for the two external identifier tiers used across
// every module (case-management, reunification, and future injury/parking
// modules). See the FGSD Public Safety RMS design doc §3 for the full
// rationale — this file is the single source of truth for the format and
// reset behavior, so no module should format these strings independently.
//
// Incident Number: lifetime sequence, never resets, no year segment.
//   Format: FGSD-#######  (7-digit zero-padded sequence)
// Case Number: annual reset, always carries a year segment.
//   Format: FGSD-YYYY-#####  (5-digit zero-padded sequence, resets to 1 each year)
//
// The year segment on Case Number is itself the visual distinguisher from
// Incident Number — no leading letter (e.g. "C") is needed.

const INCIDENT_PAD = 7;
const CASE_PAD = 5;

function formatIncidentNumber(sequence) {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('Incident sequence must be a positive integer.');
  }
  return `FGSD-${String(sequence).padStart(INCIDENT_PAD, '0')}`;
}

function formatCaseNumber(year, sequence) {
  if (!Number.isInteger(year) || year < 2000) {
    throw new Error('Case number year must be a valid 4-digit year.');
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('Case sequence must be a positive integer.');
  }
  return `FGSD-${year}-${String(sequence).padStart(CASE_PAD, '0')}`;
}

/**
 * In-memory counter store, intended as a reference implementation only.
 * The production system should back this with a real central counter
 * table/service (e.g. a Postgres sequence or a single-row-per-year counter
 * table with row-level locking) so concurrent requests across modules never
 * collide. This class exists so every module can share one interface while
 * the real backing store is built.
 */
class IdentifierCounter {
  constructor() {
    this._incidentSequence = 0;
    this._caseSequenceByYear = new Map();
  }

  nextIncidentNumber() {
    this._incidentSequence += 1;
    return formatIncidentNumber(this._incidentSequence);
  }

  nextCaseNumber(year = new Date().getFullYear()) {
    const current = this._caseSequenceByYear.get(year) || 0;
    const next = current + 1;
    this._caseSequenceByYear.set(year, next);
    return formatCaseNumber(year, next);
  }
}

module.exports = {
  formatIncidentNumber,
  formatCaseNumber,
  IdentifierCounter,
};
