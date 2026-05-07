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
  const el = document.getElementById('elapsed');
  if (el) el.classList.add('hidden');
}

chrome.runtime.onMessage.addListener(msg => {
  switch (msg.type) {
    case 'init':
      handleInit(msg);
      break;
    case 'result':
      handleResult(msg);
      break;
    case 'error':
      showError(msg.message);
      break;
  }
});

function handleInit({ title, itemId }) {
  if (title) {
    document.getElementById('post-title').textContent = title;
    document.title = `HN: ${title}`;
  }
  if (itemId) {
    const link = document.getElementById('post-link');
    link.href = `https://news.ycombinator.com/item?id=${itemId}`;
    link.classList.remove('hidden');
  }
}

function handleResult({ summary }) {
  stopElapsed();
  const el = document.getElementById('summary-content');
  el.classList.remove('loading');
  el.innerHTML = marked.parse(summary || '*(No content)*');
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
