// tests/towWorkflow.test.js
// Same pattern as packages/reunification/tests/workflow.test.js -- plain
// assertions, no test framework, run directly with `node`. Tests the
// pure module in server/towWorkflow.js, no DB or server required.
const assert = require('assert');
const {
  STATUSES, addExcludingWeekends, evaluateDeadline, computeDeadlines,
  canAffixPreTowNotice, canExecuteTow, canMailPostTowNotice, canRequestHearing,
  canScheduleHearing, canDecideHearing, canRelease,
} = require('../server/towWorkflow');

function run() {
  // -- addExcludingWeekends --
  const friday10am = '2026-08-07T10:00:00.000Z';
  const weekendResult = addExcludingWeekends(friday10am, 48);
  const weekendResultDate = new Date(weekendResult);
  assert.ok(weekendResultDate.getDay() !== 0 && weekendResultDate.getDay() !== 6, 'result should not land on a weekend day itself');
  assert.ok(weekendResultDate > new Date('2026-08-10T00:00:00.000Z'), 'should skip the weekend, landing after Monday midnight');

  const monday10am = '2026-08-10T10:00:00.000Z';
  const noWeekendResult = addExcludingWeekends(monday10am, 8);
  const hoursDiff = (new Date(noWeekendResult) - new Date(monday10am)) / (60 * 60 * 1000);
  assert.strictEqual(hoursDiff, 8, 'no weekend crossing should be exactly +8 real hours');

  // -- evaluateDeadline --
  const pastDeadline = new Date(Date.now() - 1000 * 60 * 60).toISOString();
  assert.strictEqual(evaluateDeadline(pastDeadline, null, 48).status, 'overdue');

  const futureDeadline = new Date(Date.now() + 1000 * 60 * 60 * 40).toISOString();
  assert.strictEqual(evaluateDeadline(futureDeadline, null, 48).status, 'ok');

  const soonDeadline = new Date(Date.now() + 1000 * 60 * 60 * 5).toISOString();
  assert.strictEqual(evaluateDeadline(soonDeadline, null, 48).status, 'due-soon');

  assert.strictEqual(evaluateDeadline(futureDeadline, new Date().toISOString(), 48).status, 'complete');
  assert.strictEqual(evaluateDeadline(pastDeadline, new Date().toISOString(), 48).status, 'complete-late');

  // -- canExecuteTow: the real enforcement this module adds --
  assert.strictEqual(canExecuteTow({ status: STATUSES.OPEN, hazardTow: 1 }), true, 'hazard tow executable immediately');
  assert.strictEqual(canExecuteTow({ status: STATUSES.OPEN, hazardTow: 0 }), false, 'non-hazard tow blocked without notice affixed');
  assert.strictEqual(canExecuteTow({
    status: STATUSES.PRE_NOTICE_AFFIXED, hazardTow: 0, preTowNoticeAffixedAt: new Date().toISOString(),
  }), false, 'non-hazard tow blocked before 48hr window elapses');
  assert.strictEqual(canExecuteTow({
    status: STATUSES.PRE_NOTICE_AFFIXED, hazardTow: 0,
    preTowNoticeAffixedAt: new Date(Date.now() - 1000 * 60 * 60 * 80).toISOString(),
  }), true, 'non-hazard tow allowed once 48hr window has elapsed');

  // -- state machine gating --
  assert.strictEqual(canAffixPreTowNotice({ status: STATUSES.OPEN, hazardTow: 0 }), true);
  assert.strictEqual(canAffixPreTowNotice({ status: STATUSES.OPEN, hazardTow: 1 }), false, 'hazard tows skip pre-notice');
  assert.strictEqual(canMailPostTowNotice({ status: STATUSES.TOWED }), true);
  assert.strictEqual(canMailPostTowNotice({ status: STATUSES.OPEN }), false);
  assert.strictEqual(canRequestHearing({ status: STATUSES.POST_NOTICE_MAILED }), true);
  assert.strictEqual(canRequestHearing({ status: STATUSES.RELEASED }), false, 'cannot request hearing after release');
  assert.strictEqual(canScheduleHearing({ status: STATUSES.HEARING_REQUESTED }), true);
  assert.strictEqual(canDecideHearing({ status: STATUSES.HEARING_SCHEDULED }), true);
  assert.strictEqual(canRelease({ status: STATUSES.TOWED }), true, 'uncontested tow can release directly');
  assert.strictEqual(canRelease({ status: STATUSES.HEARING_REQUESTED }), false, 'cannot release mid-hearing');
  assert.strictEqual(canRelease({ status: STATUSES.HEARING_DECIDED_INVALID }), true, 'invalid decision allows release');

  // -- computeDeadlines integration --
  const activeTow = {
    status: STATUSES.TOWED,
    towedAt: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
    postTowNoticeMailedAt: null, hearingRequestedAt: null, hearingScheduledAt: null,
    preTowNoticeAffixedAt: null, releasedAt: null,
  };
  const deadlines = computeDeadlines(activeTow);
  assert.ok(deadlines.postTowNoticeDeadline, 'should compute a post-tow-notice deadline for a towed vehicle');
  assert.strictEqual(deadlines.postTowNoticeDeadline.status, 'ok', 'plenty of time left on a 10hr-old tow');

  console.log('PASS tow workflow tests');
}

run();
