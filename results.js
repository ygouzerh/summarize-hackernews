// Results page: receives messages from service worker and renders summary

marked.setOptions({ breaks: true, gfm: true });

chrome.runtime.sendMessage({ type: 'ready' });

const pageStartedAt = Date.now();
const phaseStartTimes = {};
const phaseIntervals = {};
const phaseMeta = {};  // phase -> { label, elapsedMs }

// Ask-a-question state
const askState = {
  articleUrl: null,
  postTitle: null,
  summaryText: null,
  history: [],     // [{ question, answer }]
  pending: false,
};

function formatMs(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// MV3 idle-terminates the service worker, so the first message after a pause can be
// dropped while it wakes — sendMessage then resolves undefined or rejects transiently.
// Retry a few times with backoff to reliably reach the worker.
async function sendMessageWithRetry(payload, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await chrome.runtime.sendMessage(payload);
      if (response) return response;
    } catch (err) {
      if (attempt === attempts) throw err;
    }
    await new Promise(resolve => setTimeout(resolve, 200 * attempt));
  }
  return null;
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

function handleInit({ title, itemId, articleUrl, isSelfPost }) {
  if (title) {
    document.getElementById('post-title').textContent = title;
    document.title = `HN: ${title}`;
    askState.postTitle = title;
  }
  if (itemId) {
    const link = document.getElementById('post-link');
    link.href = `https://news.ycombinator.com/item?id=${itemId}`;
    link.classList.remove('hidden');
  }
  if (!isSelfPost) {
    document.getElementById('around-the-web').classList.remove('hidden');
  }
  askState.articleUrl = isSelfPost ? null : (articleUrl || null);
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
  askState.summaryText = summary || '';
  enableAskFab();
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

// ----- Ask-a-question panel -----

const askFab = document.getElementById('ask-fab');
const askPanel = document.getElementById('ask-panel');
const askClose = document.getElementById('ask-close');
const askForm = document.getElementById('ask-form');
const askInput = document.getElementById('ask-input');
const askSubmit = document.getElementById('ask-submit');
const askConversation = document.getElementById('ask-conversation');

async function enableAskFab() {
  if (!askState.summaryText) return;
  askFab.classList.remove('hidden');
  const { perplexityKey } = await chrome.storage.sync.get(['perplexityKey']);
  if (perplexityKey) {
    askFab.disabled = false;
    askFab.title = 'Ask a question';
  } else {
    askFab.disabled = true;
    askFab.title = 'Set your Perplexity API key in the extension settings to ask questions';
  }
}

function extractHnCommentsSection(summary) {
  if (!summary) return '';
  const m = summary.match(/##\s+HN Comments Summary[\s\S]*?(?=\n##\s+\S|$)/i);
  return (m ? m[0] : summary).trim();
}

function openPanel() {
  askPanel.classList.remove('hidden');
  askPanel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('ask-open');
  updateSubmitState();
  setTimeout(() => askInput.focus(), 0);
}

function closePanel() {
  askPanel.classList.add('hidden');
  askPanel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('ask-open');
  askState.history = [];
  askState.pending = false;
  askInput.value = '';
  askInput.disabled = false;
  resetConversationDom();
  updateSubmitState();
}

function resetConversationDom() {
  askConversation.innerHTML = '';
  const empty = document.createElement('p');
  empty.className = 'ask-empty';
  empty.textContent = 'Ask anything about this post — the HN comments summary and the article are available as context.';
  askConversation.appendChild(empty);
}

function updateSubmitState() {
  const hasText = askInput.value.trim().length > 0;
  askSubmit.disabled = askState.pending || !hasText;
}

function appendQuestion(text) {
  const empty = askConversation.querySelector('.ask-empty');
  if (empty) empty.remove();
  const q = document.createElement('div');
  q.className = 'ask-turn-question';
  q.textContent = text;
  askConversation.appendChild(q);
  return q;
}

function appendLoadingAnswer() {
  const a = document.createElement('div');
  a.className = 'ask-turn-answer loading';
  a.innerHTML = '<div class="spinner"></div><span>Thinking…</span>';
  askConversation.appendChild(a);
  return a;
}

function renderAnswer(node, markdown) {
  node.classList.remove('loading');
  node.innerHTML = marked.parse(markdown || '*(no answer)*');
}

function renderAnswerError(node, message) {
  node.classList.remove('loading');
  node.classList.add('error');
  node.textContent = `Error: ${message}`;
}

async function submitQuestion() {
  const question = askInput.value.trim();
  if (!question || askState.pending) return;

  askState.pending = true;
  askInput.disabled = true;
  updateSubmitState();

  appendQuestion(question);
  const answerNode = appendLoadingAnswer();
  askInput.value = '';

  const payload = {
    action: 'ask-question',
    title: askState.postTitle,
    articleUrl: askState.articleUrl,
    hnCommentsSummary: extractHnCommentsSection(askState.summaryText),
    history: askState.history,
    question,
  };

  try {
    const response = await sendMessageWithRetry(payload);
    if (!answerNode.isConnected) return; // panel was closed mid-request — discard
    if (!response) {
      renderAnswerError(answerNode, 'No response from extension service worker.');
    } else if (response.error) {
      renderAnswerError(answerNode, response.error);
    } else {
      renderAnswer(answerNode, response.answer);
      askState.history.push({ question, answer: response.answer || '' });
    }
  } catch (err) {
    if (answerNode.isConnected) renderAnswerError(answerNode, err.message || String(err));
  } finally {
    if (askPanel.classList.contains('hidden')) return;
    askState.pending = false;
    askInput.disabled = false;
    updateSubmitState();
    askInput.focus();
  }
}

askFab.addEventListener('click', () => {
  if (askFab.disabled) return;
  openPanel();
});

askClose.addEventListener('click', closePanel);

askInput.addEventListener('input', updateSubmitState);

askInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitQuestion();
  }
});

askForm.addEventListener('submit', e => {
  e.preventDefault();
  submitQuestion();
});
