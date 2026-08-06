// server/exclusions.js
//
// Cross-module EXCLUSION computation -- the payoff of the shared Person
// store (RESUME_PROJECT_NOTE.md: "an Exclusion check at citation time").
//
// An "exclusion" is NOT a first-class row in this system. It is DERIVED
// from a case where a person is a SUBJECT and the case is dispositioned
// 'Exclusion' (or carries a violation whose recommendedAction is an
// exclusion), made effective by a served Notice of Exclusion document.
// This module holds the pure, DB-FREE logic for:
//   - parsing a free-text exclusion length ("1 year", "90 days", ...),
//   - computing whether an exclusion is currently in effect, and
//   - assembling per-person exclusion records from already-queried rows.
//
// It never touches the database -- the SQL that feeds it lives in
// routes/exclusions.js. This split (pure logic here, DB access in the
// route) is deliberate and matches the precedent parking set with
// permitExpiration.js / towWorkflow.js: the fiddly date/duration math is
// exactly the part that must be unit-testable without a running server,
// and it is (see exclusions.test.js).
//
// SAFETY DIRECTION: where the data is ambiguous (an exclusion whose
// length can't be parsed, or a case dispositioned 'Exclusion' with no
// length-bearing violation), this module errs toward FLAGGING the person
// as excluded (in effect, no computable end) rather than silently
// clearing them. For a public-safety check surfaced to an officer in the
// field, a false "still excluded" that a human then verifies is far
// safer than a false "all clear".
'use strict';

// Roles (on case_persons.role) that make a person the SUBJECT of an
// exclusion. A reporting_party or witness linked to an exclusion case is
// NOT excluded -- only the subject is. Seed data uses 'subject'; the
// others are accepted defensively in case future intake uses them.
const SUBJECT_ROLES = new Set(['subject', 'respondent', 'excluded_party', 'excluded']);

function isSubjectRole(role) {
  return SUBJECT_ROLES.has(String(role || '').trim().toLowerCase());
}

// A recommendedAction that represents an actual exclusion (vs. a warning
// or cease-and-desist or no action). Matches "Exclusion from all
// district property" and similar; deliberately does NOT match
// "Warning / Cease and Desist".
function isExclusionAction(recommendedAction) {
  return /\bexclu/i.test(String(recommendedAction || ''));
}

const UNIT_MS = { day: 86400000, week: 7 * 86400000 };
const AVG_MONTH_MS = 30.44 * 86400000;

// Parse a free-text exclusion length into a structured form.
//   'none'       -- no exclusion window (N/A, blank)
//   'duration'   -- { value, unit } where unit in day|week|month|year
//   'indefinite' -- permanent / until further notice
//   'unknown'    -- there IS an exclusion but the length text can't be
//                   parsed; treated downstream as in-effect-with-no-end
function parseExclusionLength(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (!s || s === 'n/a' || s === 'na' || s === 'none' || s === '-' || s === '—') {
    return { kind: 'none', raw };
  }
  if (/(permanent|indefinite|until further notice|lifetime|no expiration|no expiry|forever)/.test(s)) {
    return { kind: 'indefinite', raw };
  }
  const m = s.match(/(\d+(?:\.\d+)?)\s*(day|week|month|year|yr)s?\b/);
  if (m) {
    const value = parseFloat(m[1]);
    let unit = m[2];
    if (unit === 'yr') unit = 'year';
    if (value > 0) return { kind: 'duration', value, unit, raw };
  }
  return { kind: 'unknown', raw };
}

// Add a parsed DURATION to an ISO date; returns an ISO string, or null
// for any non-duration kind (indefinite/unknown/none have no computable
// end) or an unparseable effective date.
function addDuration(effectiveISO, parsed) {
  if (!effectiveISO || !parsed || parsed.kind !== 'duration') return null;
  const d = new Date(effectiveISO);
  if (isNaN(d.getTime())) return null;
  const { value, unit } = parsed;
  if (unit === 'day' || unit === 'week') {
    return new Date(d.getTime() + value * UNIT_MS[unit]).toISOString();
  }
  const whole = Math.floor(value);
  const frac = value - whole;
  const nd = new Date(d.getTime());
  if (unit === 'month') {
    nd.setUTCMonth(nd.getUTCMonth() + whole);
    if (frac) nd.setTime(nd.getTime() + frac * AVG_MONTH_MS);
    return nd.toISOString();
  }
  if (unit === 'year') {
    nd.setUTCFullYear(nd.getUTCFullYear() + whole);
    if (frac) nd.setUTCMonth(nd.getUTCMonth() + Math.round(frac * 12));
    return nd.toISOString();
  }
  return null;
}

// Rank used to choose the LONGEST governing length across multiple
// exclusion violations on one case. Higher = longer. Indefinite/unknown
// outrank any finite duration; 'none' ranks below everything.
function durationRankMs(parsed) {
  if (!parsed) return -1;
  if (parsed.kind === 'indefinite' || parsed.kind === 'unknown') return Infinity;
  if (parsed.kind === 'duration') {
    const base = '2000-01-01T00:00:00.000Z';
    const end = addDuration(base, parsed);
    return end ? new Date(end).getTime() - new Date(base).getTime() : -1;
  }
  return -1;
}

// Given an effective date, a parsed governing length, and 'now',
// determine whether the exclusion is currently in effect.
//   returns { status: 'active'|'expired'|'none', expiresDate, indefinite }
function computeStatus(effectiveISO, parsed, asOfISO) {
  if (!parsed || parsed.kind === 'none') {
    return { status: 'none', expiresDate: null, indefinite: false };
  }
  if (parsed.kind === 'indefinite' || parsed.kind === 'unknown') {
    return { status: 'active', expiresDate: null, indefinite: true };
  }
  // duration
  const expiresISO = addDuration(effectiveISO, parsed);
  if (!expiresISO) {
    // Had a real length but no usable effective date -- flag as active
    // with an unknown end rather than dropping it.
    return { status: 'active', expiresDate: null, indefinite: true };
  }
  const asOf = new Date(asOfISO || new Date().toISOString()).getTime();
  const expired = asOf > new Date(expiresISO).getTime();
  return { status: expired ? 'expired' : 'active', expiresDate: expiresISO, indefinite: false };
}

// Assemble per-person exclusion records from already-queried rows.
//
// caseRows: one row per (subject person, case) link --
//   { personId, role, caseId, caseNumber, incidentType, schoolSite,
//     openedAt, incidentAt, disposition,
//     noticeIssuedDate, noticeGeneratedAt }
//   noticeIssuedDate/noticeGeneratedAt are null when no exclusion_notice
//   has been served for that case yet.
// violationRows: { caseId, recommendedAction, exclusionLength, citation, shortLabel }
// asOfISO: the "now" to evaluate against (tests pass a fixed value).
//
// Returns a map keyed by personId: { personId, isExcluded, activeCount,
// totalCount, exclusions: [...] }. Persons with no exclusion basis do not
// appear (callers use emptyPersonExclusion() to represent "checked, none").
function buildPersonExclusions(caseRows, violationRows, asOfISO) {
  const now = asOfISO || new Date().toISOString();

  const violationsByCase = new Map();
  for (const v of (violationRows || [])) {
    if (!violationsByCase.has(v.caseId)) violationsByCase.set(v.caseId, []);
    violationsByCase.get(v.caseId).push(v);
  }

  const byPerson = new Map();

  for (const row of (caseRows || [])) {
    if (!isSubjectRole(row.role)) continue;

    const caseViolations = violationsByCase.get(row.caseId) || [];
    const exclusionViolations = caseViolations.filter(v => isExclusionAction(v.recommendedAction));
    const isExclusionCase =
      String(row.disposition || '').trim().toLowerCase() === 'exclusion' ||
      exclusionViolations.length > 0;
    if (!isExclusionCase) continue;

    // Governing length = the LONGEST among the exclusion violations, so a
    // person excluded "1 year" on one violation and "6 months" on another
    // is treated as excluded for the year. A case dispositioned Exclusion
    // with no length-bearing violation falls through to 'unknown'.
    let governing = { kind: 'unknown', raw: null };
    let governingRaw = null;
    let bestRank = -Infinity;
    for (const v of exclusionViolations) {
      const p = parseExclusionLength(v.exclusionLength);
      const rank = durationRankMs(p);
      if (rank > bestRank) { bestRank = rank; governing = p; governingRaw = v.exclusionLength; }
    }

    // Effective date: the served notice's issued date is authoritative;
    // fall back to the notice's generation timestamp, then the case's own
    // incident/opened dates when no notice has been served yet.
    const effectiveDate = row.noticeIssuedDate || row.noticeGeneratedAt || row.incidentAt || row.openedAt || null;
    const served = !!row.noticeGeneratedAt;
    const st = computeStatus(effectiveDate, governing, now);

    const record = {
      caseId: row.caseId,
      caseNumber: row.caseNumber || null,
      incidentType: row.incidentType || null,
      schoolSite: row.schoolSite || null,
      role: row.role,
      effectiveDate,
      expiresDate: st.expiresDate,
      exclusionLength: governingRaw,
      indefinite: st.indefinite,
      served,
      status: st.status, // 'active' | 'expired'
      violations: exclusionViolations.map(v => ({
        citation: v.citation || null,
        shortLabel: v.shortLabel || null,
        recommendedAction: v.recommendedAction || null,
        exclusionLength: v.exclusionLength || null,
      })),
    };

    if (!byPerson.has(row.personId)) byPerson.set(row.personId, []);
    byPerson.get(row.personId).push(record);
  }

  const result = {};
  for (const [personId, records] of byPerson.entries()) {
    records.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1; // active first
      return String(b.effectiveDate || '').localeCompare(String(a.effectiveDate || ''));
    });
    const activeCount = records.filter(r => r.status === 'active').length;
    result[personId] = {
      personId,
      isExcluded: activeCount > 0,
      activeCount,
      totalCount: records.length,
      exclusions: records,
    };
  }
  return result;
}

// Canonical "checked this person, no exclusion basis on file" shape.
function emptyPersonExclusion(personId) {
  return { personId, isExcluded: false, activeCount: 0, totalCount: 0, exclusions: [] };
}

module.exports = {
  SUBJECT_ROLES,
  isSubjectRole,
  isExclusionAction,
  parseExclusionLength,
  addDuration,
  durationRankMs,
  computeStatus,
  buildPersonExclusions,
  emptyPersonExclusion,
};
