// public/js/app.js
const grid = document.getElementById('grid');

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }

function renderModules(modules) {
  grid.innerHTML = modules.map(m => `
    <div class="card" style="border-top-color:${esc(m.color)};">
      <h2>${esc(m.name)}</h2>
      <p>${esc(m.description)}</p>
      <div class="status-row">
        <span class="status-dot ${m.up ? 'up' : 'down'}"></span>
        <span>${m.up ? 'Online' : 'Offline'}</span>
      </div>
      <a class="open-btn" href="${esc(m.baseUrl)}" target="_blank" rel="noopener">Open</a>
    </div>
  `).join('');
}

// The status checks happen server-side (each module gets up to a 1.5s
// timeout, all checked in parallel) before GET /api/modules responds --
// so there's a brief real wait, not an instant response. Show a
// lightweight loading placeholder for that window rather than a blank
// page.
grid.innerHTML = `<p style="color:var(--gray-4);">Checking module status...</p>`;

fetch('/api/modules')
  .then(res => res.json())
  .then(renderModules)
  .catch(err => {
    grid.innerHTML = `<p style="color:var(--red);">Failed to load module status: ${esc(err.message)}</p>`;
  });
