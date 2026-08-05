// public/js/app.js
const root = document.getElementById('app-root');
let state = { tab: 'vehicles', vehicles: [], permits: [], permitTypes: [], violationCodes: [], citations: [], tows: [], dmvLog: [], msg: null };

async function api(path, opts) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }

async function loadAll() {
  const [vehicles, permits, permitTypes, violationCodes, citations, tows, dmvLog] = await Promise.all([
    api('/vehicles'), api('/permits'), api('/permits/types'), api('/violationCodes'), api('/citations'), api('/tows'), api('/dmvQueryLog'),
  ]);
  Object.assign(state, { vehicles, permits, permitTypes, violationCodes, citations, tows, dmvLog });
}

function badgeFor(classification) {
  if (classification === 'Education Record') return `<span class="badge education">Education Record</span>`;
  if (classification === 'Court Record') return `<span class="badge court">Court Record</span>`;
  return `<span class="badge leu">LEU-Public Safety</span>`;
}

// ── Tab renderers ──────────────────────────────────────────────────────

function renderVehicles() {
  return `
    <div class="card">
      <h2>Add Vehicle</h2>
      <form id="vehicleForm">
        <div class="form-grid">
          <div><label>Plate</label><input name="plate" required></div>
          <div><label>State</label><input name="state" value="OR"></div>
          <div><label>VIN</label><input name="vin"></div>
          <div><label>Year</label><input name="year"></div>
          <div><label>Make</label><input name="make"></div>
          <div><label>Model</label><input name="model"></div>
          <div><label>Color</label><input name="color"></div>
          <div><label>Owner Person ID</label><input name="ownerPersonId" placeholder="No shared Person store yet -- free text"></div>
          <div><label>Registered Owner Name</label><input name="ownerName" placeholder="May differ from driver -- e.g. a parent"></div>
          <div><label>Owner Relationship to Driver</label>
            <select name="ownerRelationship">
              <option value="">-- select --</option>
              <option>Self</option><option>Parent</option><option>Guardian</option><option>Other</option>
            </select>
          </div>
        </div>
        <button type="submit">Add Vehicle</button>
      </form>
    </div>
    <div class="card">
      <h2>Vehicles (${state.vehicles.length})</h2>
      <table><thead><tr><th>Plate</th><th>State</th><th>Year/Make/Model</th><th>Color</th><th>Registered Owner</th><th>Provenance</th></tr></thead>
      <tbody>${state.vehicles.map(v => `<tr>
        <td>${esc(v.plate)}</td><td>${esc(v.state)}</td><td>${esc(v.year)} ${esc(v.make)} ${esc(v.model)}</td><td>${esc(v.color)}</td>
        <td>${esc(v.ownerName)}${v.ownerRelationship ? ` (${esc(v.ownerRelationship)})` : ''}</td>
        <td>${v.dmvVerified ? 'DMV-verified' : 'Self-reported'}</td>
      </tr>`).join('') || `<tr><td colspan="6">No vehicles yet.</td></tr>`}</tbody></table>
    </div>`;
}

function renderPermits() {
  const vehicleOptions = state.vehicles.map(v => `<option value="${v.id}">${esc(v.plate)} (${esc(v.make)} ${esc(v.model)})</option>`).join('');
  const permitTypeOptions = state.permitTypes.map(t => `<option>${esc(t)}</option>`).join('');
  return `
    <div class="card">
      <h2>Issue Parking Permit</h2>
      <p style="margin-bottom:10px;color:var(--gray-4);font-size:0.85rem;">
        Fields match what Board Policy JHFD already requires the District to collect for student vehicle registration
        (valid driver's license, current registration, insurance/financial responsibility), plus standard permit
        type and lot/zone assignment.
      </p>
      <form id="permitForm">
        <div class="form-grid">
          <div><label>Person ID</label><input name="personId" required placeholder="No shared Person store yet -- free text"></div>
          <div><label>Registrant Name</label><input name="registrantName" required></div>
          <div><label>Affiliate Type</label>
            <select name="affiliateType">
              <option value="">-- select --</option>
              <option>Student</option><option>Staff</option><option>Volunteer</option><option>Other</option>
            </select>
          </div>
          <div><label>Student ID Number</label><input name="studentIdNumber"></div>
          <div><label>Employee ID Number</label><input name="employeeIdNumber"></div>
          <div><label>Vehicle</label><select name="vehicleId" required><option value="">-- select --</option>${vehicleOptions}</select></div>
          <div><label>Driver License Number</label><input name="driverLicenseNumber"></div>
          <div><label>Driver License State</label><input name="driverLicenseState" value="OR"></div>
          <div><label>Insurance Carrier</label><input name="insuranceCarrier"></div>
          <div><label>Insurance Policy Number</label><input name="insurancePolicyNumber"></div>
          <div><label>Insurance Policy Expiration</label><input name="insurancePolicyExpiration" type="date"></div>
          <div><label>Permit Type</label><select name="permitType">${permitTypeOptions}</select></div>
          <div><label>Parking Zone / Lot</label><input name="parkingZone" placeholder="e.g. Lot A - Student"></div>
          <div><label>School Site</label><input name="schoolSite"></div>
          <div><label>Ownership Info</label><input name="ownershipInfo" placeholder="Notes if vehicle isn't registrant's own"></div>
          <div><label>Expiration Date</label><input name="expirationDate" type="date"></div>
        </div>
        <button type="submit">Issue Permit</button>
      </form>
    </div>
    <div class="card">
      <h2>Permits (${state.permits.length})</h2>
      <table><thead><tr><th>Permit #</th><th>Registrant</th><th>Type</th><th>Vehicle</th><th>Zone</th><th>School</th><th>Status</th></tr></thead>
      <tbody>${state.permits.map(p => `<tr>
        <td>${esc(p.permitNumber)}</td><td>${esc(p.registrantName) || esc(p.personId)}</td>
        <td>${esc(p.permitType)}</td>
        <td>${esc((state.vehicles.find(v => v.id === p.vehicleId) || {}).plate)}</td>
        <td>${esc(p.parkingZone)}</td>
        <td>${esc(p.schoolSite)}</td><td>${esc(p.status)}</td>
      </tr>`).join('') || `<tr><td colspan="7">No permits yet.</td></tr>`}</tbody></table>
    </div>`;
}

function renderCitations() {
  const vehicleOptions = state.vehicles.map(v => `<option value="${v.id}">${esc(v.plate)}</option>`).join('');
  const codeOptions = state.violationCodes.map(c => `<option value="${c.id}">${esc(c.citation)} -- ${esc(c.shortLabel)}</option>`).join('');
  return `
    <div class="card">
      <h2>Issue Citation</h2>
      <p style="margin-bottom:10px;color:var(--gray-4);font-size:0.85rem;">
        Administrative track requires an active permit on the vehicle (ECD §5(A)). Court track requires school board adoption of proposed Board Policy ECD -- attempting a Court citation before then will be rejected by the server, not just hidden here.
      </p>
      <form id="citationForm">
        <div class="form-grid">
          <div><label>Citation Type</label><select name="citationType"><option value="Administrative">Administrative</option><option value="Court">Court</option></select></div>
          <div><label>Vehicle</label><select name="vehicleId"><option value="">-- none --</option>${vehicleOptions}</select></div>
          <div><label>Person ID</label><input name="personId" placeholder="Free text -- no shared Person store yet"></div>
          <div><label>Violation Code</label><select name="violationCodeId" required><option value="">-- select --</option>${codeOptions}</select></div>
          <div><label>Enforcement Officer ID</label><input name="enforcementOfficerId" required></div>
          <div><label>Location</label><input name="location"></div>
        </div>
        <button type="submit">Issue Citation</button>
      </form>
    </div>
    <div class="card">
      <h2>Citations (${state.citations.length})</h2>
      <table><thead><tr><th>Type</th><th>Classification</th><th>Violation</th><th>Vehicle</th><th>Status</th><th>Case #</th></tr></thead>
      <tbody>${state.citations.map(c => {
        const code = state.violationCodes.find(vc => vc.id === c.violationCodeId) || {};
        const vehicle = state.vehicles.find(v => v.id === c.vehicleId) || {};
        return `<tr>
          <td>${esc(c.citationType)}</td><td>${badgeFor(c.recordsClassification)}</td>
          <td>${esc(code.citation)}</td><td>${esc(vehicle.plate)}</td>
          <td>${esc(c.status)}</td><td>${esc(c.caseNumber) || '—'}</td>
        </tr>`;
      }).join('') || `<tr><td colspan="6">No citations yet.</td></tr>`}</tbody></table>
    </div>`;
}

function renderTows() {
  return `
    <div class="gate-notice">
      <b>Towing is disabled.</b>
      This entire subsystem is board-gated pending school board adoption of proposed Board Policy ECD (design doc §1.7 / §4.12a).
      The schema and API exist so the system is ready the day it's adopted, but every write is rejected server-side until then --
      this isn't just a UI restriction. Try the button below to see the real 403 response.
    </div>
    <div class="card">
      <h2>Attempt Test Tow (expected to fail)</h2>
      <button id="testTowBtn" class="secondary">Attempt to Create a Tow Record</button>
      <div id="towTestResult" style="margin-top:10px;"></div>
    </div>
    <div class="card">
      <h2>Tow Records (${state.tows.length})</h2>
      <p style="color:var(--gray-4);font-size:0.9rem;">Will remain empty until the board acts and this feature is enabled.</p>
    </div>`;
}

function renderDmvLog() {
  return `
    <div class="card">
      <h2>Log DMV2U Inquiry</h2>
      <p style="margin-bottom:10px;color:var(--gray-4);font-size:0.85rem;">
        Required for every DMV2U inquiry per District DMV2U Record Inquiry Account Protocol (010) §8. This log is append-only -- entries cannot be edited or deleted once created.
      </p>
      <form id="dmvForm">
        <div class="form-grid">
          <div><label>Authorized User Name</label><input name="authorizedUserName" required></div>
          <div><label>DMV2U Username</label><input name="authorizedUserDmv2uUsername" required></div>
          <div><label>Title</label><input name="authorizedUserTitle"></div>
          <div><label>Building</label><input name="authorizedUserBuilding"></div>
          <div><label>Record Identifier (plate/VIN/DL#)</label><input name="recordIdentifier" required></div>
          <div><label>Reference # (Incident/Case/Citation)</label><input name="referenceNumber"></div>
          <div><label>Permissible Purpose</label>
            <select name="permissiblePurposeCategory" required>
              <option value="">-- select --</option>
              <option>Vehicle Ownership for Parking and Traffic Enforcement</option>
              <option>Parking Citations and Vehicle Registration</option>
              <option>Driving Privilege Verification</option>
              <option>Public Safety and Emergency Response</option>
              <option>Protection of District Property</option>
              <option>Account Administration</option>
            </select>
          </div>
          <div><label>Factual Basis</label><input name="factualBasis" required></div>
        </div>
        <button type="submit">Log Inquiry</button>
      </form>
    </div>
    <div class="card">
      <h2>DMV Query Log (${state.dmvLog.length})</h2>
      <table><thead><tr><th>Date/Time</th><th>User</th><th>Record ID</th><th>Purpose</th></tr></thead>
      <tbody>${state.dmvLog.map(d => `<tr>
        <td>${esc(new Date(d.dateTime).toLocaleString())}</td><td>${esc(d.authorizedUserName)}</td>
        <td>${esc(d.recordIdentifier)}</td><td>${esc(d.permissiblePurposeCategory)}</td>
      </tr>`).join('') || `<tr><td colspan="4">No inquiries logged yet.</td></tr>`}</tbody></table>
    </div>`;
}

function renderViolationCodes() {
  return `
    <div class="card">
      <h2>Violation Code Library (${state.violationCodes.length})</h2>
      <p style="color:var(--gray-4);font-size:0.85rem;margin-bottom:10px;">Reference only, seeded from proposed Board Policy ECD §4(A)-(M) -- not editable through the app.</p>
      <table><thead><tr><th>Citation</th><th>Basis</th><th>Label</th><th>Class</th></tr></thead>
      <tbody>${state.violationCodes.map(c => `<tr>
        <td>${esc(c.citation)}</td><td>${esc(c.violationBasis)}</td><td>${esc(c.shortLabel)}</td><td>${esc(c.violationClass)}</td>
      </tr>`).join('')}</tbody></table>
    </div>`;
}

const TABS = [
  ['vehicles', 'Vehicles', renderVehicles],
  ['permits', 'Permits', renderPermits],
  ['citations', 'Citations', renderCitations],
  ['tows', 'Towing (gated)', renderTows],
  ['dmvLog', 'DMV2U Log', renderDmvLog],
  ['codes', 'Violation Codes', renderViolationCodes],
];

function render() {
  const tabButtons = TABS.map(([id, label]) => `<button class="tab-btn ${state.tab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('');
  const activeRenderer = TABS.find(([id]) => id === state.tab)[2];
  root.innerHTML = `
    <div class="tabs">${tabButtons}</div>
    ${state.msg ? `<div class="msg ${state.msg.type}">${esc(state.msg.text)}</div>` : ''}
    ${activeRenderer()}
  `;
  wireEvents();
}

function wireEvents() {
  root.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => { state.tab = btn.dataset.tab; state.msg = null; render(); };
  });

  const vehicleForm = document.getElementById('vehicleForm');
  if (vehicleForm) vehicleForm.onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(vehicleForm));
    try {
      await api('/vehicles', { method: 'POST', body: JSON.stringify(body) });
      await loadAll();
      state.msg = { type: 'success', text: 'Vehicle added.' };
    } catch (err) { state.msg = { type: 'error', text: err.message }; }
    render();
  };

  const permitForm = document.getElementById('permitForm');
  if (permitForm) permitForm.onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(permitForm));
    try {
      await api('/permits', { method: 'POST', body: JSON.stringify(body) });
      await loadAll();
      state.msg = { type: 'success', text: 'Permit issued.' };
    } catch (err) { state.msg = { type: 'error', text: err.message }; }
    render();
  };

  const citationForm = document.getElementById('citationForm');
  if (citationForm) citationForm.onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(citationForm));
    try {
      const result = await api('/citations', { method: 'POST', body: JSON.stringify(body) });
      await loadAll();
      state.msg = { type: 'success', text: `Citation issued (${result.citationType}, ${result.recordsClassification}).` };
    } catch (err) { state.msg = { type: 'error', text: err.message }; }
    render();
  };

  const dmvForm = document.getElementById('dmvForm');
  if (dmvForm) dmvForm.onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(dmvForm));
    try {
      await api('/dmvQueryLog', { method: 'POST', body: JSON.stringify(body) });
      await loadAll();
      state.msg = { type: 'success', text: 'DMV2U inquiry logged.' };
    } catch (err) { state.msg = { type: 'error', text: err.message }; }
    render();
  };

  const testTowBtn = document.getElementById('testTowBtn');
  if (testTowBtn) testTowBtn.onclick = async () => {
    const resultEl = document.getElementById('towTestResult');
    try {
      await api('/tows', { method: 'POST', body: JSON.stringify({ vehicleId: 'test', towReason: 'test' }) });
      resultEl.innerHTML = `<div class="msg error">Unexpected: tow was created. The board gate is not working -- report this.</div>`;
    } catch (err) {
      resultEl.innerHTML = `<div class="msg success">Correctly blocked: "${esc(err.message)}"</div>`;
    }
  };
}

loadAll().then(render).catch(err => {
  root.innerHTML = `<div class="msg error">Failed to load: ${esc(err.message)}</div>`;
});
