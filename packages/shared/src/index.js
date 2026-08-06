// packages/shared/src/index.js
// Single entrypoint for @fgsd/shared. Consuming packages should import from
// here rather than reaching into individual files, so the public surface of
// this package stays intentional as it grows (Person schema, Import log,
// Incident, Field Contact, and the rest of the design doc's §4 entities
// will land here as each module gets built out).

const identifiers = require('./identifiers');
const recordsClassification = require('./recordsClassification');
const featureFlags = require('./featureFlags');
const identityClient = require('./identityClient');

module.exports = {
  ...identifiers,
  ...recordsClassification,
  ...featureFlags,
  ...identityClient,
};
