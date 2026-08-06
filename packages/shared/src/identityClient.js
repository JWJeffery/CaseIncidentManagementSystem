// packages/shared/src/identityClient.js
//
// Server-to-server client for the Identity Service (packages/identity,
// default port 3002). Originally written inside packages/parking as
// parking-specific code; moved here once case-management needed the
// same thing, rather than maintaining two copies of an identical fetch
// wrapper -- the same anti-duplication principle this whole project has
// applied to documents and identity data now applied to this bit of
// client code too.
//
// Deliberately server-to-server (Node's built-in fetch), not something
// the browser calls directly -- this avoids any CORS question entirely,
// since the browser only ever talks to its own module's origin, and
// keeps each consuming module's own API URL shape stable for its
// frontend regardless of what's happening behind it.
const IDENTITY_BASE_URL = process.env.IDENTITY_SERVICE_URL || 'http://localhost:3002';

async function identityFetch(path, opts = {}) {
  let res;
  try {
    res = await fetch(`${IDENTITY_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
  } catch (err) {
    // The identity service being unreachable is a real, expected failure
    // mode in development (multiple separate servers, easy to forget to
    // start one) -- surfaced as a clear message, not a generic network
    // error buried in a stack trace.
    const e = new Error(`Cannot reach the Identity Service at ${IDENTITY_BASE_URL} -- is it running? (npm run identity)`);
    e.statusCode = 503;
    throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || `Identity Service request failed (${res.status})`);
    e.statusCode = res.status;
    throw e;
  }
  return data;
}

module.exports = { identityFetch, IDENTITY_BASE_URL };
