# FGSD Case Management System

Forest Grove School District — Incident / Case Management System v1

## Codespaces / Local Startup

```bash
# 1. Install dependencies
npm install

# 2. Seed the database (run once, or to reset demo data)
npm run seed

# 3. Start the server
npm start
```

Open: http://localhost:3000

If running in Codespaces, use the forwarded port URL shown in the Ports panel.

## What's implemented

- Case List with search and status filter
- Create Case (auto-numbered, all required fields)
- Case Detail with tabs:
  - Summary
  - People (add/remove persons with full descriptor fields)
  - Notes / Investigation Log (typed, color-coded by type)
  - Violations / Findings (KGB policy picker with all 26 entries)
  - Status / Disposition (live update)
  - Documents (view generated notices)
- Generate Exclusion Notice (full exclusion or C&D, prints to PDF via browser)
- KGB policy library seeded with all 26 items
- 3 demo cases with persons, notes, violations pre-loaded

## Deferred (v2)

- Google SSO / authentication
- File/image attachments
- PDF export (currently printable HTML)
- Email notifications
- Audit log
- Multi-user sessions
