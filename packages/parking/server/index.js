// server/index.js
const express = require('express');
const path = require('path');
const { initDB } = require('./db');

async function start() {
  await initDB();

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api/vehicles',      require('./routes/vehicles'));
  app.use('/api/permits',       require('./routes/permits'));
  app.use('/api/applications',  require('./routes/applications'));
  app.use('/api/violationCodes',require('./routes/violationCodes'));
  app.use('/api/citations',     require('./routes/citations'));
  app.use('/api/tows',          require('./routes/tows'));
  app.use('/api/dmvQueryLog',   require('./routes/dmvQueryLog'));

  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // Safety net: catches anything a route handler didn't already wrap in
  // try/catch, so a bug in one request can't crash the whole server for
  // everyone else. (A real bug of exactly this shape -- an async handler
  // whose thrown error went unhandled and crashed the process under
  // Node 22 -- was caught during this module's initial build and fixed at
  // the route level; this middleware is defense-in-depth, not a
  // substitute for fixing handlers properly.)
  app.use((err, req, res, next) => {
    console.error('Unhandled route error:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection (server stays up):', reason);
  });

  // Different default port than case-management (3000), so both can run
  // side by side in the same Codespace without a collision.
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`\n✅ Parking / Citation System running at http://localhost:${PORT}\n`);
  });
}

start().catch(e => { console.error(e); process.exit(1); });
