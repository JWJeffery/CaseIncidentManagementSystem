// public/js/pages/case-create.js

async function renderCaseCreate() {
  const main = document.getElementById('app-main');
  main.innerHTML = `
    <a href="#" class="back-link" id="btn-back">← Back to Case List</a>
    <div class="page-header">
      <div class="page-title">Create New Case</div>
    </div>
    <div class="card">
      <div class="card-body">
        <form id="create-case-form" autocomplete="off">

          <div class="section-divider">Case Details</div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Incident Date / Time *</label>
              <input type="datetime-local" name="incidentAt" class="form-control" required>
            </div>
            <div class="form-group">
              <label class="form-label">Status</label>
              <select name="status" class="form-control">
                ${selectOpts(STATUSES, 'Open')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">School / Site *</label>
              <select name="schoolSite" class="form-control" required>
                <option value="">— Select —</option>
                ${selectOpts(SCHOOLS)}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Specific Location</label>
              <input type="text" name="location" class="form-control" placeholder="e.g. Main Parking Lot, Gymnasium">
            </div>
            <div class="form-group">
              <label class="form-label">Incident Type *</label>
              <select name="incidentType" class="form-control" required>
                <option value="">— Select —</option>
                ${selectOpts(INCIDENT_TYPES)}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Safety Risk Level</label>
              <select name="safetyRiskLevel" class="form-control">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Created By</label>
              <input type="text" name="createdBy" class="form-control" placeholder="Your name">
            </div>
            <div class="form-group">
              <label class="form-label">Assigned To</label>
              <input type="text" name="assignedTo" class="form-control" placeholder="Staff name">
            </div>
            <div class="form-group">
              <label class="form-label">Law Enforcement Involved?</label>
              <select name="lawEnforcementInvolved" class="form-control">
                <option value="0">No</option>
                <option value="1">Yes</option>
              </select>
            </div>
          </div>

          <div class="section-divider" style="margin-top:18px;">Narrative</div>
          <div class="form-group form-full" style="margin-bottom:14px;">
            <label class="form-label">Initial Incident Narrative *</label>
            <textarea name="initialNarrative" class="form-control" rows="5" required placeholder="Describe what happened, who was involved, and how it was observed or reported."></textarea>
          </div>
          <div class="form-group form-full">
            <label class="form-label">Immediate Actions Taken</label>
            <textarea name="immediateActions" class="form-control" rows="3" placeholder="What was done on-scene or immediately after the incident?"></textarea>
          </div>

          <div style="margin-top:22px; display:flex; gap:12px;">
            <button type="submit" class="btn btn-primary btn-lg">Create Case</button>
            <button type="button" class="btn btn-secondary" id="btn-cancel">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', e => { e.preventDefault(); navigate('cases'); });
  document.getElementById('btn-cancel').addEventListener('click', () => navigate('cases'));

  document.getElementById('create-case-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    data.lawEnforcementInvolved = data.lawEnforcementInvolved === '1';
    try {
      const { id, caseNumber } = await API.post('/api/cases', data);
      toast(`Case ${caseNumber} created`, 'success');
      navigate('case-detail', { id });
    } catch (err) {
      toast('Error creating case: ' + err.message, 'error');
    }
  });
}
