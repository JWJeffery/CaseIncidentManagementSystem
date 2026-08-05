// tests/effectiveDating.test.js
const assert = require('assert');
const { findCurrent, isCurrentlyEffective } = require('../server/effectiveDating');

function run() {
  const today = '2026-08-05';

  // -- findCurrent --
  const noRecords = findCurrent([], today);
  assert.strictEqual(noRecords, null, 'empty history -- no current record');

  const single = [{ id: 'r1', effectiveFrom: '2026-01-01', effectiveTo: null }];
  assert.strictEqual(findCurrent(single, today).id, 'r1', 'single open-ended record is current');

  const history = [
    { id: 'old', effectiveFrom: '2024-01-01', effectiveTo: '2025-06-30' },
    { id: 'current', effectiveFrom: '2025-07-01', effectiveTo: null },
  ];
  assert.strictEqual(findCurrent(history, today).id, 'current', 'picks the open-ended record over a closed historical one');
  assert.strictEqual(findCurrent(history, '2024-06-15').id, 'old', 'correctly finds the historical record as-of a past date');

  const gapInHistory = [
    { id: 'first', effectiveFrom: '2024-01-01', effectiveTo: '2024-06-01' },
    { id: 'second', effectiveFrom: '2024-07-01', effectiveTo: null },
  ];
  assert.strictEqual(findCurrent(gapInHistory, '2024-06-15'), null, 'a real gap between records (e.g. unregistered period) correctly returns null, not a false match');

  // Boundary: effective THROUGH its effectiveTo date, not before it
  const boundary = [{ id: 'b1', effectiveFrom: '2026-01-01', effectiveTo: '2026-08-05' }];
  assert.strictEqual(findCurrent(boundary, '2026-08-05').id, 'b1', 'valid through its effectiveTo date, not before it');
  assert.strictEqual(findCurrent(boundary, '2026-08-06'), null, 'no longer valid the day after effectiveTo');

  // -- isCurrentlyEffective --
  assert.strictEqual(isCurrentlyEffective(null), false, 'null record is never currently effective');
  assert.strictEqual(isCurrentlyEffective({ effectiveFrom: '2026-01-01', effectiveTo: null }, today), true);
  assert.strictEqual(isCurrentlyEffective({ effectiveFrom: '2026-01-01', effectiveTo: '2026-06-01' }, today), false, 'closed record with a past effectiveTo is not currently effective');

  console.log('PASS effective dating tests');
}

run();
