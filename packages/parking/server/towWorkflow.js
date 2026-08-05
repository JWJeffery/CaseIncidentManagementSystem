// server/towWorkflow.js
//
// Pure functions for the Tow subsystem's state machine and statutory
// deadlines (ECD §6-8). Deliberately DB-free and side-effect-free, same
// pattern as packages/reunification/src/workflow.js -- lets the actual
// legal-deadline math get tested directly without spinning up a server.
//
// Known limitation, stated plainly: "excluding weekends and holidays" per
// ECD is only partially modeled here -- weekends are excluded from
// deadline math, but there is no district holiday calendar available to
// this module, so holidays are NOT excluded. A deadline computed here
// could be up to a few days too early on a week containing a holiday.
// This needs a real holiday calendar before it's relied on for an actual
// contested tow.

const STATUSES = Object.freeze({
  OPEN: 'Open',
  PRE_NOTICE_AFFIXED: 'Pre-Tow Notice Affixed',
  TOWED: 'Towed',
  POST_NOTICE_MAILED: 'Post-Tow Notice Mailed',
  HEARING_REQUESTED: 'Hearing Requested',
  HEARING_SCHEDULED: 'Hearing Scheduled',
  HEARING_DECIDED_VALID: 'Hearing Decided -- Valid',
  HEARING_DECIDED_INVALID: 'Hearing Decided -- Invalid',
  RELEASED: 'Released',
});

// Advances `startIso` by `hours` counted hours, skipping Saturday/Sunday
// (they still pass on the calendar, they just don't count toward the
// deadline window) -- matches ECD's "excluding weekends" language for the
// hour-based deadlines. See file header re: holidays not being modeled.
function addExcludingWeekends(startIso, hours) {
  let current = new Date(startIso);
  let remaining = hours;
  while (remaining > 0) {
    current = new Date(current.getTime() + 60 * 60 * 1000);
    const day = current.getDay(); // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return current.toISOString();
}

function addCalendarDays(startIso, days) {
  const d = new Date(startIso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// Returns { deadline, status, lateBy } where status is one of:
//   'complete'   -- the action was taken (actionIso set), on time
//   'complete-late' -- the action was taken, but after the deadline
//   'overdue'    -- not yet taken, deadline has passed
//   'due-soon'   -- not yet taken, within the last 20% of the window
//   'ok'         -- not yet taken, plenty of time left
//   null         -- not applicable (no deadline for this record's state)
function evaluateDeadline(deadlineIso, actionIso, windowHours) {
  if (!deadlineIso) return { deadline: null, status: null };
  if (actionIso) {
    const late = new Date(actionIso) > new Date(deadlineIso);
    return { deadline: deadlineIso, status: late ? 'complete-late' : 'complete' };
  }
  const now = new Date();
  const deadline = new Date(deadlineIso);
  if (now > deadline) return { deadline: deadlineIso, status: 'overdue' };
  const windowMs = windowHours * 60 * 60 * 1000;
  const remainingMs = deadline.getTime() - now.getTime();
  if (remainingMs < windowMs * 0.2) return { deadline: deadlineIso, status: 'due-soon' };
  return { deadline: deadlineIso, status: 'ok' };
}

/**
 * Computes every applicable deadline for a tow record's current state.
 * Returns a map of deadline name -> { deadline, status }. Only includes
 * deadlines relevant to where the record actually is in the workflow.
 */
function computeDeadlines(tow) {
  const out = {};

  if (tow.status === STATUSES.PRE_NOTICE_AFFIXED && tow.preTowNoticeAffixedAt) {
    // ECD §6.B(i): 48 hours must elapse after the notice is affixed
    // before the vehicle may actually be towed.
    const deadline = addExcludingWeekends(tow.preTowNoticeAffixedAt, 48);
    out.eligibleToTow = evaluateDeadline(deadline, tow.towedAt, 48);
  }

  if (tow.towedAt) {
    // ECD §6.C(i): post-tow notice mailed within 48 hours of towing.
    const deadline = addExcludingWeekends(tow.towedAt, 48);
    out.postTowNoticeDeadline = evaluateDeadline(deadline, tow.postTowNoticeMailedAt, 48);
  }

  if (tow.postTowNoticeMailedAt && !tow.hearingRequestedAt) {
    // ECD §7.A(i)(a): hearing request within 5 days of post-tow notice
    // mailing (for tows that were actually executed).
    const deadline = addCalendarDays(tow.postTowNoticeMailedAt, 5);
    out.hearingRequestDeadline = evaluateDeadline(deadline, tow.hearingRequestedAt, 5 * 24);
  } else if (tow.preTowNoticeAffixedAt && !tow.towedAt && !tow.hearingRequestedAt) {
    // ECD §7.A(i)(b): pre-notice challenge, before the vehicle is
    // actually towed -- 5 days from the notice being affixed.
    const deadline = addCalendarDays(tow.preTowNoticeAffixedAt, 5);
    out.hearingRequestDeadline = evaluateDeadline(deadline, tow.hearingRequestedAt, 5 * 24);
  }

  if (tow.hearingRequestedAt && !tow.hearingScheduledAt) {
    // ECD §6.D(ii) / §7.C(ii): 72 hours if the vehicle is still physically
    // held (already towed, not yet released); otherwise 14 days.
    const stillHeld = !!tow.towedAt && !tow.releasedAt;
    const deadline = stillHeld
      ? addExcludingWeekends(tow.hearingRequestedAt, 72)
      : addCalendarDays(tow.hearingRequestedAt, 14);
    out.hearingScheduleDeadline = evaluateDeadline(deadline, tow.hearingScheduledAt, stillHeld ? 72 : 14 * 24);
  }

  return out;
}

function canAffixPreTowNotice(tow) {
  return tow.status === STATUSES.OPEN && !tow.hazardTow;
}

function canExecuteTow(tow) {
  if (tow.hazardTow) return tow.status === STATUSES.OPEN;
  if (tow.status !== STATUSES.PRE_NOTICE_AFFIXED) return false;
  // Real enforcement, not just documentation: a non-hazard tow cannot
  // actually be executed until the 48-hour pre-tow notice window has
  // elapsed. This was an explicitly flagged gap before this module existed.
  const deadline = addExcludingWeekends(tow.preTowNoticeAffixedAt, 48);
  return new Date() >= new Date(deadline);
}

function canMailPostTowNotice(tow) {
  return tow.status === STATUSES.TOWED;
}

function canRequestHearing(tow) {
  return [STATUSES.PRE_NOTICE_AFFIXED, STATUSES.TOWED, STATUSES.POST_NOTICE_MAILED].includes(tow.status);
}

function canScheduleHearing(tow) {
  return tow.status === STATUSES.HEARING_REQUESTED;
}

function canDecideHearing(tow) {
  return tow.status === STATUSES.HEARING_SCHEDULED;
}

function canRelease(tow) {
  // Uncontested tows can be released directly once towed/notice-mailed
  // (owner just pays and reclaims -- most tows are never contested).
  // Contested tows must go through a hearing decision first.
  return [STATUSES.TOWED, STATUSES.POST_NOTICE_MAILED, STATUSES.HEARING_DECIDED_VALID, STATUSES.HEARING_DECIDED_INVALID].includes(tow.status);
}

module.exports = {
  STATUSES,
  addExcludingWeekends,
  addCalendarDays,
  evaluateDeadline,
  computeDeadlines,
  canAffixPreTowNotice,
  canExecuteTow,
  canMailPostTowNotice,
  canRequestHearing,
  canScheduleHearing,
  canDecideHearing,
  canRelease,
};
