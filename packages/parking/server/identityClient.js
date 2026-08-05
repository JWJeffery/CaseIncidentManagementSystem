// server/identityClient.js
//
// Server-to-server client for the Identity Service (packages/identity,
// default port 3002). Parking's own routes/vehicles.js now proxies to
// this instead of owning a local vehicles table -- this is Phase 2 of
// the identity work: parking is the first consumer, wired for VEHICLES
// only (Person wiring is separate, later work -- parking still uses
// free-text personId strings for now).
//
// Deliberately server-to-server (Node's built-in fetch), not something
// the browser calls directly -- this avoids any CORS question entirely,
// since the browser only ever talks to parking's own origin, and keeps
// parking's existing /api/vehicles URL shape stable for its frontend.
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
    // mode in development (two separate servers, easy to forget to start
    // one) -- surfaced as a clear message, not a generic network error
    // buried in a stack trace.
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
