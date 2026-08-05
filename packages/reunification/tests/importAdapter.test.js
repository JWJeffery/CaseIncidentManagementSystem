import assert from 'node:assert/strict';
import { parseCsv, importCsv } from '../src/importAdapter.js';

const parsed = parseCsv('name,note\n"Rivera, Mason","quoted, comma"\n');
assert.deepEqual(parsed, [
  ['name', 'note'],
  ['Rivera, Mason', 'quoted, comma']
]);

const groupedCsv = [
  'Student > ID,Student > Name,Student > School,Student > Grade,Student > Home Room,Parent/Guardian Contact Info > Relationship,Parent/Guardian Contact Info > Name,Parent/Guardian Contact Info > Release To,Emergency Contact Info > Relationship,Emergency Contact Info > Name,Emergency Contact Info > Release To',
  'S-1,"Sample, Student",Sample Elementary,4,Ms. Harper,Mother,"Sample, Mother",Y,Neighbor,"Sample, Neighbor",N',
  'S-1,"Sample, Student",Sample Elementary,4,Ms. Harper,Father,"Sample, Father",YES,Aunt,"Sample, Aunt",TRUE'
].join('\n');
const grouped = importCsv(groupedCsv);
assert.equal(grouped.students.length, 1);
assert.equal(grouped.students[0].name, 'Student Sample');
assert.equal(grouped.students[0].contacts.length, 4);
assert.equal(grouped.students[0].contacts.filter(contact => contact.release).length, 3);
assert.equal(grouped.issues.length, 0);

const flatCsv = [
  'student_number,full_name,building,grade,teacher_of_record,contact_name,relation,release_ok',
  'S-2,Ella Cooper,Forest Grove High School,11,Advisory 11B,Daniel Cooper,Father,true'
].join('\n');
const flat = importCsv(flatCsv);
assert.equal(flat.students.length, 1);
assert.equal(flat.students[0].contacts[0].release, true);

const noAuthorizedCsv = [
  'Student > ID,Student > Name,Parent/Guardian Contact Info > Name,Parent/Guardian Contact Info > Release To',
  'S-3,No Release Student,Listed Person,N'
].join('\n');
const noAuthorized = importCsv(noAuthorizedCsv);
assert.equal(noAuthorized.students.length, 1);
assert.ok(noAuthorized.issues.some(issue => issue.includes('no authorized release contact')));

const missingIdCsv = [
  'Student > ID,Student > Name,Parent/Guardian Contact Info > Name,Parent/Guardian Contact Info > Release To',
  ',Missing Id Student,Listed Person,Y'
].join('\n');
const missing = importCsv(missingIdCsv);
assert.equal(missing.students.length, 0);
assert.ok(missing.issues.some(issue => issue.includes('Skipped row')));

console.log('PASS import adapter tests');
