// server/index.js
const express = require('express');
const path = require('path');
const { initDB } = require('./db');

async function start() {
  await initDB();

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api/cases',     require('./routes/cases'));
  app.use('/api/persons',   require('./routes/persons'));
  app.use('/api/notes',     require('./routes/notes'));
  app.use('/api/violations',require('./routes/violations'));
  app.use('/api/documents', require('./routes/documents'));
  app.use('/api/exclusions', require('./routes/exclusions'));

  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // Safety net added when the first async route (documents.js's
  // generate-exclusion and vehicle-lookup, both calling out to the
  // Identity Service) landed in this package -- an async Express handler
  // with an uncaught throw becomes an unhandled promise rejection, which
  // crashes the whole Node process under Node 22, not just the one
  // request. Every async route here has its own try/catch too; this is
  // defense in depth, matching the same fix already made in
  // packages/parking after the same failure mode was caught there first.
  app.use((err, req, res, next) => {
    console.error('Unhandled route error:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection (server stays up):', reason);
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n✅ Case Management System running at http://localhost:${PORT}\n`);
  });
}

start().catch(e => { console.error(e); process.exit(1); });
