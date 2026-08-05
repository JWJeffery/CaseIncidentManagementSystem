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

const dashboardItems = [
  ['green','Card-first workflow','Claimant manually completes the card before SIS match.'],
  ['green','Bilingual card','English and Spanish card labels are present.'],
  ['green','Reunifier terminology','Operational handoff uses reunifier language.'],
  ['green','Tested workflow module','UI workflow now uses the same transition module covered by automated tests.'],
  ['yellow','SIS import adapter','CSV import adapter is wired; real district export still needs field audit.'],
  ['yellow','Staff verification','Review, approval, rejection, and evidence preview are present but not role-secured.'],
  ['yellow','Name comparison','Manual evidence name entry is compared to claimant name; OCR provider is not wired.'],
  ['yellow','Export record','JSON export exists; retention policy and server storage are not built.'],
  ['red','Authentication','No staff login, roles, or access controls yet.'],
  ['red','Persistent incident storage','Browser prototype does not persist incident data.'],
  ['red','Real OCR integration','Camera capture preview exists; automated OCR is not integrated.']
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

function dashboardCounts() {
  return dashboardItems.reduce((acc, item) => { acc[item[0]] += 1; return acc; }, { green: 0, yellow: 0, red: 0 });
}

function renderDashboard() {
  const counts = dashboardCounts();
  const activeGate = 'Active gate: audit a real district SIS export against the CSV import adapter, then replace manual evidence-name entry with OCR.';
  return `<section class="box dashboard"><h2>Project Dashboard</h2><p>Green = audited/verified/closed. Yellow = present but unaudited or incomplete. Red = not started or blocked.</p><div class="dashCounts"><b class="green">🟩 ${counts.green} Green</b><b class="yellow">🟨 ${counts.yellow} Yellow</b><b class="red">🟥 ${counts.red} Red</b></div><p class="warn">${safe(activeGate)}</p><div class="dashGrid">${dashboardItems.map(([color,title,detail]) => `<article class="dashCard ${color}"><h3>${color === 'green' ? '🟩' : color === 'yellow' ? '🟨' : '🟥'} ${safe(title)}</h3><p>${safe(detail)}</p></article>`).join('')}</div></section>`;
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
