// server/modules.js
//
// Single source of truth for what modules exist in this monorepo and
// where to find them. The console's frontend renders from this (via
// GET /api/modules, which also attaches live up/down status) rather
// than each module being hardcoded separately in HTML somewhere -- add
// a module here and it shows up everywhere this list is used.
const MODULES = [
  {
    id: 'case-management',
    name: 'Case Management',
    description: 'Case -> Persons -> Notes -> Violations -> Documents. KGB policy library, Exclusion Notice generation, LEU/Education Record classification.',
    baseUrl: 'http://localhost:3000',
    color: '#1a2744',
  },
  {
    id: 'parking',
    name: 'Parking / Citation System',
    description: 'Vehicle permits (school-year auto-expiring), Citations (Administrative live, Court board-gated), Towing (board-gated), DMV2U query log, reporting.',
    baseUrl: 'http://localhost:3001',
    color: '#40916c',
  },
  {
    id: 'identity',
    name: 'Identity Service',
    description: 'Person / Vehicle / Location master files, NCIC/LEDS-inspired. Shared identity records other modules reference instead of duplicating.',
    baseUrl: 'http://localhost:3002',
    color: '#6b4c9a',
  },
  {
    id: 'reunification',
    name: 'Reunification',
    description: 'Claimant entry -> SIS match/approval -> reunifier handoff -> release. Standard Reunification Method workflow, client-side only.',
    baseUrl: 'http://localhost:8000',
    color: '#b5651d',
  },
];

module.exports = { MODULES };
