// packages/shared/src/caseManagementClient.js
//
// Server-to-server client for the Case Management System (packages/
// case-management, default port 3000). The mirror of identityClient.js,
// and for the same reason: a consuming module -- currently parking,
// checking whether a person is currently excluded from district property
// at citation time and on a field plate lookup -- talks to case-
// management from its OWN backend (Node's built-in fetch), never from the
// browser. That keeps each module's frontend on a single origin and takes
// CORS out of the picture entirely, exactly as the identity client does.
const CASE_MANAGEMENT_BASE_URL = process.env.CASE_MANAGEMENT_SERVICE_URL || 'http://localhost:3000';

async function caseManagementFetch(path, opts = {}) {
  let res;
  try {
    res = await fetch(`${CASE_MANAGEMENT_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
  } catch (err) {
    // Case-management being unreachable is a real, expected dev failure
    // mode (several separate servers, easy to forget to start one) --
    // surfaced as a clear message with a 503, which callers doing an
    // exclusion check treat as "check unavailable" and degrade gracefully
    // rather than blocking a citation.
    const e = new Error(`Cannot reach the Case Management System at ${CASE_MANAGEMENT_BASE_URL} -- is it running? (npm run case-management)`);
    e.statusCode = 503;
    throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || `Case Management request failed (${res.status})`);
    e.statusCode = res.status;
    throw e;
  }
  return data;
}

module.exports = { caseManagementFetch, CASE_MANAGEMENT_BASE_URL };
