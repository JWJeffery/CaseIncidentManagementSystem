// server/routes/identityPersons.js
//
// Thin, read-only proxy to the Identity Service's Person search --
// backs the optional "Link to Identity Person" control on Citations,
// direct Permit issuance, and Application review. Never used to create
// or auto-resolve anyone; per the settled Person-linkage policy
// (RESUME_PROJECT_NOTE.md), linking is always a deliberate staff choice
// from real search results, never a side effect of submitting a form.
const express = require('express');
const router = express.Router();
const { identityFetch } = require('@fgsd/shared');

// GET /api/identityPersons/search?q=
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const results = await identityFetch(`/api/persons?search=${encodeURIComponent(q)}`);
    // Flattened to just what a picker UI needs -- name, DOB, type -- not
    // the full biographic record.
    res.json(results.map(p => ({
      id: p.id,
      name: `${p.lastName}, ${p.firstName}${p.middleName ? ' ' + p.middleName : ''}`,
      dob: p.dob,
      personType: p.personType,
    })));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET /api/identityPersons/:id -- resolve a linked id back to a display name
router.get('/:id', async (req, res) => {
  try {
    const p = await identityFetch(`/api/persons/${req.params.id}`);
    res.json({
      id: p.id,
      name: `${p.lastName}, ${p.firstName}${p.middleName ? ' ' + p.middleName : ''}`,
      dob: p.dob,
      personType: p.personType,
    });
  } catch (err) {
    res.status(err.statusCode || 404).json({ error: err.message });
  }
});

module.exports = router;
