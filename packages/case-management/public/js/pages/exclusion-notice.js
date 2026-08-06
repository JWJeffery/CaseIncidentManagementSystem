// public/js/pages/exclusion-notice.js

async function renderExclusionNotice(params) {
  const caseId = params.caseId;
  const main = document.getElementById('app-main');
  main.innerHTML = `<div class="loading">Loading case data…</div>`;

  const [caseData, persons, violations] = await Promise.all([
    API.get(`/api/cases/${caseId}`),
    API.get(`/api/persons/case/${caseId}`),
    API.get(`/api/violations/case/${caseId}`)
  ]);

  const subjects = persons.filter(p => p.role === 'subject');

  main.innerHTML = `
    <a href="#" class="back-link" id="btn-back">← Back to Case ${esc(caseData.caseNumber)}</a>
    <div class="page-header">
      <div class="page-title">Generate Exclusion / C&amp;D Notice</div>
      <div class="page-subtitle">Case ${esc(caseData.caseNumber)} — ${esc(caseData.schoolSite)}</div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Notice Parameters</span></div>
      <div class="card-body">

        <div class="section-divider">Notice Type</div>
        <div style="display:flex;gap:20px;margin-bottom:18px;flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:8px;font-size:0.95rem;cursor:pointer;">
            <input type="radio" name="noticeType" value="exclusion" checked> Exclusion from District Property
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:0.95rem;cursor:pointer;">
            <input type="radio" name="noticeType" value="cease_desist"> Warning / Cease and Desist
          </label>
        </div>

        <div class="section-divider">Subject</div>
        <div class="form-group" style="margin-bottom:14px;">
          <label class="form-label">Select Subject Person</label>
          <select id="sel-subject" class="form-control">
            <option value="">— Select subject —</option>
            ${subjects.map(p => {
              const name = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');
              return `<option value="${esc(p.id)}">${esc(name)}</option>`;
            }).join('')}
            ${persons.filter(p => p.role !== 'subject').map(p => {
              const name = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');
              return `<option value="${esc(p.id)}">${esc(name)} (${esc(p.role)})</option>`;
            }).join('')}
          </select>
          <div style="font-size:0.78rem;color:var(--gray-4);margin-top:3px;">If no persons are listed, add them in the People tab first.</div>
        </div>

        <div class="section-divider">Violations to Include</div>
        <div id="viol-checkboxes" style="margin-bottom:14px;">
          ${violations.length ? violations.map(v => `
            <label style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px;cursor:pointer;font-size:0.9rem;">
              <input type="checkbox" name="violation" value="${esc(v.id)}" checked>
              <span><strong>${esc(v.citation)}</strong> — ${esc(v.shortLabel)}
                ${v.exclusionLength ? `<span style="color:var(--gray-4);font-size:0.8rem;"> (${esc(v.exclusionLength)})</span>` : ''}
              </span>
            </label>
          `).join('') : '<p style="color:var(--gray-3);font-style:italic;">No violations on file for this case. Add violations in the Violations tab first.</p>'}
        </div>

        <div class="section-divider">Vehicle / Other (optional)</div>
        <div class="form-grid cols-3" style="margin-bottom:8px;align-items:end;">
          <div class="form-group">
            <label class="form-label">Look up by plate</label>
            <input type="text" id="veh-lookup-plate" class="form-control" placeholder="e.g. DEMO123">
          </div>
          <div class="form-group">
            <button type="button" id="btn-veh-lookup" class="btn btn-secondary">Look Up</button>
            <span id="veh-lookup-status" style="margin-left:8px;font-size:0.85rem;color:#888;"></span>
          </div>
        </div>
        <div class="form-grid cols-3" style="margin-bottom:14px;">
          <div class="form-group">
            <label class="form-label">Vehicle Type</label>
            <input type="text" id="veh-type" class="form-control" placeholder="e.g. Auto">
          </div>
          <div class="form-group">
            <label class="form-label">Plate State</label>
            <input type="text" id="veh-state" class="form-control" placeholder="OR">
          </div>
          <div class="form-group">
            <label class="form-label">Reg / VIN / ID No.</label>
            <input type="text" id="veh-regid" class="form-control">
          </div>
          <div class="form-group form-full">
            <label class="form-label">Vehicle Description (year, make, model, color)</label>
            <input type="text" id="veh-desc" class="form-control">
          </div>
          <div class="form-group form-full">
            <label class="form-label">Other (describe any other involved items/property)</label>
            <input type="text" id="other-info" class="form-control">
          </div>
        </div>

        <div class="section-divider">Issuing Official</div>
        <div class="form-grid" style="margin-bottom:18px;">
          <div class="form-group">
            <label class="form-label">Print Name *</label>
            <input type="text" id="official-name" class="form-control">
          </div>
          <div class="form-group">
            <label class="form-label">Title</label>
            <input type="text" id="official-title" class="form-control" placeholder="e.g. Campus Supervisor">
          </div>
          <div class="form-group">
            <label class="form-label">Employee ID / DPSST</label>
            <input type="text" id="official-empid" class="form-control">
          </div>
          <div class="form-group">
            <label class="form-label">Agency</label>
            <input type="text" id="official-agency" class="form-control" value="Forest Grove School District">
          </div>
          <div class="form-group">
            <label class="form-label">Date Issued</label>
            <input type="date" id="issued-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>

        <div style="display:flex;gap:12px;">
          <button class="btn btn-warning btn-lg" id="btn-generate">Generate Notice</button>
          <button class="btn btn-secondary" id="btn-cancel">Cancel</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', e => { e.preventDefault(); navigate('case-detail', { id: caseId }); });
  document.getElementById('btn-cancel').addEventListener('click', () => navigate('case-detail', { id: caseId }));

  document.getElementById('btn-veh-lookup').addEventListener('click', async () => {
    const plate = document.getElementById('veh-lookup-plate').value.trim();
    const statusEl = document.getElementById('veh-lookup-status');
    if (!plate) { statusEl.textContent = 'Enter a plate first.'; return; }
    statusEl.textContent = 'Looking up...';
    try {
      const result = await API.get(`/api/documents/vehicle-lookup?plate=${encodeURIComponent(plate)}`);
      if (!result.found) {
        statusEl.textContent = 'No match on file -- enter details manually below.';
        return;
      }
      document.getElementById('veh-state').value = result.vehicleInfo.state;
      document.getElementById('veh-regid').value = result.vehicleInfo.regId;
      document.getElementById('veh-desc').value = result.vehicleInfo.description;
      statusEl.textContent = 'Found -- fields filled in below. Vehicle Type still needs to be set manually.';
    } catch (err) {
      statusEl.textContent = `Lookup failed: ${err.message}`;
    }
  });

  document.getElementById('btn-generate').addEventListener('click', async () => {
    const officialName = document.getElementById('official-name').value.trim();
    if (!officialName) { toast('Issuing official name is required', 'error'); return; }

    const noticeType = document.querySelector('input[name="noticeType"]:checked').value;
    const subjectPersonId = document.getElementById('sel-subject').value;
    const violationIds = [...document.querySelectorAll('input[name="violation"]:checked')].map(cb => cb.value);

    const vehicleInfo = {
      type: document.getElementById('veh-type').value,
      state: document.getElementById('veh-state').value,
      regId: document.getElementById('veh-regid').value,
      description: document.getElementById('veh-desc').value
    };

    try {
      const result = await API.post('/api/documents/generate-exclusion', {
        caseId,
        subjectPersonId: subjectPersonId || null,
        noticeType,
        issuingOfficial: officialName,
        officialTitle: document.getElementById('official-title').value,
        employeeId: document.getElementById('official-empid').value,
        agency: document.getElementById('official-agency').value,
        issuedDate: document.getElementById('issued-date').value,
        violationIds,
        vehicleInfo,
        otherInfo: document.getElementById('other-info').value
      });
      toast('Notice generated', 'success');
      // Open in new tab
      window.open(`/api/documents/${result.id}/html`, '_blank');
      setTimeout(() => navigate('case-detail', { id: caseId }), 800);
    } catch (err) {
      toast('Error generating notice: ' + err.message, 'error');
    }
  });
}
