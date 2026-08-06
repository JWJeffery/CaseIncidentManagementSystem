// public/js/app.js
const grid = document.getElementById('grid');

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }

// Computes the URL the BROWSER should navigate to for a given module's
// port -- deliberately NOT the same thing as the server-side status
// check, which always (correctly) uses localhost. The browser viewing
// this console might not be on the same machine as the servers at all:
// in GitHub Codespaces specifically, the port is forwarded through a
// proxy that encodes it into the SUBDOMAIN (e.g.
// "my-codespace-name-3001.app.github.dev"), not as a real ":3001" on
// "localhost" -- so "localhost:3001" in a Codespaces browser tab means
// "port 3001 on the person's own laptop," which doesn't exist, hence
// ERR_CONNECTION_REFUSED. Detected here by checking whether the CURRENT
// page's hostname matches that Codespaces pattern, and if so, swapping
// just the port segment rather than assuming any particular URL shape.
function moduleUrl(port) {
  const { protocol, hostname } = window.location;
  if (/\.app\.github\.dev$/.test(hostname)) {
    return `${protocol}//${hostname.replace(/-\d+(?=\.app\.github\.dev$)/, `-${port}`)}`;
  }
  return `${protocol}//${hostname}:${port}`;
}

function renderModules(modules) {
  grid.innerHTML = modules.map(m => `
    <div class="card" style="border-top-color:${esc(m.color)};">
      <h2>${esc(m.name)}</h2>
      <p>${esc(m.description)}</p>
      <div class="status-row">
        <span class="status-dot ${m.up ? 'up' : 'down'}"></span>
        <span>${m.up ? 'Online' : 'Offline'}</span>
      </div>
      <a class="open-btn" href="${esc(moduleUrl(m.port))}" target="_blank" rel="noopener">Open</a>
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
