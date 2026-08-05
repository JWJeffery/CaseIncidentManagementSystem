// packages/shared/src/recordsClassification.js
//
// Every record in the RMS carries a records_classification value, per the
// design doc §5. This is NOT just a label — per OAR 581-021-0225(4)(a), an
// LEU record loses its LEU status if it is maintained by a non-LEU
// component of the district. That means LEU-classified data must live in
// genuinely separate storage/access boundaries, not just a tagged column in
// a shared table. This module centralizes the enum so every package uses
// identical values, but it does NOT by itself satisfy the storage-boundary
// requirement — that's a database/access-control decision made per module.

const RecordsClassification = Object.freeze({
  LEU_PUBLIC_SAFETY: 'LEU-Public Safety',
  EDUCATION_RECORD: 'Education Record',
  EMPLOYEE_PERSONNEL: 'Employee/Personnel Record',
  COURT_RECORD: 'Court Record', // Citation, once filed with Forest Grove Municipal / Beaverton Justice Court
});

/**
 * A disclosure log entry shape — required whenever an LEU record is shared
 * outside Public Safety, since the LEU exclusion does not travel with a
 * shared copy (it becomes an education record in the recipient's hands).
 * See design doc §5.
 */
function createDisclosureLogEntry({ recordId, recordType, sharedWith, reason, sharedBy, sharedAt = new Date().toISOString() }) {
  if (!recordId || !recordType || !sharedWith || !reason || !sharedBy) {
    throw new Error('Disclosure log entries require recordId, recordType, sharedWith, reason, and sharedBy.');
  }
  return { recordId, recordType, sharedWith, reason, sharedBy, sharedAt };
}

module.exports = {
  RecordsClassification,
  createDisclosureLogEntry,
};
