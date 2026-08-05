import assert from 'node:assert/strict';
import { statuses, blankCard, approveMatch, sendToReunifier, completeRelease, resetWorkflow } from '../src/workflow.js';

const student = { id: 'S-1', name: 'Student One' };
const contact = { id: 'C-1', name: 'Contact One', release: true };

let state = {
  status: statuses.CLAIMANT_ENTRY,
  studentId: 'S-1',
  contactId: 'C-1',
  query: 'Student',
  readName: 'Contact One',
  nameFlag: 'Name appears consistent',
  previewUrl: 'blob:test',
  card: { ...blankCard(), student: 'Written Student', grade: '4', teacher: 'Written Teacher', pickup: 'Written Adult', signature: 'Written Signature' }
};

assert.throws(() => sendToReunifier(state));
assert.throws(() => completeRelease(state, '10:30'));

state = approveMatch(state, student, contact);
assert.equal(state.status, statuses.APPROVED);
assert.equal(state.card.releaseStudent, 'Written Student');
assert.equal(state.card.releaseTeacher, 'Written Teacher');
assert.equal(state.card.releasePerson, 'Written Adult');

state = sendToReunifier(state);
assert.equal(state.status, statuses.SENT_TO_REUNIFIER);

state = completeRelease(state, '10:30');
assert.equal(state.status, statuses.RELEASED);
assert.equal(state.card.releaseTime, '10:30');

const reset = resetWorkflow(state);
assert.equal(reset.status, statuses.CLAIMANT_ENTRY);
assert.equal(reset.studentId, '');
assert.equal(reset.contactId, '');
assert.equal(reset.readName, '');
assert.equal(reset.card.student, '');

console.log('PASS workflow tests');
