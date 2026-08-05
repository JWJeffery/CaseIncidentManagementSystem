// public/js/app.js
const root = document.getElementById('app-root');
let state = { tab: 'lookup', vehicles: [], permits: [], permitTypes: [], applications: [], attachmentsByRecord: {}, violationCodes: [], citations: [], tows: [], dmvLog: [], msg: null, lookupResult: null, citationPrefill: null };

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

async function loadAll() {
  const [vehicles, permits, permitTypes, applications, violationCodes, citations, tows, dmvLog] = await Promise.all([
    api('/vehicles'), api('/permits'), api('/permits/types'), api('/applications'), api('/violationCodes'), api('/citations'), api('/tows'), api('/dmvQueryLog'),
  ]);
  Object.assign(state, { vehicles, permits, permitTypes, applications, violationCodes, citations, tows, dmvLog });

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
        <div><label>Reviewer Name</label><input class="reviewerName" data-app="${a.id}"></div>
        <div><label>Review Notes</label><input class="reviewNotes" data-app="${a.id}"></div>
      </div>
      <button class="approveBtn" data-app="${a.id}">Approve -- Issue Permit</button>
      <button class="rejectBtn secondary" data-app="${a.id}" style="margin-left:8px;">Reject</button>
    </div>`;
}

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
  const vehicleOptions = state.vehicles.map(v => `<option value="${v.id}" ${state.citationPrefill?.vehicleId === v.id ? 'selected' : ''}>${esc(v.plate)}</option>`).join('');
  const codeOptions = state.violationCodes.map(c => `<option value="${c.id}" ${state.citationPrefill?.violationCodeId === c.id ? 'selected' : ''}>${esc(c.citation)} -- ${esc(c.shortLabel)}</option>`).join('');
  const pre = state.citationPrefill;
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
          <div><label>Enforcement Officer ID</label><input name="enforcementOfficerId" required></div>
          <div><label>Location</label><input name="location" value="${esc(pre?.location || '')}"></div>
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
  ['lookup', 'Field Lookup', renderLookup],
  ['vehicles', 'Vehicles', renderVehicles],
  ['permits', 'Permits', renderPermits],
  ['applications', 'Applications', renderApplications],
  ['citations', 'Citations', renderCitations],
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
      state.citationPrefill = null;
      state.msg = { type: 'success', text: `Citation issued (${result.citationType}, ${result.recordsClassification}).` };
    } catch (err) { state.msg = { type: 'error', text: err.message }; }
    render();
  };

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
