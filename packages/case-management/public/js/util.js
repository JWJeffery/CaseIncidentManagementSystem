// public/js/util.js

function toast(msg, type = 'default') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function statusBadge(status) {
  const map = {
    'Draft': 'draft',
    'Open': 'open',
    'Under Review': 'under-review',
    'Under Investigation': 'investigating',
    'Pending Action': 'pending',
    'Action Issued': 'action',
    'Closed': 'closed'
  };
  const cls = map[status] || 'draft';
  return `<span class="badge badge-${cls}">${status || 'Draft'}</span>`;
}

function riskLabel(level) {
  if (!level) return '';
  return `<span class="risk-${level.toLowerCase()}">${level.charAt(0).toUpperCase() + level.slice(1)}</span>`;
}

function fmtDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STATUSES = ['Draft', 'Open', 'Under Review', 'Under Investigation', 'Pending Action', 'Action Issued', 'Closed'];
const DISPOSITIONS = ['', 'No Action', 'Warning / Cease and Desist', 'Exclusion', 'Referred to Law Enforcement', 'Administrative Follow-Up', 'Closed with Documentation'];
const INCIDENT_TYPES = ['Threatening Behavior', 'Trespassing / Loitering', 'Disruptive Behavior', 'Assault / Battery', 'Weapons', 'Drugs / Alcohol', 'Vandalism / Property Damage', 'Gang Activity', 'Harassment / Bullying', 'Unauthorized Presence', 'False Emergency Report', 'Other'];
const SCHOOLS = [
  'District Office', 'Taylor Way Annex', 'Cornelius Elementary School',
  'Dilley Elementary School', 'Echo Shaw Elementary School', 'Fern Hill Elementary School',
  'Forest Grove Community School', 'Harvey Clarke Elementary School', 'Joseph Gale Elementary School',
  'Tom McCall Upper Elementary School', 'Neil Armstrong Middle School', 'Forest Grove High School',
  'Oak Grove Academy', 'Tuality Plains High School', 'Other'
];
const NOTE_TYPES = ['general', 'incident', 'investigation', 'witness', 'admin', 'closure'];
const PERSON_TYPES = ['student', 'staff', 'parent_guardian', 'visitor', 'outsider', 'unknown', 'other'];
const PERSON_ROLES = ['subject', 'victim', 'witness', 'reporting_party', 'investigator', 'other'];

function selectOpts(arr, selected = '') {
  return arr.map(v => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v) || '— None —'}</option>`).join('');
}

function tabs(items) {
  return `
    <div class="tabs">
      ${items.map((t, i) => `<button class="tab-btn${i === 0 ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
    </div>
    ${items.map((t, i) => `<div class="tab-panel${i === 0 ? ' active' : ''}" id="tab-${t.id}">${t.content}</div>`).join('')}
  `;
}

function initTabs(container) {
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      container.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      container.querySelector(`#tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}
