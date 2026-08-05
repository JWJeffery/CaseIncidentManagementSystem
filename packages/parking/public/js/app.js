// public/js/app.js
const root = document.getElementById('app-root');
let state = { tab: 'lookup', vehicles: [], permits: [], permitTypes: [], applications: [], attachmentsByRecord: {}, staff: [], violationCodes: [], citations: [], tows: [], dmvLog: [], msg: null, lookupResult: null, citationPrefill: null, vehicleFilter: { search: '' }, permitFilter: { search: '', status: '', permitType: '' }, citationFilter: { search: '', status: '', citationType: '' }, _focusId: null, _focusPos: null };

async function api(path, opts) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// PROTOTYPE upload helper -- no Content-Type header set deliberately, so
// the browser sets the correct multipart boundary itself when body is a
// FormData object. See server/routes/attachments.js's header comment for
// what this prototype does NOT provide (encryption, access control,
// durable storage).
async function uploadFile(formData) {
  const res = await fetch('/api/attachments', { method: 'POST', body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
  return data;
}

async function loadAttachments(recordType, recordId) {
  return api(`/attachments?recordType=${encodeURIComponent(recordType)}&recordId=${encodeURIComponent(recordId)}`);
}

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }

// Shared dropdown builder -- every place identity used to be free text now
// uses this, so the option list (and what counts as "active") is
// consistent everywhere. Inactive staff are excluded by default since
// they shouldn't be selectable for new actions, but see renderStaff() for
// where they're still visible (roster management needs to show everyone).
function staffOptions(selectedId, { includeInactive = false } = {}) {
  const list = includeInactive ? state.staff : state.staff.filter(s => s.active);
  return list.map(s => `<option value="${s.id}" ${selectedId === s.id ? 'selected' : ''}>${esc(s.name)}${s.role ? ` (${esc(s.role)})` : ''}${!s.active ? ' [INACTIVE]' : ''}</option>`).join('');
}

function staffName(id) {
  const s = state.staff.find(st => st.id === id);
  return s ? s.name : (id || '—');
}

// Shared wiring for a live-search text input: updates the given filter
// object's key on every keystroke, remembers focus/cursor position so
// render()'s full-DOM-replace doesn't kick focus out of the box, and
// re-renders. Used by Vehicles/Permits/Citations search boxes.
function wireLiveSearch(inputId, filterObj, key) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.oninput = () => {
    filterObj[key] = el.value;
    state._focusId = inputId;
    state._focusPos = el.selectionStart;
    render();
  };
}

async function loadAll() {
  const [vehicles, permits, permitTypes, applications, staff, violationCodes, citations, tows, dmvLog] = await Promise.all([
    api('/vehicles'), api('/permits'), api('/permits/types'), api('/applications'), api('/staff?includeInactive=true'), api('/violationCodes'), api('/citations'), api('/tows'), api('/dmvQueryLog'),
  ]);
  Object.assign(state, { vehicles, permits, permitTypes, applications, staff, violationCodes, citations, tows, dmvLog });

  // Prefetch attachments for every pending application so the review
  // queue can show them without a per-card async render step.
  const pending = applications.filter(a => a.status === 'Submitted' || a.status === 'Under Review');
  const lists = await Promise.all(pending.map(a => loadAttachments('PermitApplication', a.id)));
  pending.forEach((a, i) => { state.attachmentsByRecord[a.id] = lists[i]; });
}

function badgeFor(classification) {
  if (classification === 'Education Record') return `<span class="badge education">Education Record</span>`;
  if (classification === 'Court Record') return `<span class="badge court">Court Record</span>`;
  return `<span class="badge leu">LEU-Public Safety</span>`;
}

// ── Tab renderers ──────────────────────────────────────────────────────

function zoneMismatch(permit, foundZone) {
  if (!foundZone) return null;
  if (!permit) return 'no-permit';
  if (permit.status !== 'Active') return 'inactive-permit';
  if (permit.parkingZone && foundZone && permit.parkingZone.trim().toLowerCase() !== foundZone.trim().toLowerCase()) return 'wrong-zone';
  return null;
}

function renderLookup() {
  const r = state.lookupResult;
  const foundZone = document.getElementById('foundZoneInput') ? document.getElementById('foundZoneInput').value : (r?.foundZone || '');
  const mismatch = r ? zoneMismatch(r.permit, foundZone) : null;

  return `
    <div class="card">
      <h2>Field Lookup</h2>
      <p style="margin-bottom:10px;color:var(--gray-4);font-size:0.85rem;">
        Search by license plate or permit number (the sticker/hangtag number, if visible). One search, one result -- built for a phone in the lot, not a desk.
      </p>
      <form id="lookupForm" class="form-grid" style="grid-template-columns:2fr 1fr;align-items:end;">
        <div><label>Plate or Permit Number</label><input id="lookupQuery" name="query" required autocomplete="off" placeholder="e.g. DEMO123 or PERMIT-2026-0001" value="${esc(r?.query || '')}"></div>
        <div><button type="submit">Search</button></div>
      </form>
    </div>

    ${r ? renderLookupResult(r, mismatch) : ''}
  `;
}

function renderLookupResult(r, mismatch) {
  if (!r.found) {
    return `
      <div class="gate-notice">
        <b>No match found.</b>
        No vehicle on file for "${esc(r.query)}" -- this is itself useful information: an unpermitted, unregistered vehicle in a restricted zone is exactly the "visitor vehicle without a permit" scenario.
      </div>
      <div class="card">
        <h2>Enter where it was found</h2>
        <div class="form-grid">
          <div><label>Zone / Lot Found In</label><input id="foundZoneInput" value="${esc(r.foundZone || '')}"></div>
        </div>
        <button id="startBlindCitationBtn">Start Citation (No Vehicle on File)</button>
      </div>`;
  }

  const v = r.vehicle;
  const p = r.permit;
  const mismatchBanner = mismatch === 'no-permit'
    ? `<div class="gate-notice"><b>No active permit on this vehicle.</b> Parked without authorization.</div>`
    : mismatch === 'inactive-permit'
    ? `<div class="gate-notice"><b>Permit on file is not Active</b> (status: ${esc(p.status)}). Treat as unauthorized.</div>`
    : mismatch === 'wrong-zone'
    ? `<div class="gate-notice"><b>Zone mismatch.</b> Permit authorizes "${esc(p.parkingZone)}" -- vehicle found in a different zone.</div>`
    : (p ? `<div class="msg success">Permit is Active and zone matches (or no found-zone entered yet to compare).</div>` : '');

  return `
    ${mismatchBanner}
    <div class="card">
      <h2>Vehicle</h2>
      <table>
        <tr><th>Plate</th><td>${esc(v.plate)} (${esc(v.state)})</td></tr>
        <tr><th>Vehicle</th><td>${esc(v.year)} ${esc(v.make)} ${esc(v.model)}, ${esc(v.color)}</td></tr>
        <tr><th>Registered Owner</th><td>${esc(v.ownerName)}${v.ownerRelationship ? ` (${esc(v.ownerRelationship)})` : ''}</td></tr>
      </table>
    </div>
    <div class="card">
      <h2>Permit</h2>
      ${p ? `
      <table>
        <tr><th>Permit #</th><td>${esc(p.permitNumber)}</td></tr>
        <tr><th>Registrant</th><td>${esc(p.registrantName)} (${esc(p.affiliateType)})</td></tr>
        <tr><th>Type</th><td>${esc(p.permitType)}</td></tr>
        <tr><th>Authorized Zone</th><td>${esc(p.parkingZone) || '—'}</td></tr>
        <tr><th>Status</th><td>${esc(p.status)}</td></tr>
      </table>` : `<p>No permit on file for this vehicle.</p>`}
    </div>
    <div class="card">
      <h2>Where did you find it?</h2>
      <div class="form-grid">
        <div><label>Zone / Lot Found In</label><input id="foundZoneInput" value="${esc(r.foundZone || '')}"></div>
      </div>
      <button id="checkZoneBtn" class="secondary">Check Zone</button>
      <button id="startCitationFromLookupBtn" style="margin-left:8px;">Start Citation</button>
    </div>`;
}

function suggestedViolationCitationForMismatch(mismatch) {
  // FGSD Rule 4(H) -- Parking in a Restricted Zone without Permit or
  // Authority -- fits both the "no permit at all" and "wrong zone" cases,
  // since either way the vehicle lacks authority for the zone it's
  // actually in. Officer can always override the suggestion.
  return 'FGSD Rule 4(H)';
}

function renderApplications() {
  const permitTypeOptions = state.permitTypes.map(t => `<option>${esc(t)}</option>`).join('');
  const pending = state.applications.filter(a => a.status === 'Submitted' || a.status === 'Under Review');
  const decided = state.applications.filter(a => a.status === 'Approved' || a.status === 'Rejected');
  return `
    <div class="card">
      <h2>Self-Registration: Submit Permit Application</h2>
      <p style="margin-bottom:10px;color:var(--gray-4);font-size:0.85rem;">
        Same information staff would otherwise type in manually. Submitting does not issue a permit --
        a staff member reviews and approves before it becomes Active.
        <b>Document upload (license/insurance photos) is not implemented yet</b> -- pending a decision on storage backend.
      </p>
      <form id="applicationForm">
        <div class="form-grid">
          <div><label>Person ID</label><input name="personId" required placeholder="No shared Person store yet -- free text"></div>
          <div><label>Your Name</label><input name="registrantName" required></div>
          <div><label>Affiliate Type</label>
            <select name="affiliateType"><option value="">-- select --</option><option>Student</option><option>Staff</option><option>Volunteer</option><option>Other</option></select>
          </div>
          <div><label>Student ID Number</label><input name="studentIdNumber"></div>
          <div><label>Employee ID Number</label><input name="employeeIdNumber"></div>
          <div><label>School Site</label><input name="schoolSite"></div>
          <div><label>Vehicle Plate</label><input name="vehiclePlate" required></div>
          <div><label>Vehicle State</label><input name="vehicleState" value="OR"></div>
          <div><label>VIN</label><input name="vehicleVin"></div>
          <div><label>Year</label><input name="vehicleYear"></div>
          <div><label>Make</label><input name="vehicleMake"></div>
          <div><label>Model</label><input name="vehicleModel"></div>
          <div><label>Color</label><input name="vehicleColor"></div>
          <div><label>Registered Owner Name</label><input name="ownerName" placeholder="If not you -- e.g. a parent"></div>
          <div><label>Owner Relationship</label>
            <select name="ownerRelationship"><option value="">-- select --</option><option>Self</option><option>Parent</option><option>Guardian</option><option>Other</option></select>
          </div>
          <div><label>Driver License Number</label><input name="driverLicenseNumber" required></div>
          <div><label>Driver License State</label><input name="driverLicenseState" value="OR"></div>
          <div><label>Insurance Carrier</label><input name="insuranceCarrier" required></div>
          <div><label>Insurance Policy Number</label><input name="insurancePolicyNumber" required></div>
          <div><label>Insurance Policy Expiration</label><input name="insurancePolicyExpiration" type="date"></div>
          <div><label>Permit Type Requested</label><select name="permitTypeRequested">${permitTypeOptions}</select></div>
          <div><label>Parking Zone Requested</label><input name="parkingZoneRequested"></div>
        </div>
        <button type="submit">Submit Application</button>
      </form>
    </div>

    <div class="card">
      <h2>Staff Review Queue (${pending.length} pending)</h2>
      ${pending.map(a => renderApplicationRow(a)).join('') || '<p>Nothing pending review.</p>'}
    </div>

    <div class="card">
      <h2>Decided (${decided.length})</h2>
      <table><thead><tr><th>Registrant</th><th>Plate</th><th>Status</th><th>Reviewed By</th><th>Notes</th></tr></thead>
      <tbody>${decided.map(a => `<tr>
        <td>${esc(a.registrantName)}</td><td>${esc(a.vehiclePlate)}</td><td>${esc(a.status)}</td>
        <td>${esc(a.reviewedBy)}</td><td>${esc(a.reviewNotes)}</td>
      </tr>`).join('') || `<tr><td colspan="5">None yet.</td></tr>`}</tbody></table>
    </div>`;
}

function renderApplicationRow(a) {
  const attachments = state.attachmentsByRecord[a.id] || [];
  return `
    <div class="card" style="background:var(--gray-0);margin-bottom:10px;">
      <table>
        <tr><th>Registrant</th><td>${esc(a.registrantName)} (${esc(a.affiliateType)}) -- ${esc(a.studentIdNumber || a.employeeIdNumber)}</td></tr>
        <tr><th>Vehicle</th><td>${esc(a.vehiclePlate)} / ${esc(a.vehicleYear)} ${esc(a.vehicleMake)} ${esc(a.vehicleModel)}, ${esc(a.vehicleColor)}</td></tr>
        <tr><th>Owner</th><td>${esc(a.ownerName)} (${esc(a.ownerRelationship)})</td></tr>
        <tr><th>Driver License</th><td>${esc(a.driverLicenseNumber)} (${esc(a.driverLicenseState)})</td></tr>
        <tr><th>Insurance</th><td>${esc(a.insuranceCarrier)} -- ${esc(a.insurancePolicyNumber)}, expires ${esc(a.insurancePolicyExpiration)}</td></tr>
        <tr><th>Requested</th><td>${esc(a.permitTypeRequested)} permit, zone: ${esc(a.parkingZoneRequested) || '—'}</td></tr>
      </table>

      <div style="margin-top:12px;padding:10px;border:1px dashed var(--gray-3);border-radius:var(--radius);">
        <b style="font-size:0.85rem;">Supporting Documents (PROTOTYPE -- see banner above)</b>
        <div style="margin:8px 0;">
          ${attachments.length ? attachments.map(att => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:0.85rem;">
              <span><a href="/api/attachments/${att.id}/file" target="_blank">${esc(att.documentType)}: ${esc(att.originalFilename)}</a> (${Math.round(att.fileSizeBytes/1024)} KB, by ${esc(att.uploadedBy)})</span>
              <button class="deleteAttachmentBtn secondary" data-att="${att.id}" data-app="${a.id}" style="padding:2px 8px;font-size:0.8rem;">Remove</button>
            </div>`).join('') : '<p style="font-size:0.85rem;color:var(--gray-4);">No documents uploaded yet.</p>'}
        </div>
        <form class="attachmentUploadForm" data-app="${a.id}" style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;">
          <div><label style="font-size:0.75rem;">Document Type</label>
            <select name="documentType" style="padding:5px;">
              <option>Driver License</option><option>Insurance Card</option><option>Vehicle Registration</option><option>Other</option>
            </select>
          </div>
          <div><label style="font-size:0.75rem;">Uploaded By</label><input name="uploadedBy" style="padding:5px;" required></div>
          <div><label style="font-size:0.75rem;">File (JPG/PNG/PDF, max 10MB)</label><input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></div>
          <button type="submit" class="secondary">Upload</button>
        </form>
      </div>

      <div class="form-grid" style="margin-top:10px;">
        <div><label>Reviewer</label><select class="reviewerName" data-app="${a.id}"><option value="">-- select --</option>${staffOptions()}</select></div>
        <div><label>Review Notes</label><input class="reviewNotes" data-app="${a.id}"></div>
      </div>
      <button class="approveBtn" data-app="${a.id}">Approve -- Issue Permit</button>
      <button class="rejectBtn secondary" data-app="${a.id}" style="margin-left:8px;">Reject</button>
    </div>`;
}

function filterVehicles() {
  const q = state.vehicleFilter.search.trim().toLowerCase();
  if (!q) return state.vehicles;
  return state.vehicles.filter(v =>
    [v.plate, v.vin, v.make, v.model, v.ownerName].some(f => (f || '').toLowerCase().includes(q))
  );
}

function renderVehicles() {
  const filtered = filterVehicles();
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
          <div><label>Entered By (optional -- staff only)</label>
            <select name="enteredBy"><option value="">-- n/a --</option>${staffOptions()}</select>
          </div>
        </div>
        <button type="submit">Add Vehicle</button>
      </form>
    </div>
    <div class="card">
      <h2>Vehicles (${filtered.length}${filtered.length !== state.vehicles.length ? ` of ${state.vehicles.length}` : ''})</h2>
      <div class="form-grid" style="margin-bottom:10px;">
        <div><label>Search (plate, VIN, make/model, owner name)</label>
          <input id="vehicleSearchInput" value="${esc(state.vehicleFilter.search)}" placeholder="e.g. DEMO or Ford or Pat">
        </div>
      </div>
      <table><thead><tr><th>Plate</th><th>State</th><th>Year/Make/Model</th><th>Color</th><th>Registered Owner</th><th>Provenance</th><th>Entered By</th></tr></thead>
      <tbody>${filtered.map(v => `<tr>
        <td>${esc(v.plate)}</td><td>${esc(v.state)}</td><td>${esc(v.year)} ${esc(v.make)} ${esc(v.model)}</td><td>${esc(v.color)}</td>
        <td>${esc(v.ownerName)}${v.ownerRelationship ? ` (${esc(v.ownerRelationship)})` : ''}</td>
        <td>${v.dmvVerified ? 'DMV-verified' : 'Self-reported'}</td>
        <td>${v.enteredBy ? esc(staffName(v.enteredBy)) : '—'}</td>
      </tr>`).join('') || `<tr><td colspan="7">${state.vehicles.length ? 'No vehicles match your search.' : 'No vehicles yet.'}</td></tr>`}</tbody></table>
    </div>`;
}

function filterPermits() {
  const { search, status, permitType } = state.permitFilter;
  const q = search.trim().toLowerCase();
  return state.permits.filter(p => {
    if (status && p.status !== status) return false;
    if (permitType && p.permitType !== permitType) return false;
    if (q) {
      const vehicle = state.vehicles.find(v => v.id === p.vehicleId) || {};
      const haystack = [p.permitNumber, p.registrantName, p.personId, p.studentIdNumber, p.employeeIdNumber, vehicle.plate].map(f => (f || '').toLowerCase());
      if (!haystack.some(f => f.includes(q))) return false;
    }
    return true;
  });
}

function renderPermits() {
  const vehicleOptions = state.vehicles.map(v => `<option value="${v.id}">${esc(v.plate)} (${esc(v.make)} ${esc(v.model)})</option>`).join('');
  const permitTypeOptions = state.permitTypes.map(t => `<option>${esc(t)}</option>`).join('');
  const filtered = filterPermits();
  const filterTypeOptions = state.permitTypes.map(t => `<option ${state.permitFilter.permitType === t ? 'selected' : ''}>${esc(t)}</option>`).join('');
  const statuses = ['Active', 'Expired', 'Revoked'];
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
          <div><label>Issued By (required)</label><select name="issuedBy" required><option value="">-- select --</option>${staffOptions()}</select></div>
        </div>
        <button type="submit">Issue Permit</button>
      </form>
    </div>
    <div class="card">
      <h2>Permits (${filtered.length}${filtered.length !== state.permits.length ? ` of ${state.permits.length}` : ''})</h2>
      <div class="form-grid" style="margin-bottom:10px;">
        <div><label>Search (permit #, registrant, ID#, plate)</label>
          <input id="permitSearchInput" value="${esc(state.permitFilter.search)}" placeholder="e.g. PERMIT-2026 or Jamie or DEMO123">
        </div>
        <div><label>Status</label>
          <select id="permitStatusFilter">
            <option value="">All</option>
            ${statuses.map(s => `<option ${state.permitFilter.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div><label>Permit Type</label>
          <select id="permitTypeFilter"><option value="">All</option>${filterTypeOptions}</select>
        </div>
      </div>
      <table><thead><tr><th>Permit #</th><th>Registrant</th><th>Type</th><th>Vehicle</th><th>Zone</th><th>School</th><th>Status</th><th>Issued By</th></tr></thead>
      <tbody>${filtered.map(p => `<tr>
        <td>${esc(p.permitNumber)}</td><td>${esc(p.registrantName) || esc(p.personId)}</td>
        <td>${esc(p.permitType)}</td>
        <td>${esc((state.vehicles.find(v => v.id === p.vehicleId) || {}).plate)}</td>
        <td>${esc(p.parkingZone)}</td>
        <td>${esc(p.schoolSite)}</td><td>${esc(p.status)}</td>
        <td>${p.issuedBy ? esc(staffName(p.issuedBy)) : '—'}</td>
      </tr>`).join('') || `<tr><td colspan="8">${state.permits.length ? 'No permits match your filters.' : 'No permits yet.'}</td></tr>`}</tbody></table>
    </div>`;
}

function filterCitations() {
  const { search, status, citationType } = state.citationFilter;
  const q = search.trim().toLowerCase();
  return state.citations.filter(c => {
    if (status && c.status !== status) return false;
    if (citationType && c.citationType !== citationType) return false;
    if (q) {
      const code = state.violationCodes.find(vc => vc.id === c.violationCodeId) || {};
      const vehicle = state.vehicles.find(v => v.id === c.vehicleId) || {};
      const haystack = [code.citation, code.shortLabel, vehicle.plate, c.caseNumber, c.citationNumber, c.personId].map(f => (f || '').toLowerCase());
      if (!haystack.some(f => f.includes(q))) return false;
    }
    return true;
  });
}

function renderCitations() {
  const vehicleOptions = state.vehicles.map(v => `<option value="${v.id}" ${state.citationPrefill?.vehicleId === v.id ? 'selected' : ''}>${esc(v.plate)}</option>`).join('');
  const codeOptions = state.violationCodes.map(c => `<option value="${c.id}" ${state.citationPrefill?.violationCodeId === c.id ? 'selected' : ''}>${esc(c.citation)} -- ${esc(c.shortLabel)}</option>`).join('');
  const pre = state.citationPrefill;
  const filtered = filterCitations();
  const citationStatuses = ['Issued', 'Filed', 'Dismissed', 'Paid'];
  return `
    ${pre ? `<div class="msg success">Pre-filled from Field Lookup${pre.note ? ` -- ${esc(pre.note)}` : ''}. Review before submitting.</div>` : ''}
    <div class="card">
      <h2>Issue Citation</h2>
      <p style="margin-bottom:10px;color:var(--gray-4);font-size:0.85rem;">
        Administrative track requires an active permit on the vehicle (ECD §5(A)). Court track requires school board adoption of proposed Board Policy ECD -- attempting a Court citation before then will be rejected by the server, not just hidden here.
      </p>
      <form id="citationForm">
        <div class="form-grid">
          <div><label>Citation Type</label><select name="citationType"><option value="Administrative" ${pre?.citationType !== 'Court' ? 'selected' : ''}>Administrative</option><option value="Court" ${pre?.citationType === 'Court' ? 'selected' : ''}>Court</option></select></div>
          <div><label>Vehicle</label><select name="vehicleId"><option value="">-- none --</option>${vehicleOptions}</select></div>
          <div><label>Person ID</label><input name="personId" value="${esc(pre?.personId || '')}" placeholder="Free text -- no shared Person store yet"></div>
          <div><label>Violation Code</label><select name="violationCodeId" required><option value="">-- select --</option>${codeOptions}</select></div>
          <div><label>Enforcement Officer</label><select name="enforcementOfficerId" required><option value="">-- select --</option>${staffOptions(pre?.enforcementOfficerId)}</select></div>
          <div><label>Location</label><input name="location" value="${esc(pre?.location || '')}"></div>
        </div>
        <button type="submit">Issue Citation</button>
      </form>
    </div>
    <div class="card">
      <h2>Citations (${filtered.length}${filtered.length !== state.citations.length ? ` of ${state.citations.length}` : ''})</h2>
      <div class="form-grid" style="margin-bottom:10px;">
        <div><label>Search (violation, plate, case #)</label>
          <input id="citationSearchInput" value="${esc(state.citationFilter.search)}" placeholder="e.g. 4(H) or DEMO123">
        </div>
        <div><label>Status</label>
          <select id="citationStatusFilter">
            <option value="">All</option>
            ${citationStatuses.map(s => `<option ${state.citationFilter.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div><label>Citation Type</label>
          <select id="citationTypeFilter">
            <option value="">All</option>
            <option ${state.citationFilter.citationType === 'Administrative' ? 'selected' : ''}>Administrative</option>
            <option ${state.citationFilter.citationType === 'Court' ? 'selected' : ''}>Court</option>
          </select>
        </div>
      </div>
      <table><thead><tr><th>Citation #</th><th>Type</th><th>Classification</th><th>Violation</th><th>Vehicle</th><th>Status</th><th>Case #</th><th>Officer</th><th>Print</th></tr></thead>
      <tbody>${filtered.map(c => {
        const code = state.violationCodes.find(vc => vc.id === c.violationCodeId) || {};
        const vehicle = state.vehicles.find(v => v.id === c.vehicleId) || {};
        return `<tr>
          <td>${esc(c.citationNumber) || '—'}</td>
          <td>${esc(c.citationType)}</td><td>${badgeFor(c.recordsClassification)}</td>
          <td>${esc(code.citation)}</td><td>${esc(vehicle.plate)}</td>
          <td>${esc(c.status)}</td>
          <td>${esc(c.caseNumber) || '—'}</td>
          <td>${esc(staffName(c.enforcementOfficerId))}</td>
          <td>
            <button class="printCitationBtn secondary" data-cit="${c.id}" style="padding:3px 10px;font-size:0.8rem;">Print</button>
            ${c.printedAt ? `<div style="font-size:0.7rem;color:var(--gray-4);margin-top:2px;">Printed ${new Date(c.printedAt).toLocaleString()} by ${esc(staffName(c.printedBy))}</div>` : ''}
          </td>
        </tr>`;
      }).join('') || `<tr><td colspan="9">${state.citations.length ? 'No citations match your filters.' : 'No citations yet.'}</td></tr>`}</tbody></table>
    </div>`;
}

// Client-side mirror of the deadline-status -> color mapping. The actual
// status values themselves come from the server's towWorkflow.js -- this
// is presentation-only, not a second copy of the deadline math.
function deadlineBadge(entry) {
  if (!entry || !entry.status) return '';
  const colors = { complete: 'education', 'complete-late': 'court', ok: 'education', 'due-soon': 'leu', overdue: 'court' };
  const cls = colors[entry.status] || 'education';
  const when = entry.deadline ? new Date(entry.deadline).toLocaleString() : '';
  return `<span class="badge ${cls}" title="Deadline: ${esc(when)}">${esc(entry.status)}</span>`;
}

function towActionForm(t) {
  const staffSelect = (name) => `<select name="${name}" required><option value="">-- select --</option>${staffOptions()}</select>`;
  switch (t.status) {
    case 'Open':
      return t.hazardTow
        ? `<form class="towActionForm" data-tow="${t.id}" data-action="execute-tow"><label>Executed By</label>${staffSelect('executedBy')}<button type="submit">Execute Tow (hazard -- immediate)</button></form>`
        : `<form class="towActionForm" data-tow="${t.id}" data-action="affix-pre-tow-notice"><label>Affixed By</label>${staffSelect('affixedBy')}<button type="submit">Affix Pre-Tow Notice</button></form>`;
    case 'Pre-Tow Notice Affixed':
      return `<form class="towActionForm" data-tow="${t.id}" data-action="execute-tow"><label>Executed By</label>${staffSelect('executedBy')}<button type="submit">Execute Tow</button></form>
        <div style="font-size:0.75rem;color:var(--gray-4);margin-top:4px;">Blocked by the server until the 48hr window elapses.</div>`;
    case 'Towed':
      return `<form class="towActionForm" data-tow="${t.id}" data-action="mail-post-tow-notice"><label>Mailed By</label>${staffSelect('mailedBy')}<button type="submit">Mail Post-Tow Notice</button></form>
        <form class="towActionForm" data-tow="${t.id}" data-action="request-hearing" style="margin-top:6px;"><label>Requested By (owner name)</label><input name="requestedBy" required><button type="submit">Request Hearing</button></form>
        <form class="towActionForm" data-tow="${t.id}" data-action="release" style="margin-top:6px;"><label>Released To</label><input name="releasedTo" required><label>Charges Paid?</label><select name="_paid"><option value="">No</option><option value="yes">Yes</option></select><label>Released By</label>${staffSelect('releasedBy')}<button type="submit">Release (uncontested)</button></form>`;
    case 'Post-Tow Notice Mailed':
      return `<form class="towActionForm" data-tow="${t.id}" data-action="request-hearing"><label>Requested By (owner name)</label><input name="requestedBy" required><button type="submit">Request Hearing</button></form>
        <form class="towActionForm" data-tow="${t.id}" data-action="release" style="margin-top:6px;"><label>Released To</label><input name="releasedTo" required><label>Charges Paid?</label><select name="_paid"><option value="">No</option><option value="yes">Yes</option></select><label>Released By</label>${staffSelect('releasedBy')}<button type="submit">Release (uncontested)</button></form>`;
    case 'Hearing Requested':
      return `<form class="towActionForm" data-tow="${t.id}" data-action="schedule-hearing"><label>Scheduled By</label>${staffSelect('scheduledBy')}<label>Date/Time</label><input name="hearingScheduledAt" type="datetime-local" required><button type="submit">Schedule Hearing</button></form>`;
    case 'Hearing Scheduled':
      return `<form class="towActionForm" data-tow="${t.id}" data-action="decide-hearing"><label>Decided By</label>${staffSelect('decidedBy')}<label>Decision</label><select name="decision" required><option value="">-- select --</option><option>Valid</option><option>Invalid</option></select><button type="submit">Record Decision</button></form>`;
    case 'Hearing Decided -- Valid':
    case 'Hearing Decided -- Invalid':
      return `<form class="towActionForm" data-tow="${t.id}" data-action="release"><label>Released To</label><input name="releasedTo" required>${t.status.includes('Valid') ? '<label>Charges Paid?</label><select name="_paid"><option value="">No</option><option value="yes">Yes</option></select>' : ''}<label>Released By</label>${staffSelect('releasedBy')}<button type="submit">Release</button></form>`;
    case 'Released':
      return `<span style="color:var(--gray-4);font-size:0.85rem;">Closed.</span>`;
    default:
      return '';
  }
}

function renderTows() {
  const vehicleOptions = state.vehicles.map(v => `<option value="${v.id}">${esc(v.plate)}</option>`).join('');
  return `
    <div class="gate-notice">
      <b>Towing is disabled.</b>
      This entire subsystem is board-gated pending school board adoption of proposed Board Policy ECD (design doc §1.7 / §4.12a).
      The schema, workflow, and full statutory-deadline tracking below are real and tested -- see
      <code>packages/parking/tests/towWorkflow.test.js</code> -- but every write is rejected server-side until the board acts.
      This isn't just a UI restriction. Try the button below to see the real 403 response.
    </div>
    <div class="card">
      <h2>Attempt Test Tow (expected to fail)</h2>
      <button id="testTowBtn" class="secondary">Attempt to Create a Tow Record</button>
      <div id="towTestResult" style="margin-top:10px;"></div>
    </div>
    <div class="card">
      <h2>Create Tow Record</h2>
      <form id="towCreateForm">
        <div class="form-grid">
          <div><label>Vehicle</label><select name="vehicleId" required><option value="">-- select --</option>${vehicleOptions}</select></div>
          <div><label>Tow Reason</label><input name="towReason" required placeholder="e.g. Obstructing a fire lane"></div>
          <div><label>Hazard Tow?</label><select name="hazardTow"><option value="">No -- requires 48hr pre-notice</option><option value="true">Yes -- immediate</option></select></div>
          <div><label>Charges Amount</label><input name="chargesAmount" placeholder="e.g. 150.00"></div>
        </div>
        <button type="submit">Create Tow Record</button>
      </form>
    </div>
    <div class="card">
      <h2>Tow Records (${state.tows.length})</h2>
      ${state.tows.length ? state.tows.map(t => {
        const vehicle = state.vehicles.find(v => v.id === t.vehicleId) || {};
        const d = t.deadlines || {};
        return `<div class="card" style="background:var(--gray-0);margin-bottom:10px;">
          <div class="row" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <div>
              <b>${esc(vehicle.plate)}</b> -- ${esc(t.towReason)} ${t.hazardTow ? '<span class="badge court">HAZARD</span>' : ''}
              <div style="font-size:0.85rem;color:var(--gray-4);">Status: ${esc(t.status)}</div>
            </div>
            <div>
              ${d.eligibleToTow ? `<div>Eligible to tow: ${deadlineBadge(d.eligibleToTow)}</div>` : ''}
              ${d.postTowNoticeDeadline ? `<div>Post-tow notice: ${deadlineBadge(d.postTowNoticeDeadline)}</div>` : ''}
              ${d.hearingRequestDeadline ? `<div>Hearing request window: ${deadlineBadge(d.hearingRequestDeadline)}</div>` : ''}
              ${d.hearingScheduleDeadline ? `<div>Hearing scheduling: ${deadlineBadge(d.hearingScheduleDeadline)}</div>` : ''}
            </div>
          </div>
          <div style="margin-top:8px;">${towActionForm(t)}</div>
        </div>`;
      }).join('') : `<p style="color:var(--gray-4);font-size:0.9rem;">No tow records yet.</p>`}
    </div>`;
}

function renderDmvLog() {
  const dmv2uStaff = state.staff.filter(s => s.active && s.dmv2uAuthorized);
  return `
    <div class="card">
      <h2>Log DMV2U Inquiry</h2>
      <p style="margin-bottom:10px;color:var(--gray-4);font-size:0.85rem;">
        Required for every DMV2U inquiry per District DMV2U Record Inquiry Account Protocol (010) §8. This log is append-only -- entries cannot be edited or deleted once created.
      </p>
      <form id="dmvForm">
        <div class="form-grid">
          <div><label>Select Staff (optional, autofills name/title)</label>
            <select id="dmvStaffAutofill">
              <option value="">-- manual entry --</option>
              ${dmv2uStaff.map(s => `<option value="${s.id}" data-name="${esc(s.name)}" data-title="${esc(s.role)}">${esc(s.name)}</option>`).join('')}
            </select>
          </div>
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

function renderStaff() {
  return `
    <div class="card">
      <h2>Add Staff / Officer</h2>
      <p style="margin-bottom:10px;color:var(--gray-4);font-size:0.85rem;">
        This roster is what every "who did this" dropdown in the app draws from -- Citations, Permits, Applications review, Vehicle entry.
        No auth system exists yet (see RESUME_PROJECT_NOTE.md), so this doesn't gate who CAN act, only makes the record of who DID
        act a real, selectable name instead of free text.
      </p>
      <form id="staffForm">
        <div class="form-grid">
          <div><label>Name</label><input name="name" required></div>
          <div><label>Role</label>
            <select name="role">
              <option value="">-- select --</option>
              <option>Public Safety Officer</option><option>Student Supervisor</option>
              <option>District Safety Coordinator</option><option>Building Administrator</option>
              <option>Front Office Staff</option><option>Other</option>
            </select>
          </div>
          <div><label>Employee ID</label><input name="employeeIdNumber"></div>
          <div><label>DPSST Number</label><input name="dpsstNumber"></div>
          <div><label>DMV2U Authorized</label>
            <select name="dmv2uAuthorized"><option value="">No</option><option value="true">Yes</option></select>
          </div>
        </div>
        <button type="submit">Add Staff Member</button>
      </form>
    </div>
    <div class="card">
      <h2>Roster (${state.staff.length})</h2>
      <table><thead><tr><th>Name</th><th>Role</th><th>Employee ID</th><th>DPSST #</th><th>DMV2U Authorized</th><th>Status</th><th></th></tr></thead>
      <tbody>${state.staff.map(s => `<tr>
        <td>${esc(s.name)}</td><td>${esc(s.role)}</td><td>${esc(s.employeeIdNumber)}</td><td>${esc(s.dpsstNumber)}</td>
        <td>${s.dmv2uAuthorized ? 'Yes' : 'No'}</td><td>${s.active ? 'Active' : 'Inactive'}</td>
        <td><button class="toggleStaffActiveBtn secondary" data-staff="${s.id}" data-active="${s.active}">${s.active ? 'Deactivate' : 'Reactivate'}</button></td>
      </tr>`).join('') || `<tr><td colspan="7">No staff yet.</td></tr>`}</tbody></table>
    </div>`;
}

const TABS = [
  ['lookup', 'Field Lookup', renderLookup],
  ['vehicles', 'Vehicles', renderVehicles],
  ['permits', 'Permits', renderPermits],
  ['applications', 'Applications', renderApplications],
  ['citations', 'Citations', renderCitations],
  ['staff', 'Staff', renderStaff],
  ['tows', 'Towing (gated)', renderTows],
  ['dmvLog', 'DMV2U Log', renderDmvLog],
  ['codes', 'Violation Codes', renderViolationCodes],
];

function render() {
  const tabButtons = TABS.map(([id, label]) => `<button class="tab-btn ${state.tab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('');
  const activeRenderer = TABS.find(([id]) => id === state.tab)[2];
  root.innerHTML = `
    <div class="prototype-banner">
      ⚠️ PROTOTYPE -- Document upload is a proof of concept only. Files are stored unencrypted with no
      access control on local disk. Not suitable for real confidential records (injury reports, investigations,
      driver license/insurance images, or anything involving real victims) until a production storage decision
      is made and access control exists. Do not upload real student or staff documents into this environment.
    </div>
    <div class="tabs">${tabButtons}</div>
    ${state.msg ? `<div class="msg ${state.msg.type}">${esc(state.msg.text)}</div>` : ''}
    ${activeRenderer()}
  `;
  wireEvents();

  // Re-rendering replaces the whole tab's DOM (root.innerHTML = ...), which
  // would otherwise steal focus out of a search box on every keystroke.
  // Restore it if the last input event told us where focus was.
  if (state._focusId) {
    const el = document.getElementById(state._focusId);
    if (el) {
      el.focus();
      if (state._focusPos != null && el.setSelectionRange) el.setSelectionRange(state._focusPos, state._focusPos);
    }
  }
}

function wireEvents() {
  root.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => { state.tab = btn.dataset.tab; state.msg = null; render(); };
  });

  // --- Search/filter wiring ---
  wireLiveSearch('vehicleSearchInput', state.vehicleFilter, 'search');
  wireLiveSearch('permitSearchInput', state.permitFilter, 'search');
  wireLiveSearch('citationSearchInput', state.citationFilter, 'search');

  const permitStatusFilter = document.getElementById('permitStatusFilter');
  if (permitStatusFilter) permitStatusFilter.onchange = () => { state.permitFilter.status = permitStatusFilter.value; render(); };
  const permitTypeFilter = document.getElementById('permitTypeFilter');
  if (permitTypeFilter) permitTypeFilter.onchange = () => { state.permitFilter.permitType = permitTypeFilter.value; render(); };
  const citationStatusFilter = document.getElementById('citationStatusFilter');
  if (citationStatusFilter) citationStatusFilter.onchange = () => { state.citationFilter.status = citationStatusFilter.value; render(); };
  const citationTypeFilter = document.getElementById('citationTypeFilter');
  if (citationTypeFilter) citationTypeFilter.onchange = () => { state.citationFilter.citationType = citationTypeFilter.value; render(); };

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
      state.citationPrefill = null;
      state.msg = { type: 'success', text: `Citation ${result.citationNumber} issued (${result.citationType}, ${result.recordsClassification}).` };
    } catch (err) { state.msg = { type: 'error', text: err.message }; }
    render();
  };

  root.querySelectorAll('.printCitationBtn').forEach(btn => {
    btn.onclick = async () => {
      const citId = btn.dataset.cit;
      const citation = state.citations.find(c => c.id === citId);
      try {
        // Defaults printedBy to the issuing officer -- the natural field
        // workflow is the same officer issues and prints on the spot.
        await api(`/citations/${citId}/mark-printed`, { method: 'POST', body: JSON.stringify({ printedBy: citation.enforcementOfficerId }) });
        window.open(`/api/citations/${citId}/print`, '_blank');
        await loadAll();
        state.msg = { type: 'success', text: 'Citation opened for printing.' };
      } catch (err) { state.msg = { type: 'error', text: err.message }; }
      render();
    };
  });

  // --- Field Lookup ---
  const lookupForm = document.getElementById('lookupForm');
  if (lookupForm) lookupForm.onsubmit = async (e) => {
    e.preventDefault();
    const query = document.getElementById('lookupQuery').value.trim();
    try {
      const result = await api(`/vehicles/lookup?query=${encodeURIComponent(query)}`);
      state.lookupResult = { ...result, query, foundZone: '' };
      state.msg = null;
    } catch (err) { state.msg = { type: 'error', text: err.message }; }
    render();
  };

  const checkZoneBtn = document.getElementById('checkZoneBtn');
  if (checkZoneBtn) checkZoneBtn.onclick = () => {
    state.lookupResult.foundZone = document.getElementById('foundZoneInput').value;
    render();
  };

  const startCitationFromLookupBtn = document.getElementById('startCitationFromLookupBtn');
  if (startCitationFromLookupBtn) startCitationFromLookupBtn.onclick = () => {
    const r = state.lookupResult;
    const foundZone = document.getElementById('foundZoneInput').value;
    const mismatch = zoneMismatch(r.permit, foundZone);
    const suggestedCitation = suggestedViolationCitationForMismatch(mismatch);
    const suggestedCode = state.violationCodes.find(c => c.citation === suggestedCitation);
    state.citationPrefill = {
      citationType: 'Administrative',
      vehicleId: r.vehicle.id,
      personId: r.permit ? r.permit.personId : '',
      violationCodeId: suggestedCode ? suggestedCode.id : '',
      location: foundZone,
      note: mismatch === 'no-permit' ? 'no active permit found'
          : mismatch === 'wrong-zone' ? `permit authorizes "${r.permit.parkingZone}", found in "${foundZone}"`
          : mismatch === 'inactive-permit' ? `permit status is "${r.permit.status}"`
          : 'no mismatch detected -- confirm before issuing',
    };
    state.tab = 'citations';
    render();
  };

  const startBlindCitationBtn = document.getElementById('startBlindCitationBtn');
  if (startBlindCitationBtn) startBlindCitationBtn.onclick = () => {
    const r = state.lookupResult;
    const foundZone = document.getElementById('foundZoneInput') ? document.getElementById('foundZoneInput').value : '';
    const suggestedCode = state.violationCodes.find(c => c.citation === 'FGSD Rule 4(M)'); // Failure to Register a Vehicle
    state.citationPrefill = {
      citationType: 'Court', // no vehicle/permit on file at all -- cannot qualify for Administrative track (ECD §5(A))
      vehicleId: null,
      personId: '',
      violationCodeId: suggestedCode ? suggestedCode.id : '',
      location: foundZone,
      note: `no vehicle on file for "${r.query}" -- Court track suggested since no permit can exist to qualify for Administrative (ECD §5(A))`,
    };
    state.tab = 'citations';
    render();
  };

  // --- Applications ---
  const applicationForm = document.getElementById('applicationForm');
  if (applicationForm) applicationForm.onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(applicationForm));
    try {
      await api('/applications', { method: 'POST', body: JSON.stringify(body) });
      await loadAll();
      state.msg = { type: 'success', text: 'Application submitted -- pending staff review.' };
    } catch (err) { state.msg = { type: 'error', text: err.message }; }
    render();
  };

  root.querySelectorAll('.approveBtn').forEach(btn => {
    btn.onclick = async () => {
      const appId = btn.dataset.app;
      const reviewedBy = root.querySelector(`.reviewerName[data-app="${appId}"]`).value;
      const reviewNotes = root.querySelector(`.reviewNotes[data-app="${appId}"]`).value;
      if (!reviewedBy) { state.msg = { type: 'error', text: 'Enter your name as reviewer before approving.' }; render(); return; }
      try {
        const result = await api(`/applications/${appId}/approve`, { method: 'POST', body: JSON.stringify({ reviewedBy, reviewNotes }) });
        await loadAll();
        state.msg = { type: 'success', text: `Approved -- Permit ${result.permitNumber} issued.` };
      } catch (err) { state.msg = { type: 'error', text: err.message }; }
      render();
    };
  });

  root.querySelectorAll('.rejectBtn').forEach(btn => {
    btn.onclick = async () => {
      const appId = btn.dataset.app;
      const reviewedBy = root.querySelector(`.reviewerName[data-app="${appId}"]`).value;
      const reviewNotes = root.querySelector(`.reviewNotes[data-app="${appId}"]`).value;
      if (!reviewedBy || !reviewNotes) { state.msg = { type: 'error', text: 'Enter your name and a reason before rejecting.' }; render(); return; }
      try {
        await api(`/applications/${appId}/reject`, { method: 'POST', body: JSON.stringify({ reviewedBy, reviewNotes }) });
        await loadAll();
        state.msg = { type: 'success', text: 'Application rejected.' };
      } catch (err) { state.msg = { type: 'error', text: err.message }; }
      render();
    };
  });

  // --- PROTOTYPE document attachments ---
  root.querySelectorAll('.attachmentUploadForm').forEach(form => {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const appId = form.dataset.app;
      const fileInput = form.querySelector('input[type="file"]');
      if (!fileInput.files.length) return;
      const fd = new FormData();
      fd.append('file', fileInput.files[0]);
      fd.append('recordType', 'PermitApplication');
      fd.append('recordId', appId);
      fd.append('documentType', form.querySelector('select[name="documentType"]').value);
      fd.append('uploadedBy', form.querySelector('input[name="uploadedBy"]').value);
      try {
        await uploadFile(fd);
        state.attachmentsByRecord[appId] = await loadAttachments('PermitApplication', appId);
        state.msg = { type: 'success', text: 'Document uploaded (prototype storage -- see banner).' };
      } catch (err) { state.msg = { type: 'error', text: err.message }; }
      render();
    };
  });

  root.querySelectorAll('.deleteAttachmentBtn').forEach(btn => {
    btn.onclick = async () => {
      const appId = btn.dataset.app;
      try {
        await api(`/attachments/${btn.dataset.att}`, { method: 'DELETE' });
        state.attachmentsByRecord[appId] = await loadAttachments('PermitApplication', appId);
        state.msg = { type: 'success', text: 'Document removed.' };
      } catch (err) { state.msg = { type: 'error', text: err.message }; }
      render();
    };
  });

  const dmvStaffAutofill = document.getElementById('dmvStaffAutofill');
  if (dmvStaffAutofill) dmvStaffAutofill.onchange = () => {
    const opt = dmvStaffAutofill.selectedOptions[0];
    if (!opt || !opt.value) return;
    document.querySelector('#dmvForm input[name="authorizedUserName"]').value = opt.dataset.name || '';
    document.querySelector('#dmvForm input[name="authorizedUserTitle"]').value = opt.dataset.title || '';
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

  const towCreateForm = document.getElementById('towCreateForm');
  if (towCreateForm) towCreateForm.onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(towCreateForm));
    try {
      await api('/tows', { method: 'POST', body: JSON.stringify(body) });
      await loadAll();
      state.msg = { type: 'success', text: 'Tow record created.' };
    } catch (err) { state.msg = { type: 'error', text: err.message }; }
    render();
  };

  // Generic handler for every tow state-transition form -- the action
  // name (matching a real server endpoint) comes from data-action, so one
  // handler covers affix/execute/mail/request/schedule/decide/release
  // instead of seven near-identical ones.
  root.querySelectorAll('.towActionForm').forEach(form => {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const towId = form.dataset.tow;
      const action = form.dataset.action;
      const body = Object.fromEntries(new FormData(form));
      // Release form uses a "paid?" convenience select rather than asking
      // for a raw timestamp -- translate it into the real field the API
      // expects.
      if (body._paid === 'yes') { body.chargesPaidAt = new Date().toISOString(); }
      delete body._paid;
      try {
        await api(`/tows/${towId}/${action}`, { method: 'POST', body: JSON.stringify(body) });
        await loadAll();
        state.msg = { type: 'success', text: `Tow updated (${action}).` };
      } catch (err) { state.msg = { type: 'error', text: err.message }; }
      render();
    };
  });
}

loadAll().then(render).catch(err => {
  root.innerHTML = `<div class="msg error">Failed to load: ${esc(err.message)}</div>`;
});
