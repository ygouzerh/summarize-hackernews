// Results page: receives messages from service worker and renders summary

marked.setOptions({ breaks: true, gfm: true });

chrome.runtime.sendMessage({ type: 'ready' });

const pageStartedAt = Date.now();
const phaseStartTimes = {};
const phaseIntervals = {};
const phaseMeta = {};  // phase -> { label, elapsedMs }

function formatMs(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

chrome.runtime.onMessage.addListener(msg => {
  switch (msg.type) {
    case 'init':                 handleInit(msg); break;
    case 'result':               handleResult(msg); break;
    case 'around-the-web':       handleAroundTheWeb(msg); break;
    case 'around-the-web-error': handleAroundTheWebError(msg); break;
    case 'error':                showError(msg.message); break;
    case 'phase-start':          handlePhaseStart(msg); break;
    case 'phase-done':           handlePhaseDone(msg); break;
  }
});

function handlePhaseStart({ phase, label }) {
  const row = document.getElementById(`phase-${phase}`);
  if (!row) return;
  if (label) row.querySelector('.phase-label').textContent = label;
  row.querySelector('.phase-status').innerHTML = '<div class="spinner"></div>';
  row.className = 'phase-row phase-running';
  phaseStartTimes[phase] = Date.now();
  phaseMeta[phase] = { label: label || phase, elapsedMs: null };
  phaseIntervals[phase] = setInterval(() => {
    const timeEl = row.querySelector('.phase-time');
    if (timeEl) timeEl.textContent = formatMs(Date.now() - phaseStartTimes[phase]);
  }, 500);
}

function handlePhaseDone({ phase, elapsedMs }) {
  clearInterval(phaseIntervals[phase]);
  const row = document.getElementById(`phase-${phase}`);
  if (!row) return;
  row.className = 'phase-row phase-done';
  row.querySelector('.phase-status').textContent = '✓';
  row.querySelector('.phase-time').textContent = formatMs(elapsedMs);
  if (phaseMeta[phase]) phaseMeta[phase].elapsedMs = elapsedMs;
}

function handleInit({ title, itemId, isSelfPost }) {
  if (title) {
    document.getElementById('post-title').textContent = title;
    document.title = `HN: ${title}`;
  }
  if (itemId) {
    const link = document.getElementById('post-link');
    link.href = `https://news.ycombinator.com/item?id=${itemId}`;
    link.classList.remove('hidden');
  }
  if (!isSelfPost) {
    document.getElementById('around-the-web').classList.remove('hidden');
  }
}

function handleResult({ summary, synthesisElapsedMs }) {
  if (synthesisElapsedMs != null && phaseMeta.synthesis) {
    phaseMeta.synthesis.elapsedMs = synthesisElapsedMs;
  }
  Object.values(phaseIntervals).forEach(clearInterval);
  const el = document.getElementById('summary-content');
  el.classList.remove('loading');
  el.innerHTML = marked.parse(summary || '*(No content)*');
  populateTimings();
}

function populateTimings() {
  const content = document.getElementById('timing-content');
  const section = document.getElementById('timing-section');
  if (!content || !section) return;

  const phaseOrder = ['research', 'chunks', 'synthesis'];
  const rows = phaseOrder
    .filter(p => phaseMeta[p]?.elapsedMs != null)
    .map(p => `<div class="timing-row"><span>${phaseMeta[p].label}</span><span>${formatMs(phaseMeta[p].elapsedMs)}</span></div>`)
    .join('');

  const totalMs = Date.now() - pageStartedAt;
  content.innerHTML = rows
    + `<div class="timing-row timing-total"><span>Total</span><span>${formatMs(totalMs)}</span></div>`;

  section.classList.remove('hidden');
}

function handleAroundTheWeb({ text }) {
  const section = document.getElementById('around-the-web');
  const el = document.getElementById('around-the-web-content');
  section.classList.remove('hidden');
  el.classList.remove('loading');
  el.innerHTML = marked.parse(text || '*(no notable outside discussion found)*');
}

function handleAroundTheWebError({ message }) {
  const el = document.getElementById('around-the-web-content');
  el.classList.remove('loading');
  el.innerHTML = `<em>Could not load outside reactions: ${escapeHtml(message)}</em>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showError(message) {
  Object.values(phaseIntervals).forEach(clearInterval);
  const banner = document.getElementById('error-banner');
  banner.classList.remove('hidden');
  banner.innerHTML = '';

  const summary = document.createElement('strong');
  summary.textContent = 'Error loading summary';
  banner.appendChild(summary);

  const details = document.createElement('pre');
  details.style.cssText = 'margin-top:8px;white-space:pre-wrap;word-break:break-word;font-size:0.85em;opacity:0.9;';
  details.textContent = message;
  banner.appendChild(details);

  const el = document.getElementById('summary-content');
  el.classList.remove('loading');
  el.innerHTML = '<em>Could not load summary.</em>';
}
