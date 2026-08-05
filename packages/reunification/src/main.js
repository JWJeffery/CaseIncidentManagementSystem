import { students } from './students.js';
import { importCsv } from './importAdapter.js';
import { renderSrmCard } from './srmCardRenderer.js';
import {
  statuses,
  blankCard,
  canSendToReunifier,
  canCompleteRelease,
  approveMatch,
  sendToReunifier,
  completeRelease,
  rejectOrEscalate,
  resetWorkflow
} from './workflow.js';

let workingStudents = structuredClone(students);
const app = document.getElementById('app');

const labels = {
  en: ['Reunification Information','Student name','Teacher','Name of person picking up student','Grade','Relationship to student being picked up','Signature','To be completed by school personnel','Proof of ID (Type)','Confirmed emergency contact (Staff initials)','Date/Time','School Personnel Signature','Send top section with Reunifier to collect student','Person picking up student','TIME','INITIALS'],
  es: ['Información para reunificación','Nombre del estudiante','Maestro','Nombre de la persona que recoge al estudiante','Grado','Relación/parentesco con el estudiante que va a recoger','Firma','Para ser llenado por personal de la escuela','Tipo de documento/comprobante de identificación','Contacto de emergencia confirmado (iniciales del miembro del personal)','Fecha/hora','Firma del miembro del personal','Enviar la parte superior con el/la Reunificador/a para recoger al estudiante','Persona que recoge al estudiante','HORA','INICIALES']
};

// Project-wide status panel. This dashboard used to cover Reunification
// only; it now reflects the whole FGSD Public Safety RMS monorepo, since
// Reunification's app shell is where the team actually looks at it.
// Shape: [color, module, title, detail]
// Keep this in sync manually for now -- see RESUME_PROJECT_NOTE.md at the
// repo root for the authoritative project status if this drifts.
const dashboardItems = [
  // --- Reunification ---
  ['green','Reunification','Card-first workflow','Claimant manually completes the card before SIS match.'],
  ['green','Reunification','Bilingual card','English and Spanish card labels are present.'],
  ['green','Reunification','Reunifier terminology','Operational handoff uses reunifier language.'],
  ['green','Reunification','Tested workflow module','UI workflow uses the same transition module covered by automated tests (npm run reunification:test).'],
  ['yellow','Reunification','SIS import adapter','CSV import adapter is wired; real district Synergy export still needs field audit.'],
  ['yellow','Reunification','Staff verification','Review, approval, rejection, and evidence preview are present but not role-secured.'],
  ['yellow','Reunification','Name comparison','Manual evidence name entry is compared to claimant name; OCR provider is not wired.'],
  ['yellow','Reunification','Export record','JSON export exists; retention policy and server storage are not built.'],
  ['red','Reunification','Authentication','No staff login, roles, or access controls yet.'],
  ['red','Reunification','Persistent incident storage','Browser prototype does not persist incident data.'],
  ['red','Reunification','Real OCR integration','Camera capture preview exists; automated OCR is not integrated.'],
  ['red','Reunification','Mobile/PWA field workflow','Reunifier handoff is a real field-in-hand role (iPad/phone); no PWA packaging or offline support yet.'],
  ['red','Reunification','@fgsd/shared integration','No bundler in this package yet -- shared code (Person, Incident) is importable in tests but not in the live browser UI.'],

  // --- Case Management ---
  ['green','Case Management','Core schema','Case → Persons → Notes → Violations → Documents, backed by sql.js.'],
  ['green','Case Management','KGB policy library','All 26 policy entries seeded.'],
  ['green','Case Management','Exclusion Notice generation','Full exclusion and cease-and-desist notices print to PDF via browser.'],
  ['yellow','Case Management','Google SSO / auth','Deferred to v2 per original scope.'],
  ['yellow','Case Management','File/image attachments','Deferred to v2 per original scope.'],
  ['red','Case Management','Real PDF export','Currently printable HTML only, not a generated PDF file.'],
  ['red','Case Management','Audit log','Deferred to v2 per original scope.'],
  ['red','Case Management','Multi-user sessions','Deferred to v2 per original scope.'],
  ['red','Case Management','Exclusion as tracked status','Design doc §4.5b calls for live Active/Expired/Appealed tracking and a cross-module "is this person currently excluded" check -- only document generation exists today.'],
  ['red','Case Management','Referral sub-records','Design doc §4.5a -- building hand-offs from a Case are not yet a formal record.'],

  // --- Shared Platform (@fgsd/shared) ---
  ['green','Shared Platform','Monorepo structure','case-management, reunification, and shared now live in one repo with npm workspaces.'],
  ['green','Shared Platform','Incident / Case numbering','Lifetime Incident Numbers (FGSD-#######) and annual-reset Case Numbers (FGSD-YYYY-#####), per design doc §3.'],
  ['green','Shared Platform','Records classification enum','LEU / Education / Employee / Court classifications + disclosure log helper, per design doc §5.'],
  ['green','Shared Platform','Board-gated feature flags','Court-track Citation and Tow are hardcoded OFF pending actual board adoption of proposed Policy ECD.'],
  ['yellow','Shared Platform','Central counter service','Reference implementation is in-memory only; needs a real DB-backed counter before any module goes to production.'],
  ['red','Shared Platform','Person / Import shared schema','Designed in the data model doc; not yet implemented as shared code any module actually calls.'],
  ['red','Shared Platform','Cross-module Incident linkage','No module currently creates or links to a real Incident record -- each still operates independently.'],

  // --- Already Deployed / Adjacent ---
  ['green','AAR','AAR / Report of Emergency Drill form','Deployed via Google Apps Script + Sheets backend; live, in use, separate from this monorepo by design.'],

  // --- Planned Modules, Not Started ---
  ['red','Planned','Injury Report module',"Student/staff split (different legal frame -- FERPA/LEU vs. workers' comp) not started."],
  ['red','Planned','Vehicle / Parking Permit','Not started -- formalizes the current parking-permit spreadsheet.'],
  ['red','Planned','Field Contact','Not started -- lightweight record for stop-and-ID events currently untracked.'],
  ['yellow','Planned','Citation (Administrative track)','Designed (design doc §4.12); not built.'],
  ['red','Planned','Citation (Court track)','Designed; board-gated OFF pending ECD adoption (ORS 153.045 court citations).'],
  ['red','Planned','Tow subsystem','Designed (design doc §4.12a, full statutory-deadline workflow); board-gated OFF pending ECD adoption.'],

  // --- Governance / Doctrine ---
  ['green','Governance','LEU/FERPA classification framework','OAR 581-021-0225 / 34 CFR 99.8 authorization and storage-boundary rules are settled and documented.'],
  ['green','Governance','DMV2U Query Log spec','Fields sourced directly from District DMV2U Protocol (010) §8 -- not invented.'],
  ['yellow','Governance','ECD vs. JHFD scope conflict',"Administrative-citation eligibility differs between the two governing documents -- flagged, unresolved, DSC's call."],
  ['yellow','Governance','Board adoption of ECD','Proposed, not yet before the board. Timeline unknown.']
];

const state = {
  lang: 'en',
  status: statuses.CLAIMANT_ENTRY,
  studentId: '',
  contactId: '',
  query: '',
  readName: '',
  nameFlag: 'Not checked',
  previewUrl: '',
  importIssues: [],
  card: blankCard(),
  log: ['System loaded — claimant entries remain manual until staff approval.']
};

function byId(id) { return document.getElementById(id); }
function safe(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
function addLog(text) { state.log.unshift(`${new Date().toLocaleTimeString()} — ${text}`); renderLog(); }
function applyWorkflow(nextState) { Object.assign(state, nextState); }
function selectedStudent() { return workingStudents.find(s => s.id === state.studentId) || null; }
function selectedContact() { return selectedStudent()?.contacts.find(c => c.id === state.contactId) || null; }
function tokens(value) { return String(value || '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean); }

function compareNames(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.length || !b.length) return 'Name missing — staff review required';
  const setB = new Set(b);
  const hits = [...new Set(a)].filter(x => setB.has(x)).length;
  if (hits === Math.min(new Set(a).size, new Set(b).size)) return 'Name appears consistent';
  if (hits > 0) return 'Possible name variation — staff review';
  return 'Name inconsistency — staff review required';
}

function resetCard() {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  applyWorkflow(resetWorkflow(state));
  addLog('New blank card started.');
  renderShell();
}

function dashboardCounts(items = dashboardItems) {
  return items.reduce((acc, item) => { acc[item[0]] += 1; return acc; }, { green: 0, yellow: 0, red: 0 });
}

function dashboardIcon(color) { return color === 'green' ? '🟩' : color === 'yellow' ? '🟨' : '🟥'; }

// Preserve first-seen module order (Reunification, Case Management, Shared
// Platform, AAR, Planned, Governance) rather than alphabetizing, so the
// dashboard reads roughly in the order the project itself grew.
function dashboardModules() {
  const seen = [];
  for (const [, module] of dashboardItems) {
    if (!seen.includes(module)) seen.push(module);
  }
  return seen;
}

function renderDashboard() {
  const overall = dashboardCounts();
  const activeGate = "Active gate: resolve the reunification browser-bundler question and the ECD/JHFD administrative-citation scope conflict -- both are blocking downstream work and are the DSC's call, not a build task.";
  const modules = dashboardModules();
  const moduleSections = modules.map(module => {
    const items = dashboardItems.filter(([, m]) => m === module);
    const counts = dashboardCounts(items);
    return `<details class="dashModule" open><summary><b>${safe(module)}</b> <span class="dashModuleCounts">🟩 ${counts.green} · 🟨 ${counts.yellow} · 🟥 ${counts.red}</span></summary><div class="dashGrid">${items.map(([color,,title,detail]) => `<article class="dashCard ${color}"><h3>${dashboardIcon(color)} ${safe(title)}</h3><p>${safe(detail)}</p></article>`).join('')}</div></details>`;
  }).join('');
  return `<section class="box dashboard"><h2>Project Dashboard</h2><p>Whole-system status across the FGSD Public Safety RMS monorepo (Reunification, Case Management, shared platform, planned modules, and governance) -- not Reunification alone. Green = audited/verified/closed. Yellow = present but unaudited or incomplete. Red = not started or blocked.</p><div class="dashCounts"><b class="green">🟩 ${overall.green} Green</b><b class="yellow">🟨 ${overall.yellow} Yellow</b><b class="red">🟥 ${overall.red} Red</b></div><p class="warn">${safe(activeGate)}</p>${moduleSections}</section>`;
}

function renderImportPanel() {
  return `<details class="import-details"><summary>SIS Import Adapter / Admin Testing</summary><section class="box"><p>Paste or upload a CSV export. Imported rows replace the current working set for this browser session only.</p><input id="csvFile" type="file" accept=".csv,text/csv"><textarea id="csvText" rows="6" placeholder="Paste CSV here"></textarea><div class="toolbar"><button id="runCsvImport">Import CSV into Working Set</button><button id="resetSample">Reset Sample Data</button></div><p><b>Current working set:</b> ${workingStudents.length} students</p>${state.importIssues.map(issue => `<p class="warn">${safe(issue)}</p>`).join('')}</section></details>`;
}

function bindCard() {
  document.querySelectorAll('[data-card]').forEach(input => {
    input.oninput = event => { state.card[input.dataset.card] = event.target.value; };
  });
}

function renderCard() {
  byId('card').innerHTML = renderSrmCard(state, labels[state.lang], safe);
  bindCard();
}

function renderStaff() {
  const q = (state.query || state.card.student).toLowerCase().trim();
  const matches = workingStudents.filter(s => !q || [s.name, s.id, s.grade, s.teacher, s.school].join(' ').toLowerCase().includes(q));
  const student = selectedStudent();
  const contacts = student ? student.contacts.filter(c => c.release) : [];
  if (!state.contactId && contacts[0]) state.contactId = contacts[0].id;

  byId('staffPanel').innerHTML = `<h2>Staff Verification</h2><p>Staff reviews the manual card, captures evidence, compares the read name, selects the SIS record, and approves or rejects the match.</p><div class="staff-grid"><article class="step-card"><h3>1. Evidence and Name Check</h3><input id="evidence" type="file" accept="image/*"><div>${state.previewUrl ? `<img class="idpreview" src="${state.previewUrl}">` : '<small>Evidence preview is browser-memory only.</small>'}</div><label class="line"><span>Name read from evidence</span><input id="readName" value="${safe(state.readName)}"></label><button id="compare">Compare Name</button><p id="flag" class="flag warn">${safe(state.nameFlag)}</p></article><article class="step-card"><h3>2. SIS Match and Contact</h3><label class="line"><span>Search SIS records</span><input id="search" value="${safe(state.query)}"></label>${matches.map(s => `<button class="match ${s.id === state.studentId ? 'active' : ''}" data-student="${safe(s.id)}">${safe(s.name)} · Grade ${safe(s.grade)} · ${safe(s.teacher)}</button>`).join('')}<label class="line"><span>Authorized release contact</span><select id="contactSelect">${contacts.map(c => `<option value="${safe(c.id)}" ${c.id === state.contactId ? 'selected' : ''}>${safe(c.name)} · ${safe(c.relation)}</option>`).join('')}</select></label><div class="toolbar"><button id="approve">Approve SIS Match</button><button id="reject">Reject / Escalate</button><button id="export">Export Record</button></div></article></div>`;
  bindStaff();
}

function renderQueuePanel() {
  const s = selectedStudent();
  const c = selectedContact();
  return `<section class="box"><h2>Reunifier Queue</h2><div class="queue-state"><p><b>Current queue state:</b> ${safe(state.status)}</p><p>${s && c ? `${safe(s.name)} / ${safe(c.name)}` : 'No approved SIS match selected.'}</p></div><div class="queue-actions"><button id="send" ${canSendToReunifier(state.status) ? '' : 'disabled'}>Send to Reunifier</button><button id="release" ${canCompleteRelease(state.status) ? '' : 'disabled'}>Complete Release</button></div></section>`;
}

function renderLog() {
  const log = byId('log');
  if (log) log.innerHTML = state.log.map(item => `<p class="rec">${safe(item)}</p>`).join('');
}

function renderShell() {
  app.innerHTML = `<header class="app-header"><div><h1>District Reunification Application</h1><p>The Reunification Card is the check-in and verification workflow. Claimant entries stay manual until staff approval.</p></div><div class="status-pill">${safe(state.status)}</div></header>${renderDashboard()}${renderImportPanel()}<section class="box"><h2>Reunification Card</h2><div class="toolbar"><button id="en">English</button><button id="es">Español</button><button id="newCard">New Card</button></div><div id="card"></div></section><section id="staffPanel" class="box"></section>${renderQueuePanel()}<section class="box"><h2>Audit Log</h2><div id="log"></div></section>`;
  bindImportPanel();
  byId('en').onclick = () => { state.lang = 'en'; renderCard(); };
  byId('es').onclick = () => { state.lang = 'es'; renderCard(); };
  byId('newCard').onclick = resetCard;
  byId('send').onclick = () => { try { applyWorkflow(sendToReunifier(state)); addLog('Approved card sent to reunifier.'); renderShell(); } catch (error) { addLog(error.message); } };
  byId('release').onclick = () => { try { applyWorkflow(completeRelease(state, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))); addLog('Release completed.'); renderShell(); } catch (error) { addLog(error.message); } };
  renderCard();
  renderStaff();
  renderLog();
}

function bindImportPanel() {
  byId('csvFile').onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    byId('csvText').value = await file.text();
  };
  byId('runCsvImport').onclick = () => {
    const result = importCsv(byId('csvText').value);
    if (!result.students.length) {
      state.importIssues = result.issues;
      addLog('CSV import failed: no student rows imported.');
      renderShell();
      return;
    }
    workingStudents = result.students;
    state.studentId = '';
    state.contactId = '';
    state.importIssues = result.issues;
    addLog(`CSV import completed: ${workingStudents.length} students loaded.`);
    renderShell();
  };
  byId('resetSample').onclick = () => {
    workingStudents = structuredClone(students);
    state.studentId = '';
    state.contactId = '';
    state.importIssues = [];
    addLog('Sample data restored.');
    renderShell();
  };
}

function bindStaff() {
  byId('evidence').onchange = event => {
    const file = event.target.files[0];
    if (!file) return;
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(file);
    addLog('Evidence captured in browser memory.');
    renderStaff();
  };
  byId('readName').oninput = event => { state.readName = event.target.value; };
  byId('compare').onclick = () => { state.nameFlag = compareNames(state.card.pickup, state.readName); addLog(state.nameFlag); renderStaff(); };
  byId('search').oninput = event => { state.query = event.target.value; renderStaff(); };
  document.querySelectorAll('[data-student]').forEach(button => button.onclick = () => { state.studentId = button.dataset.student; state.contactId = ''; renderStaff(); });
  byId('contactSelect').onchange = event => { state.contactId = event.target.value; };
  byId('approve').onclick = () => {
    const s = selectedStudent();
    const c = selectedContact();
    try {
      applyWorkflow(approveMatch(state, s, c));
      addLog(`Card approved: ${state.card.student || 'card'} matched to ${s.name} / ${c.name}.`);
      renderShell();
    } catch (error) { addLog(error.message); }
  };
  byId('reject').onclick = () => { applyWorkflow(rejectOrEscalate(state)); addLog('Card rejected or escalated.'); renderShell(); };
  byId('export').onclick = exportRecord;
}

function exportRecord() {
  const record = {
    status: state.status,
    claimant: { student: state.card.student, teacher: state.card.teacher, pickup: state.card.pickup, grade: state.card.grade, relation: state.card.relation },
    staff: { proof: state.card.proof, confirmed: state.card.confirmed, dateTime: state.card.datetime, signature: state.card.staffsig, nameFlag: state.nameFlag },
    release: { student: state.card.releaseStudent, teacher: state.card.releaseTeacher, pickup: state.card.releasePerson, grade: state.card.releaseGrade, time: state.card.releaseTime, initials: state.card.releaseInitials },
    match: { student: selectedStudent(), contact: selectedContact() },
    dashboard: dashboardItems,
    importIssues: state.importIssues,
    log: state.log.slice(0, 10)
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'reunification-card-record.json';
  link.click();
  URL.revokeObjectURL(url);
  addLog('Record exported.');
}

renderShell();
