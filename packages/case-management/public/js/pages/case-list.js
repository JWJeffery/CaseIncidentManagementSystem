// public/js/pages/case-list.js

async function renderCaseList() {
  const main = document.getElementById('app-main');
  main.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Case List</div>
        <div class="page-subtitle">All incidents and cases on record</div>
      </div>
      <button class="btn btn-primary" id="btn-new-case">+ New Case</button>
    </div>

    <div class="search-bar">
      <input type="text" id="search-input" class="form-control" placeholder="Search case #, site, type, staff..." style="min-width:260px;">
      <select id="filter-status" class="form-control" style="min-width:160px;">
        <option value="all">All Statuses</option>
        ${STATUSES.map(s => `<option value="${esc(s)}">${s}</option>`).join('')}
      </select>
    </div>

    <div class="card">
      <div id="case-table-wrap">
        <div class="loading">Loading cases…</div>
      </div>
    </div>
  `;

  document.getElementById('btn-new-case').addEventListener('click', () => navigate('new-case'));
  document.getElementById('search-input').addEventListener('input', loadCases);
  document.getElementById('filter-status').addEventListener('change', loadCases);

  await loadCases();

  async function loadCases() {
    const search = document.getElementById('search-input').value;
    const status = document.getElementById('filter-status').value;
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status !== 'all') params.set('status', status);

    const cases = await API.get(`/api/cases?${params}`);
    const wrap = document.getElementById('case-table-wrap');
    if (!cases.length) {
      wrap.innerHTML = `<table class="data-table"><tbody><tr><td colspan="7" class="no-data">No cases found.</td></tr></tbody></table>`;
      return;
    }
    wrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Case #</th>
            <th>Incident Type</th>
            <th>School / Site</th>
            <th>Subject</th>
            <th>Status</th>
            <th>Assigned To</th>
            <th>Incident Date</th>
          </tr>
        </thead>
        <tbody>
          ${cases.map(c => `
            <tr data-id="${esc(c.id)}">
              <td class="case-number">${esc(c.caseNumber)}</td>
              <td>${esc(c.incidentType)}</td>
              <td>${esc(c.schoolSite)}</td>
              <td>${c.subjectName ? esc(c.subjectName) : '<span style="color:var(--gray-3)">—</span>'}</td>
              <td>${statusBadge(c.status)}</td>
              <td>${esc(c.assignedTo)}</td>
              <td>${fmtDate(c.incidentAt)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    wrap.querySelectorAll('tr[data-id]').forEach(row => {
      row.addEventListener('click', () => navigate('case-detail', { id: row.dataset.id }));
    });
  }
}
