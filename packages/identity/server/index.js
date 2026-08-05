// server/index.js
const express = require('express');
const path = require('path');
const { initDB } = require('./db');

async function start() {
  await initDB();

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api/persons',   require('./routes/persons'));
  app.use('/api/vehicles',  require('./routes/vehicles'));
  app.use('/api/locations', require('./routes/locations'));

  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  app.use((err, req, res, next) => {
    console.error('Unhandled route error:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection (server stays up):', reason);
  });

  // Different default port than case-management (3000) and parking
  // (3001), so all three can run side by side in the same Codespace.
  const PORT = process.env.PORT || 3002;
  app.listen(PORT, () => {
    console.log(`\n✅ Identity Service running at http://localhost:${PORT}\n`);
  });
}

start().catch(e => { console.error(e); process.exit(1); });
