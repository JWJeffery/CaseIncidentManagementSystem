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

  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n✅ Case Management System running at http://localhost:${PORT}\n`);
  });
}

start().catch(e => { console.error(e); process.exit(1); });
