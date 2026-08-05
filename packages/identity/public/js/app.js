// public/js/app.js
const root = document.getElementById('app-root');
let state = {
  tab: 'persons',
  persons: [], vehicles: [], locations: [],
  personTypes: [], identifierTypes: [], aliasTypes: [], locationTypes: [],
  personSearch: '', vehicleSearch: '',
  selectedPersonId: null, selectedVehicleId: null,
  personDetail: null, vehicleDetail: null,
  msg: null, _focusId: null, _focusPos: null,
};

async function api(path, opts) {
  const res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }

async function loadAll() {
  const [persons, vehicles, locations, personMeta, locationTypes] = await Promise.all([
    api('/persons'), api('/vehicles'), api('/locations'), api('/persons/types'), api('/locations/types'),
  ]);
  Object.assign(state, {
    persons, vehicles, locations,
    personTypes: personMeta.personTypes, identifierTypes: personMeta.identifierTypes, aliasTypes: personMeta.aliasTypes,
    locationTypes,
  });
}

function locationName(id) {
  const l = state.locations.find(l => l.id === id);
  return l ? l.name : '—';
}

function wireLiveSearch(inputId, onChange) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.oninput = () => {
    onChange(el.value);
    state._focusId = inputId;
    state._focusPos = el.selectionStart;
    render();
  };
}

// ── Persons ──────────────────────────────────────────────────────────

function filteredPersons() {
  const q = state.personSearch.trim().toLowerCase();
  if (!q) return state.persons;
  return state.persons.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q));
}

function renderPersons() {
  const filtered = filteredPersons();
  const locOptions = state.locations.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
  return `
    <div class="card">
      <h2>Add Person</h2>
      <form id="personForm">
        <div class="form-grid">
          <div><label>Last Name</label><input name="lastName" required></div>
          <div><label>First Name</label><input name="firstName" required></div>
          <div><label>Middle Name</label><input name="middleName"></div>
          <div><label>Person Type</label><select name="personType">${state.personTypes.map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
          <div><label>Primary School Site</label><select name="primarySchoolSite"><option value="">-- none --</option>${locOptions}</select></div>
          <div><label>Date of Birth</label><input name="dob" type="date"></div>
          <div><label>Sex</label><input name="sex" placeholder="e.g. M/F"></div>
          <div><label>Race</label><input name="race"></div>
          <div><label>Height</label><input name="height" placeholder="e.g. 5-08"></div>
          <div><label>Weight</label><input name="weight"></div>
          <div><label>Hair Color</label><input name="hairColor"></div>
          <div><label>Eye Color</label><input name="eyeColor"></div>
          <div><label>Synergy Import ID (optional)</label><input name="synergyImportId"></div>
        </div>
        <button type="submit">Add Person</button>
      </form>
    </div>
    <div class="card">
      <h2>Persons (${filtered.length}${filtered.length !== state.persons.length ? ` of ${state.persons.length}` : ''})</h2>
      <div class="form-grid" style="margin-bottom:10px;">
        <div><label>Search (name)</label><input id="personSearchInput" value="${esc(state.personSearch)}" placeholder="e.g. Jamie or Demo"></div>
      </div>
      <table><thead><tr><th>Name</th><th>Type</th><th>School Site</th><th>DOB</th></tr></thead>
      <tbody>${filtered.map(p => `<tr class="clickableRow" data-person="${p.id}" style="cursor:pointer;">
        <td>${esc(p.lastName)}, ${esc(p.firstName)} ${esc(p.middleName)}</td>
        <td>${esc(p.personType)}</td><td>${esc(locationName(p.primarySchoolSite))}</td><td>${esc(p.dob)}</td>
      </tr>`).join('') || `<tr><td colspan="4">${state.persons.length ? 'No persons match your search.' : 'No persons on file yet.'}</td></tr>`}</tbody></table>
    </div>
    ${state.selectedPersonId ? renderPersonDetail() : ''}
  `;
}

function renderPersonDetail() {
  const d = state.personDetail;
  if (!d) return `<div class="card"><p>Loading...</p></div>`;
  return `
    <div class="card" style="border:2px solid var(--navy);">
      <h2>File: ${esc(d.lastName)}, ${esc(d.firstName)} ${esc(d.middleName)}</h2>
      <table>
        <tr><th>Type</th><td>${esc(d.personType)}</td></tr>
        <tr><th>DOB</th><td>${esc(d.dob)}</td></tr>
        <tr><th>Sex / Race</th><td>${esc(d.sex)} / ${esc(d.race)}</td></tr>
        <tr><th>Height / Weight</th><td>${esc(d.height)} / ${esc(d.weight)}</td></tr>
        <tr><th>Hair / Eyes</th><td>${esc(d.hairColor)} / ${esc(d.eyeColor)}</td></tr>
        <tr><th>School Site</th><td>${esc(locationName(d.primarySchoolSite))}</td></tr>
        ${d.synergyImportId ? `<tr><th>Synergy Import ID</th><td>${esc(d.synergyImportId)} (as of ${esc(d.importedAt)})</td></tr>` : ''}
      </table>

      <h3 style="margin-top:14px;font-size:0.95rem;">Aliases</h3>
      <table><thead><tr><th>Name</th><th>Type</th></tr></thead>
      <tbody>${d.aliases.map(a => `<tr><td>${esc(a.aliasName)}</td><td>${esc(a.aliasType)}</td></tr>`).join('') || '<tr><td colspan="2">None on file.</td></tr>'}</tbody></table>
      <form id="aliasForm" data-person="${d.id}" style="margin-top:8px;display:flex;gap:6px;">
        <input name="aliasName" placeholder="Alias name" required>
        <select name="aliasType">${state.aliasTypes.map(t => `<option>${esc(t)}</option>`).join('')}</select>
        <button type="submit" class="secondary">Add Alias</button>
      </form>

      <h3 style="margin-top:14px;font-size:0.95rem;">Identifiers</h3>
      <table><thead><tr><th>Type</th><th>Value</th><th>State</th><th>Verified</th></tr></thead>
      <tbody>${d.identifiers.map(i => `<tr>
        <td>${esc(i.identifierType)}</td><td>${esc(i.identifierValue)}</td><td>${esc(i.issuingState)}</td>
        <td>${i.verified ? `Yes (${esc(i.verifiedBy)})` : `<button class="verifyIdBtn secondary" data-person="${d.id}" data-identifier="${i.id}" style="font-size:0.75rem;padding:2px 8px;">Mark Verified</button>`}</td>
      </tr>`).join('') || '<tr><td colspan="4">None on file.</td></tr>'}</tbody></table>
      <form id="identifierForm" data-person="${d.id}" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
        <select name="identifierType">${state.identifierTypes.map(t => `<option>${esc(t)}</option>`).join('')}</select>
        <input name="identifierValue" placeholder="Value" required>
        <input name="issuingState" placeholder="State (if applicable)" style="width:100px;">
        <button type="submit" class="secondary">Add Identifier</button>
      </form>
    </div>`;
}

// ── Vehicles ─────────────────────────────────────────────────────────

function filteredVehicles() {
  const q = state.vehicleSearch.trim().toLowerCase();
  if (!q) return state.vehicles;
  return state.vehicles.filter(v => (v.vin || '').toLowerCase().includes(q));
}

function renderVehicles() {
  const filtered = filteredVehicles();
  const personOptions = state.persons.map(p => `<option value="${p.id}">${esc(p.lastName)}, ${esc(p.firstName)}</option>`).join('');
  return `
    <div class="card">
      <h2>Add Vehicle</h2>
      <p style="color:var(--gray-4);font-size:0.85rem;margin-bottom:10px;">Anchored on VIN, not plate -- plate/state and owner are tracked as separate history below, not overwritten on change.</p>
      <form id="vehicleForm">
        <div class="form-grid">
          <div><label>VIN</label><input name="vin"></div>
          <div><label>Make</label><input name="make"></div>
          <div><label>Model</label><input name="model"></div>
          <div><label>Year</label><input name="year"></div>
          <div><label>Color</label><input name="color"></div>
          <div><label>Initial Plate</label><input name="plate"></div>
          <div><label>Plate State</label><input name="state" value="OR"></div>
          <div><label>Initial Owner</label><select name="ownerPersonId"><option value="">-- none --</option>${personOptions}</select></div>
          <div><label>Owner Relationship</label><select name="ownerRelationship"><option>Self</option><option>Parent</option><option>Guardian</option><option>Other</option></select></div>
        </div>
        <button type="submit">Add Vehicle</button>
      </form>
    </div>
    <div class="card">
      <h2>Vehicles (${filtered.length}${filtered.length !== state.vehicles.length ? ` of ${state.vehicles.length}` : ''})</h2>
      <div class="form-grid" style="margin-bottom:10px;">
        <div><label>Search (VIN)</label><input id="vehicleSearchInput" value="${esc(state.vehicleSearch)}" placeholder="e.g. 1FADP3"></div>
      </div>
      <table><thead><tr><th>VIN</th><th>Make/Model</th><th>Color</th></tr></thead>
      <tbody>${filtered.map(v => `<tr class="clickableVehicleRow" data-vehicle="${v.id}" style="cursor:pointer;">
        <td>${esc(v.vin) || '—'}</td><td>${esc(v.year)} ${esc(v.make)} ${esc(v.model)}</td><td>${esc(v.color)}</td>
      </tr>`).join('') || `<tr><td colspan="3">${state.vehicles.length ? 'No vehicles match your search.' : 'No vehicles on file yet.'}</td></tr>`}</tbody></table>
    </div>
    ${state.selectedVehicleId ? renderVehicleDetail() : ''}
  `;
}

function renderVehicleDetail() {
  const d = state.vehicleDetail;
  if (!d) return `<div class="card"><p>Loading...</p></div>`;
  const personOptions = state.persons.map(p => `<option value="${p.id}">${esc(p.lastName)}, ${esc(p.firstName)}</option>`).join('');
  return `
    <div class="card" style="border:2px solid var(--navy);">
      <h2>File: ${esc(d.vin) || '(no VIN)'} -- ${esc(d.year)} ${esc(d.make)} ${esc(d.model)}</h2>
      <table>
        <tr><th>Current Plate</th><td>${d.currentRegistration ? `${esc(d.currentRegistration.plate)} (${esc(d.currentRegistration.state)})` : 'None on file'}</td></tr>
        <tr><th>Current Owner</th><td>${d.currentOwner ? `${esc(d.currentOwner.lastName)}, ${esc(d.currentOwner.firstName)} (${esc(d.currentOwner.personType)})` : 'None on file'}</td></tr>
      </table>

      <h3 style="margin-top:14px;font-size:0.95rem;">Registration History</h3>
      <table><thead><tr><th>Plate</th><th>State</th><th>From</th><th>To</th></tr></thead>
      <tbody>${d.registrations.map(r => `<tr>
        <td>${esc(r.plate)}</td><td>${esc(r.state)}</td><td>${esc(r.effectiveFrom)}</td><td>${esc(r.effectiveTo) || '(current)'}</td>
      </tr>`).join('') || '<tr><td colspan="4">None on file.</td></tr>'}</tbody></table>
      <form id="registrationForm" data-vehicle="${d.id}" style="margin-top:8px;display:flex;gap:6px;">
        <input name="plate" placeholder="New plate" required>
        <input name="state" placeholder="State" value="OR" style="width:80px;">
        <button type="submit" class="secondary">Register New Plate</button>
      </form>

      <h3 style="margin-top:14px;font-size:0.95rem;">Ownership History</h3>
      <table><thead><tr><th>Owner</th><th>Relationship</th><th>From</th><th>To</th></tr></thead>
      <tbody>${d.ownership.map(o => {
        const owner = state.persons.find(p => p.id === o.personId);
        return `<tr><td>${owner ? `${esc(owner.lastName)}, ${esc(owner.firstName)}` : esc(o.personId)}</td><td>${esc(o.relationship)}</td><td>${esc(o.effectiveFrom)}</td><td>${esc(o.effectiveTo) || '(current)'}</td></tr>`;
      }).join('') || '<tr><td colspan="4">None on file.</td></tr>'}</tbody></table>
      <form id="ownershipForm" data-vehicle="${d.id}" style="margin-top:8px;display:flex;gap:6px;">
        <select name="personId" required><option value="">-- select --</option>${personOptions}</select>
        <select name="relationship"><option>Self</option><option>Parent</option><option>Guardian</option><option>Other</option></select>
        <button type="submit" class="secondary">Change Owner</button>
      </form>
    </div>`;
}

// ── Locations ────────────────────────────────────────────────────────

function renderLocations() {
  return `
    <div class="card">
      <h2>Add Location</h2>
      <form id="locationForm">
        <div class="form-grid">
          <div><label>Name</label><input name="name" required></div>
          <div><label>Address</label><input name="address"></div>
          <div><label>Site Type</label><select name="siteType">${state.locationTypes.map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
        </div>
        <button type="submit">Add Location</button>
      </form>
    </div>
    <div class="card">
      <h2>Locations (${state.locations.length})</h2>
      <table><thead><tr><th>Name</th><th>Address</th><th>Type</th></tr></thead>
      <tbody>${state.locations.map(l => `<tr>
        <td>${esc(l.name)}</td><td>${esc(l.address) || '(not on file)'}</td><td>${esc(l.siteType)}</td>
      </tr>`).join('') || `<tr><td colspan="3">No locations yet.</td></tr>`}</tbody></table>
    </div>`;
}

// ── Shell ────────────────────────────────────────────────────────────

const TABS = [
  ['persons', 'Persons', renderPersons],
  ['vehicles', 'Vehicles', renderVehicles],
  ['locations', 'Locations', renderLocations],
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
  if (state._focusId) {
    const el = document.getElementById(state._focusId);
    if (el) { el.focus(); if (state._focusPos != null && el.setSelectionRange) el.setSelectionRange(state._focusPos, state._focusPos); }
  }
}

async function selectPerson(id) {
  state.selectedPersonId = id;
  state.personDetail = null;
  render();
  state.personDetail = await api(`/persons/${id}`);
  render();
}

async function selectVehicle(id) {
  state.selectedVehicleId = id;
  state.vehicleDetail = null;
  render();
  state.vehicleDetail = await api(`/vehicles/${id}`);
  render();
}

function wireEvents() {
  root.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => { state.tab = btn.dataset.tab; state.msg = null; render(); };
  });

  wireLiveSearch('personSearchInput', v => { state.personSearch = v; });
  wireLiveSearch('vehicleSearchInput', v => { state.vehicleSearch = v; });

  root.querySelectorAll('.clickableRow').forEach(row => {
    row.onclick = () => selectPerson(row.dataset.person);
  });
  root.querySelectorAll('.clickableVehicleRow').forEach(row => {
    row.onclick = () => selectVehicle(row.dataset.vehicle);
  });

  const personForm = document.getElementById('personForm');
  if (personForm) personForm.onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(personForm));
    try {
      await api('/persons', { method: 'POST', body: JSON.stringify(body) });
      await loadAll();
      state.msg = { type: 'success', text: 'Person added.' };
    } catch (err) { state.msg = { type: 'error', text: err.message }; }
    render();
  };

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

  const locationForm = document.getElementById('locationForm');
  if (locationForm) locationForm.onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(locationForm));
    try {
      await api('/locations', { method: 'POST', body: JSON.stringify(body) });
      await loadAll();
      state.msg = { type: 'success', text: 'Location added.' };
    } catch (err) { state.msg = { type: 'error', text: err.message }; }
    render();
  };

  const aliasForm = document.getElementById('aliasForm');
  if (aliasForm) aliasForm.onsubmit = async (e) => {
    e.preventDefault();
    const personId = aliasForm.dataset.person;
    const body = Object.fromEntries(new FormData(aliasForm));
    try {
      await api(`/persons/${personId}/aliases`, { method: 'POST', body: JSON.stringify(body) });
      state.personDetail = await api(`/persons/${personId}`);
      state.msg = { type: 'success', text: 'Alias added.' };
    } catch (err) { state.msg = { type: 'error', text: err.message }; }
    render();
  };

  const identifierForm = document.getElementById('identifierForm');
  if (identifierForm) identifierForm.onsubmit = async (e) => {
    e.preventDefault();
    const personId = identifierForm.dataset.person;
    const body = Object.fromEntries(new FormData(identifierForm));
    try {
      await api(`/persons/${personId}/identifiers`, { method: 'POST', body: JSON.stringify(body) });
      state.personDetail = await api(`/persons/${personId}`);
      state.msg = { type: 'success', text: 'Identifier added.' };
    } catch (err) { state.msg = { type: 'error', text: err.message }; }
    render();
  };

  root.querySelectorAll('.verifyIdBtn').forEach(btn => {
    btn.onclick = async () => {
      const verifiedBy = prompt('Verified by (name):');
      if (!verifiedBy) return;
      try {
        await api(`/persons/${btn.dataset.person}/identifiers/${btn.dataset.identifier}/verify`, { method: 'POST', body: JSON.stringify({ verifiedBy }) });
        state.personDetail = await api(`/persons/${btn.dataset.person}`);
        state.msg = { type: 'success', text: 'Identifier marked verified.' };
      } catch (err) { state.msg = { type: 'error', text: err.message }; }
      render();
    };
  });

  const registrationForm = document.getElementById('registrationForm');
  if (registrationForm) registrationForm.onsubmit = async (e) => {
    e.preventDefault();
    const vehicleId = registrationForm.dataset.vehicle;
    const body = Object.fromEntries(new FormData(registrationForm));
    try {
      await api(`/vehicles/${vehicleId}/registrations`, { method: 'POST', body: JSON.stringify(body) });
      state.vehicleDetail = await api(`/vehicles/${vehicleId}`);
      await loadAll();
      state.msg = { type: 'success', text: 'New registration recorded; previous one closed out.' };
    } catch (err) { state.msg = { type: 'error', text: err.message }; }
    render();
  };

  const ownershipForm = document.getElementById('ownershipForm');
  if (ownershipForm) ownershipForm.onsubmit = async (e) => {
    e.preventDefault();
    const vehicleId = ownershipForm.dataset.vehicle;
    const body = Object.fromEntries(new FormData(ownershipForm));
    try {
      await api(`/vehicles/${vehicleId}/ownership`, { method: 'POST', body: JSON.stringify(body) });
      state.vehicleDetail = await api(`/vehicles/${vehicleId}`);
      state.msg = { type: 'success', text: 'Ownership updated; previous owner closed out.' };
    } catch (err) { state.msg = { type: 'error', text: err.message }; }
    render();
  };
}

loadAll().then(render).catch(err => {
  root.innerHTML = `<div class="msg error">Failed to load: ${esc(err.message)}</div>`;
});
