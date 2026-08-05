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
async function checkStatus(baseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    await fetch(baseUrl, { signal: controller.signal });
    return true;
  } catch (err) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

app.get('/api/modules', async (req, res) => {
  const withStatus = await Promise.all(
    MODULES.map(async (m) => ({ ...m, up: await checkStatus(m.baseUrl) }))
  );
  res.json(withStatus);
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`\n✅ FGSD Console running at http://localhost:${PORT}\n`);
});
