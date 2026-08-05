// public/js/pages/case-detail.js

async function renderCaseDetail(params) {
  const caseId = params.id;
  const main = document.getElementById('app-main');
  main.innerHTML = `<div class="loading">Loading case…</div>`;

  let caseData;
  try {
    caseData = await API.get(`/api/cases/${caseId}`);
  } catch (e) {
    main.innerHTML = `<p style="color:var(--red)">Case not found.</p>`;
    return;
  }

  main.innerHTML = `
    <a href="#" class="back-link" id="btn-back">← Back to Case List</a>
    <div class="page-header">
      <div>
        <div class="page-title">${esc(caseData.caseNumber)}</div>
        <div class="page-subtitle">${esc(caseData.incidentType)} — ${esc(caseData.schoolSite)}</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-warning" id="btn-gen-exclusion">Generate Exclusion Notice</button>
      </div>
    </div>

    <div id="case-detail-content">
      ${tabs([
        { id: 'summary',    label: 'Summary' },
        { id: 'people',     label: 'People' },
        { id: 'notes',      label: 'Notes / Log' },
        { id: 'violations', label: 'Violations' },
        { id: 'status',     label: 'Status / Disposition' },
        { id: 'documents',  label: 'Documents' }
      ])}
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', e => { e.preventDefault(); navigate('cases'); });
  document.getElementById('btn-gen-exclusion').addEventListener('click', () => navigate('exclusion-notice', { caseId }));
  initTabs(document.getElementById('case-detail-content'));

  renderSummaryTab(caseData);
  await renderPeopleTab(caseId);
  await renderNotesTab(caseId);
  await renderViolationsTab(caseId);
  renderStatusTab(caseData);
  await renderDocumentsTab(caseId);
}

// ── Summary ────────────────────────────────────────────────────────────────
function renderSummaryTab(c) {
  const panel = document.getElementById('tab-summary');
  panel.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Case Information</span></div>
      <div class="card-body">
        <div class="detail-meta-grid">
          <div class="meta-item"><div class="meta-label">Case Number</div><div class="meta-value" style="font-family:monospace;font-weight:bold;">${esc(c.caseNumber)}</div></div>
          <div class="meta-item"><div class="meta-label">Opened</div><div class="meta-value">${fmtDateTime(c.openedAt)}</div></div>
          <div class="meta-item"><div class="meta-label">Incident Date/Time</div><div class="meta-value">${fmtDateTime(c.incidentAt)}</div></div>
          <div class="meta-item"><div class="meta-label">School / Site</div><div class="meta-value">${esc(c.schoolSite)}</div></div>
          <div class="meta-item"><div class="meta-label">Location</div><div class="meta-value">${esc(c.location) || '—'}</div></div>
          <div class="meta-item"><div class="meta-label">Incident Type</div><div class="meta-value">${esc(c.incidentType)}</div></div>
          <div class="meta-item"><div class="meta-label">Created By</div><div class="meta-value">${esc(c.createdBy)}</div></div>
          <div class="meta-item"><div class="meta-label">Assigned To</div><div class="meta-value">${esc(c.assignedTo)}</div></div>
          <div class="meta-item"><div class="meta-label">Safety Risk</div><div class="meta-value">${riskLabel(c.safetyRiskLevel)}</div></div>
          <div class="meta-item"><div class="meta-label">Law Enforcement</div><div class="meta-value">${c.lawEnforcementInvolved ? 'Yes' : 'No'}</div></div>
          <div class="meta-item"><div class="meta-label">Status</div><div class="meta-value">${statusBadge(c.status)}</div></div>
          <div class="meta-item"><div class="meta-label">Disposition</div><div class="meta-value">${esc(c.disposition) || '—'}</div></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Initial Narrative</span></div>
      <div class="card-body">
        <p style="font-size:0.9rem;line-height:1.65;white-space:pre-wrap;">${esc(c.initialNarrative) || '<em style="color:var(--gray-3)">No narrative recorded.</em>'}</p>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Immediate Actions Taken</span></div>
      <div class="card-body">
        <p style="font-size:0.9rem;line-height:1.65;white-space:pre-wrap;">${esc(c.immediateActions) || '<em style="color:var(--gray-3)">None recorded.</em>'}</p>
      </div>
    </div>
  `;
}

// ── People ─────────────────────────────────────────────────────────────────
async function renderPeopleTab(caseId) {
  const panel = document.getElementById('tab-people');
  const persons = await API.get(`/api/persons/case/${caseId}`);

  panel.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">People Involved</span>
        <button class="btn btn-primary btn-sm" id="btn-add-person">+ Add Person</button>
      </div>
      <div class="card-body">
        <div id="persons-list">
          ${persons.length ? persons.map(p => personItem(p)).join('') : '<p style="color:var(--gray-3);font-style:italic;">No people added yet.</p>'}
        </div>
        <div id="add-person-form" style="display:none;margin-top:18px;">
          ${personForm(caseId)}
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-add-person').addEventListener('click', () => {
    const f = document.getElementById('add-person-form');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });

  bindPersonForm(caseId, panel);
  bindPersonRemove(caseId, panel);
}

function personItem(p) {
  const fullName = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');
  return `
    <div class="person-item" data-cpid="${esc(p.casepersonId)}">
      <div>
        <div class="person-name">${esc(fullName) || '<em>Unknown</em>'}</div>
        <div class="person-role">${esc(p.role)}</div>
        <div class="person-detail-line">
          ${p.personType ? esc(p.personType.replace('_',' ')) : ''}
          ${p.dob ? ' · DOB: ' + esc(p.dob) : ''}
          ${p.phone ? ' · ' + esc(p.phone) : ''}
        </div>
      </div>
      <button class="btn btn-danger btn-sm btn-remove-person" data-cpid="${esc(p.casepersonId)}">Remove</button>
    </div>
  `;
}

function personForm(caseId) {
  return `
    <div class="quick-form">
      <div class="section-divider">Add Person to Case</div>
      <div class="form-grid cols-3">
        <div class="form-group">
          <label class="form-label">Role in Case</label>
          <select id="pf-role" class="form-control">
            ${selectOpts(PERSON_ROLES, 'subject')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Person Type</label>
          <select id="pf-personType" class="form-control">
            ${selectOpts(PERSON_TYPES)}
          </select>
        </div>
      </div>
      <div class="form-grid cols-3" style="margin-top:10px;">
        <div class="form-group">
          <label class="form-label">First Name</label>
          <input type="text" id="pf-firstName" class="form-control">
        </div>
        <div class="form-group">
          <label class="form-label">Middle Name</label>
          <input type="text" id="pf-middleName" class="form-control">
        </div>
        <div class="form-group">
          <label class="form-label">Last Name</label>
          <input type="text" id="pf-lastName" class="form-control">
        </div>
        <div class="form-group">
          <label class="form-label">Aliases</label>
          <input type="text" id="pf-aliases" class="form-control">
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input type="text" id="pf-phone" class="form-control">
        </div>
        <div class="form-group">
          <label class="form-label">DOB</label>
          <input type="date" id="pf-dob" class="form-control">
        </div>
        <div class="form-group">
          <label class="form-label">ID Type</label>
          <input type="text" id="pf-idType" class="form-control" placeholder="Oregon DL, etc.">
        </div>
        <div class="form-group">
          <label class="form-label">ID Number</label>
          <input type="text" id="pf-idNumber" class="form-control">
        </div>
        <div class="form-group">
          <label class="form-label">Sex</label>
          <input type="text" id="pf-sex" class="form-control">
        </div>
        <div class="form-group">
          <label class="form-label">Race</label>
          <input type="text" id="pf-race" class="form-control">
        </div>
        <div class="form-group">
          <label class="form-label">Height</label>
          <input type="text" id="pf-height" class="form-control" placeholder='5\'10"'>
        </div>
        <div class="form-group">
          <label class="form-label">Weight</label>
          <input type="text" id="pf-weight" class="form-control" placeholder="lbs">
        </div>
        <div class="form-group">
          <label class="form-label">Hair</label>
          <input type="text" id="pf-hair" class="form-control">
        </div>
        <div class="form-group">
          <label class="form-label">Eyes</label>
          <input type="text" id="pf-eyes" class="form-control">
        </div>
      </div>
      <div class="form-group" style="margin-top:10px;">
        <label class="form-label">Address</label>
        <input type="text" id="pf-address" class="form-control">
      </div>
      <div class="form-grid cols-3" style="margin-top:10px;">
        <div class="form-group">
          <label class="form-label">City</label>
          <input type="text" id="pf-city" class="form-control" value="Forest Grove">
        </div>
        <div class="form-group">
          <label class="form-label">State</label>
          <input type="text" id="pf-state" class="form-control" value="OR">
        </div>
        <div class="form-group">
          <label class="form-label">ZIP</label>
          <input type="text" id="pf-zip" class="form-control" value="97116">
        </div>
      </div>
      <div class="form-group" style="margin-top:10px;">
        <label class="form-label">Notes</label>
        <textarea id="pf-notes" class="form-control" rows="2"></textarea>
      </div>
      <div style="margin-top:12px;display:flex;gap:10px;">
        <button class="btn btn-success" id="btn-save-person">Save Person</button>
        <button class="btn btn-secondary" id="btn-cancel-person">Cancel</button>
      </div>
    </div>
  `;
}

function bindPersonForm(caseId, panel) {
  panel.querySelector('#btn-save-person').addEventListener('click', async () => {
    const g = id => document.getElementById(id).value.trim();
    const personData = {
      personType: g('pf-personType'), firstName: g('pf-firstName'), middleName: g('pf-middleName'),
      lastName: g('pf-lastName'), aliases: g('pf-aliases'), phone: g('pf-phone'), dob: g('pf-dob'),
      idType: g('pf-idType'), idNumber: g('pf-idNumber'), sex: g('pf-sex'), race: g('pf-race'),
      height: g('pf-height'), weight: g('pf-weight'), hair: g('pf-hair'), eyes: g('pf-eyes'),
      address: g('pf-address'), city: g('pf-city'), state: g('pf-state'), zip: g('pf-zip'),
      notes: g('pf-notes')
    };
    try {
      const { id: personId } = await API.post('/api/persons', personData);
      await API.post('/api/persons/link', { caseId, personId, role: g('pf-role') });
      toast('Person added', 'success');
      await renderPeopleTab(caseId);
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    }
  });
  panel.querySelector('#btn-cancel-person').addEventListener('click', () => {
    document.getElementById('add-person-form').style.display = 'none';
  });
}

function bindPersonRemove(caseId, panel) {
  panel.querySelectorAll('.btn-remove-person').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Remove this person from the case?')) return;
      await API.delete(`/api/persons/link/${btn.dataset.cpid}`);
      toast('Person removed');
      await renderPeopleTab(caseId);
    });
  });
}

// ── Notes ──────────────────────────────────────────────────────────────────
async function renderNotesTab(caseId) {
  const panel = document.getElementById('tab-notes');
  const notes = await API.get(`/api/notes/case/${caseId}`);

  panel.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Investigation Log / Notes</span></div>
      <div class="card-body">
        <div class="quick-form" style="margin-bottom:20px;">
          <div class="section-divider">Add Note</div>
          <div class="quick-form-row">
            <div class="form-group" style="min-width:160px;">
              <label class="form-label">Note Type</label>
              <select id="note-type" class="form-control">${selectOpts(NOTE_TYPES, 'general')}</select>
            </div>
            <div class="form-group" style="min-width:160px;">
              <label class="form-label">Author</label>
              <input type="text" id="note-author" class="form-control" placeholder="Your name">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Note</label>
            <textarea id="note-body" class="form-control" rows="3" placeholder="Enter note here…"></textarea>
          </div>
          <div style="margin-top:10px;">
            <button class="btn btn-success" id="btn-save-note">Add Note</button>
          </div>
        </div>
        <div class="note-list" id="notes-list">
          ${notes.length ? notes.map(n => noteItem(n)).join('') : '<p style="color:var(--gray-3);font-style:italic;">No notes yet.</p>'}
        </div>
      </div>
    </div>
  `;

  panel.querySelector('#btn-save-note').addEventListener('click', async () => {
    const body = document.getElementById('note-body').value.trim();
    if (!body) { toast('Note cannot be empty', 'error'); return; }
    await API.post('/api/notes', {
      caseId,
      author: document.getElementById('note-author').value.trim(),
      noteType: document.getElementById('note-type').value,
      body
    });
    document.getElementById('note-body').value = '';
    toast('Note added', 'success');
    await renderNotesTab(caseId);
  });
}

function noteItem(n) {
  return `
    <div class="note-item ${esc(n.noteType)}">
      <div class="note-meta">
        <strong>${esc(n.author) || 'Unknown'}</strong>
        <span>${esc(n.noteType)}</span>
        <span>${fmtDateTime(n.createdAt)}</span>
      </div>
      <div class="note-body">${esc(n.body)}</div>
    </div>
  `;
}

// ── Violations ─────────────────────────────────────────────────────────────
async function renderViolationsTab(caseId) {
  const panel = document.getElementById('tab-violations');
  const [violations, library] = await Promise.all([
    API.get(`/api/violations/case/${caseId}`),
    API.get('/api/violations/library')
  ]);

  panel.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Violations / Findings</span></div>
      <div class="card-body">
        <div class="quick-form" style="margin-bottom:20px;">
          <div class="section-divider">Add Violation</div>
          <div class="quick-form-row">
            <div class="form-group" style="flex:2;">
              <label class="form-label">Select from KGB Policy Library</label>
              <div class="policy-picker-list" id="policy-picker">
                ${library.map(p => `
                  <div class="policy-picker-item" data-citation="${esc(p.citation)}" data-label="${esc(p.shortLabel)}" data-text="${esc(p.policyText)}">
                    <span class="cite">${esc(p.citation)}</span>
                    <span>${esc(p.shortLabel)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
          <div id="selected-policy-info" style="display:none;margin-top:12px;padding:10px;background:#f0f4ff;border-radius:3px;font-size:0.88rem;">
            <strong id="sel-citation"></strong> — <span id="sel-label"></span>
            <p id="sel-text" style="color:var(--gray-5);margin-top:4px;font-size:0.83rem;"></p>
          </div>
          <div class="form-grid" style="margin-top:12px;">
            <div class="form-group">
              <label class="form-label">Citation (editable)</label>
              <input type="text" id="viol-citation" class="form-control" placeholder="e.g. KGB-1">
            </div>
            <div class="form-group">
              <label class="form-label">Short Label</label>
              <input type="text" id="viol-label" class="form-control">
            </div>
            <div class="form-group form-full">
              <label class="form-label">Description (case-specific)</label>
              <textarea id="viol-desc" class="form-control" rows="2" placeholder="Describe how this policy was violated in this specific incident."></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Recommended Action</label>
              <input type="text" id="viol-action" class="form-control" placeholder="e.g. Exclusion from district property">
            </div>
            <div class="form-group">
              <label class="form-label">Exclusion Length</label>
              <input type="text" id="viol-length" class="form-control" placeholder="e.g. 1 year, 90 days, N/A">
            </div>
          </div>
          <div style="margin-top:12px;">
            <button class="btn btn-success" id="btn-save-violation">Add Violation</button>
          </div>
        </div>

        <div id="violations-list">
          ${violations.length ? violations.map(v => violationItem(v)).join('') : '<p style="color:var(--gray-3);font-style:italic;">No violations recorded yet.</p>'}
        </div>
      </div>
    </div>
  `;

  // Policy picker click
  panel.querySelectorAll('.policy-picker-item').forEach(item => {
    item.addEventListener('click', () => {
      panel.querySelectorAll('.policy-picker-item').forEach(i => i.style.background = '');
      item.style.background = '#dbe8ff';
      document.getElementById('viol-citation').value = item.dataset.citation;
      document.getElementById('viol-label').value = item.dataset.label;
      document.getElementById('sel-citation').textContent = item.dataset.citation;
      document.getElementById('sel-label').textContent = item.dataset.label;
      document.getElementById('sel-text').textContent = item.dataset.text;
      document.getElementById('selected-policy-info').style.display = 'block';
    });
  });

  panel.querySelector('#btn-save-violation').addEventListener('click', async () => {
    const citation = document.getElementById('viol-citation').value.trim();
    if (!citation) { toast('Select or enter a citation', 'error'); return; }
    await API.post('/api/violations', {
      caseId,
      basisType: 'KGB',
      citation,
      shortLabel: document.getElementById('viol-label').value.trim(),
      description: document.getElementById('viol-desc').value.trim(),
      recommendedAction: document.getElementById('viol-action').value.trim(),
      exclusionLength: document.getElementById('viol-length').value.trim()
    });
    toast('Violation added', 'success');
    await renderViolationsTab(caseId);
  });
}

function violationItem(v) {
  return `
    <div class="violation-item">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <span class="violation-citation">${esc(v.citation)}</span>
          <div class="violation-label">${esc(v.shortLabel)}</div>
          ${v.description ? `<div class="violation-desc">${esc(v.description)}</div>` : ''}
          <div class="violation-meta">
            ${v.recommendedAction ? `Action: ${esc(v.recommendedAction)}` : ''}
            ${v.exclusionLength ? ` &nbsp;·&nbsp; Length: <strong>${esc(v.exclusionLength)}</strong>` : ''}
          </div>
        </div>
        <button class="btn btn-danger btn-sm btn-remove-violation" data-id="${esc(v.id)}">Remove</button>
      </div>
    </div>
  `;
}

// ── Status / Disposition ───────────────────────────────────────────────────
function renderStatusTab(c) {
  const panel = document.getElementById('tab-status');
  panel.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Case Status &amp; Disposition</span></div>
      <div class="card-body">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Status</label>
            <select id="update-status" class="form-control">
              ${selectOpts(STATUSES, c.status)}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Disposition</label>
            <select id="update-disposition" class="form-control">
              ${selectOpts(DISPOSITIONS, c.disposition || '')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Assigned To</label>
            <input type="text" id="update-assigned" class="form-control" value="${esc(c.assignedTo)}">
          </div>
          <div class="form-group">
            <label class="form-label">Safety Risk Level</label>
            <select id="update-risk" class="form-control">
              ${selectOpts(['low','medium','high'], c.safetyRiskLevel)}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Law Enforcement Involved</label>
            <select id="update-leo" class="form-control">
              <option value="0" ${!c.lawEnforcementInvolved ? 'selected' : ''}>No</option>
              <option value="1" ${c.lawEnforcementInvolved ? 'selected' : ''}>Yes</option>
            </select>
          </div>
        </div>
        <div style="margin-top:16px;">
          <button class="btn btn-primary" id="btn-save-status">Save Changes</button>
        </div>
        <div id="status-saved-msg" style="display:none;color:var(--green);margin-top:10px;font-weight:bold;">✓ Saved</div>
      </div>
    </div>
  `;

  panel.querySelector('#btn-save-status').addEventListener('click', async () => {
    await API.patch(`/api/cases/${c.id}`, {
      status: document.getElementById('update-status').value,
      disposition: document.getElementById('update-disposition').value || null,
      assignedTo: document.getElementById('update-assigned').value.trim(),
      safetyRiskLevel: document.getElementById('update-risk').value,
      lawEnforcementInvolved: document.getElementById('update-leo').value === '1' ? 1 : 0
    });
    const msg = document.getElementById('status-saved-msg');
    msg.style.display = 'block';
    setTimeout(() => msg.style.display = 'none', 2500);
    toast('Case updated', 'success');
  });
}

// ── Documents ──────────────────────────────────────────────────────────────
async function renderDocumentsTab(caseId) {
  const panel = document.getElementById('tab-documents');
  const docs = await API.get(`/api/documents/case/${caseId}`);

  panel.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Generated Documents</span>
        <button class="btn btn-warning btn-sm" id="btn-gen-from-docs">Generate Exclusion Notice</button>
      </div>
      <div class="card-body">
        ${docs.length ? `
          <table class="data-table">
            <thead><tr><th>Type</th><th>Generated</th><th>By</th><th></th></tr></thead>
            <tbody>
              ${docs.map(d => `
                <tr>
                  <td>${esc(d.documentType.replace(/_/g,' '))}</td>
                  <td>${fmtDateTime(d.generatedAt)}</td>
                  <td>${esc(d.generatedBy)}</td>
                  <td><a href="/api/documents/${d.id}/html" target="_blank" class="btn btn-secondary btn-sm">View / Print</a></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<p style="color:var(--gray-3);font-style:italic;">No documents generated yet.</p>'}
      </div>
    </div>
  `;

  panel.querySelector('#btn-gen-from-docs').addEventListener('click', () => navigate('exclusion-notice', { caseId }));
}
