// Results page: receives messages from service worker and renders summary

marked.setOptions({ breaks: true, gfm: true });

chrome.runtime.sendMessage({ type: 'ready' });

const startedAt = Date.now();
const elapsedTimer = setInterval(updateElapsed, 1000);
updateElapsed();

function updateElapsed() {
  const el = document.getElementById('elapsed');
  if (!el) return;
  const s = Math.floor((Date.now() - startedAt) / 1000);
  const m = Math.floor(s / 60);
  el.textContent = `${m}:${String(s % 60).padStart(2, '0')}`;
}

function stopElapsed() {
  clearInterval(elapsedTimer);
}

chrome.runtime.onMessage.addListener(msg => {
  switch (msg.type) {
    case 'init':              handleInit(msg); break;
    case 'result':            handleResult(msg); break;
    case 'around-the-web':   handleAroundTheWeb(msg); break;
    case 'around-the-web-error': handleAroundTheWebError(msg); break;
    case 'error':             showError(msg.message); break;
    case 'chunk-start':       handleChunkStart(msg); break;
    case 'chunk-done':        handleChunkDone(msg); break;
  }
});

const chunkStartTimes = {};
const chunkDoneInfo = {};
let chunkTickInterval = null;

function formatMs(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function ensureChunkGrid(totalChunks) {
  const container = document.getElementById('chunk-status');
  if (!container.classList.contains('hidden')) return;
  container.classList.remove('hidden');
  for (let i = 0; i < totalChunks; i++) {
    const pill = document.createElement('div');
    pill.id = `chunk-pill-${i}`;
    pill.className = 'chunk-pill';
    pill.innerHTML = `<span class="chunk-num">${i + 1}</span><span class="chunk-icon">○</span><span class="chunk-time">—</span>`;
    container.appendChild(pill);
  }
}

function renderChunkPill(i) {
  const pill = document.getElementById(`chunk-pill-${i}`);
  if (!pill) return;
  const done = chunkDoneInfo[i];
  if (done) {
    pill.className = `chunk-pill ${done.success ? 'chunk-done' : 'chunk-error'}`;
    pill.querySelector('.chunk-icon').textContent = done.success ? '✓' : '✗';
    pill.querySelector('.chunk-time').textContent = formatMs(done.elapsedMs);
  } else if (chunkStartTimes[i]) {
    pill.className = 'chunk-pill chunk-running';
    pill.querySelector('.chunk-icon').textContent = '⟳';
    pill.querySelector('.chunk-time').textContent = formatMs(Date.now() - chunkStartTimes[i]);
  }
}

function handleChunkStart({ chunkIndex, totalChunks }) {
  chunkStartTimes[chunkIndex] = Date.now();
  ensureChunkGrid(totalChunks);
  renderChunkPill(chunkIndex);
  if (!chunkTickInterval) {
    chunkTickInterval = setInterval(() => {
      Object.keys(chunkStartTimes).forEach(i => {
        if (!chunkDoneInfo[i]) renderChunkPill(Number(i));
      });
    }, 500);
  }
}

function handleChunkDone({ chunkIndex, totalChunks, elapsedMs, success }) {
  chunkDoneInfo[chunkIndex] = { elapsedMs, success };
  renderChunkPill(chunkIndex);
  if (Object.keys(chunkDoneInfo).length === totalChunks) {
    clearInterval(chunkTickInterval);
    chunkTickInterval = null;
  }
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

function handleResult({ summary }) {
  stopElapsed();
  const totalMs = Date.now() - startedAt;
  const s = Math.floor(totalMs / 1000);
  const totalStr = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const el = document.getElementById('summary-content');
  el.classList.remove('loading');
  el.innerHTML = marked.parse(summary || '*(No content)*')
    + `<p class="total-time">Generated in ${totalStr}</p>`;
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
  stopElapsed();
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
