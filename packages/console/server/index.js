// server/index.js
const express = require('express');
const path = require('path');
const { MODULES } = require('./modules');

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

// GET /api/modules -- the registry plus a live up/down check for each
// module, done server-side (not from the browser) so there's no CORS
// question and a slow/dead module doesn't hang the page itself -- each
// check has its own short timeout via AbortController, and checks run
// in parallel, not one after another.
//
// This check always uses http://localhost:PORT, and that's correct even
// though the "Open" URL the browser needs is computed completely
// differently (see public/js/app.js) -- this check runs INSIDE the same
// container/machine as every other server here, so localhost correctly
// reaches them regardless of how the browser itself is reaching this
// console (directly, or through GitHub Codespaces' port-forwarding proxy,
// or anything else). Server-side reachability and browser-facing
// navigation are two different questions with two different right
// answers -- conflating them (as an earlier version of this file did, by
// storing one baseUrl and using it for both) is exactly what broke the
// Open button in Codespaces.
async function checkStatus(port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    await fetch(`http://localhost:${port}`, { signal: controller.signal });
    return true;
  } catch (err) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

app.get('/api/modules', async (req, res) => {
  const withStatus = await Promise.all(
    MODULES.map(async (m) => ({ ...m, up: await checkStatus(m.port) }))
  );
  res.json(withStatus);
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`\n✅ FGSD Console running at http://localhost:${PORT}\n`);
});
