const CAMERA_URL = 'http://localhost:8080/?action=stream';
const API_BASE   = '';  // same origin

// ── Builds ────────────────────────────────────────────────────────────────────

async function fetchBuilds() {
  try {
    const res  = await fetch(`${API_BASE}/api/builds`);
    const data = await res.json();
    renderBuilds(data);
  } catch (e) {
    console.error('builds fetch failed', e);
  }
}

function renderBuilds(builds) {
  const list = document.getElementById('builds-list');
  list.innerHTML = '';

  if (!builds.length) {
    list.innerHTML = '<div class="build-row"><span class="build-repo" style="color:var(--text-dim)">No builds found</span></div>';
    return;
  }

  for (const b of builds) {
    const row = document.createElement('div');
    row.className = `build-row ${b.status}`;

    const dotClass = { success: 'green', failure: 'red', running: 'yellow', queued: '' }[b.status] ?? '';

    row.innerHTML = `
      <span class="build-repo">${b.repo}</span>
      <span class="build-meta">${b.branch} &middot; ${b.ago}</span>
      <span class="build-status ${b.status}">
        ${dotClass ? `<span class="dot ${dotClass}"></span>` : ''}${b.status}
      </span>`;
    list.appendChild(row);
  }

  const updated = document.getElementById('builds-updated');
  updated.textContent = 'updated ' + new Date().toLocaleTimeString();
}

// ── Logs ──────────────────────────────────────────────────────────────────────

let activeHost = 'vps';
let logSocket  = null;

function connectLogs(host) {
  if (logSocket) logSocket.close();

  const output = document.getElementById('log-output');
  output.innerHTML = '<div id="log-anchor"></div>';

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  logSocket = new WebSocket(`${proto}://${location.host}/ws/logs/${host}`);

  logSocket.onmessage = (e) => {
    const anchor = document.getElementById('log-anchor');
    const line   = document.createElement('div');
    line.className = 'log-line ' + classifyLine(e.data);
    line.textContent = e.data;
    output.insertBefore(line, anchor);

    // cap at 500 lines
    const lines = output.querySelectorAll('.log-line');
    if (lines.length > 500) lines[0].remove();

    anchor.scrollIntoView({ block: 'end' });
  };

  logSocket.onerror = () => appendLogLine('output', '[ws error]', 'err');
  logSocket.onclose = () => {
    appendLogLine('log-output', '[disconnected — reconnecting in 5s]', 'warn');
    setTimeout(() => connectLogs(activeHost), 5000);
  };
}

function classifyLine(text) {
  const t = text.toLowerCase();
  if (t.includes('error') || t.includes('err ') || t.includes('fatal')) return 'err';
  if (t.includes('warn'))  return 'warn';
  return 'info';
}

function appendLogLine(containerId, text, cls) {
  const output = document.getElementById(containerId);
  const anchor = document.getElementById('log-anchor');
  const line   = document.createElement('div');
  line.className = 'log-line ' + cls;
  line.textContent = text;
  output.insertBefore(line, anchor);
}

document.getElementById('log-tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  activeHost = tab.dataset.host;
  connectLogs(activeHost);
});

// ── Camera ────────────────────────────────────────────────────────────────────

function initCamera() {
  const img     = document.getElementById('camera-feed');
  const offline = document.getElementById('camera-offline');

  img.src = CAMERA_URL;
  img.onload  = () => offline.classList.remove('visible');
  img.onerror = () => {
    offline.classList.add('visible');
    // retry every 10s
    setTimeout(initCamera, 10000);
  };
}

// ── Verse ─────────────────────────────────────────────────────────────────────

async function fetchVerse() {
  try {
    const res  = await fetch(`${API_BASE}/api/verse`);
    const data = await res.json();
    document.getElementById('verse-text').textContent = data.text;
    document.getElementById('verse-ref').textContent  = data.reference;
  } catch (e) {
    console.error('verse fetch failed', e);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

fetchBuilds();
setInterval(fetchBuilds, 60_000);

connectLogs(activeHost);

initCamera();

fetchVerse();
