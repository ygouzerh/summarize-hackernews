// Service worker: Algolia (comments) + Perplexity (article research) → Anthropic (final synthesis).
// A separate Perplexity "Around the Web" call runs in the background and streams its result to
// the results tab independently — it never blocks the main summary.

importScripts('config.js');

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'summarize') {
    handleSummarize(msg).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true; // keep message channel open for async response
  }
  if (msg.action === 'ask-question') {
    handleAskQuestion(msg).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

async function handleSummarize({ itemId, articleUrl, title }) {
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL('results.html') });
  const tabId = tab.id;
  console.log('[HN] Results tab opened, waiting for ready signal...');

  await waitForResultsReady(tabId);
  const isSelfPost = !articleUrl || articleUrl.startsWith('https://news.ycombinator.com');
  console.log('[HN] Results page ready. Sending init... isSelfPost:', isSelfPost);
  await sendToTab(tabId, { type: 'init', title, itemId, articleUrl, isSelfPost });

  const { perplexityKey, anthropicKey } = await chrome.storage.sync.get(['perplexityKey', 'anthropicKey']);
  if (!anthropicKey) {
    await sendToTab(tabId, { type: 'error', message: 'Anthropic API key not set. Click the extension icon to configure it.' });
    return;
  }
  if (!isSelfPost && !perplexityKey) {
    await sendToTab(tabId, { type: 'error', message: 'Perplexity API key not set. Click the extension icon to configure it.' });
    return;
  }
  console.log('[HN] Keys present. Starting pipeline...');

  // Fire "Around the Web" in the background — does NOT block the main pipeline.
  if (!isSelfPost) {
    fetchPerplexityAroundTheWeb({ articleUrl, title }, perplexityKey)
      .then(text => sendToTab(tabId, { type: 'around-the-web', text }))
      .catch(err => {
        console.error('[HN] Around-the-Web error:', err);
        sendToTab(tabId, { type: 'around-the-web-error', message: err.message });
      });
  }

  try {
    const phase1Start = Date.now();
    sendToTab(tabId, { type: 'phase-start', phase: 'research', label: isSelfPost ? 'Fetching comments' : 'Researching article' });
    const [algoliaData, articleSummary] = await Promise.all([
      fetchAlgoliaComments(itemId),
      isSelfPost
        ? Promise.resolve(null)
        : fetchPerplexityArticleSummary({ articleUrl, title }, perplexityKey),
    ]);
    sendToTab(tabId, { type: 'phase-done', phase: 'research', elapsedMs: Date.now() - phase1Start });

    const threadChunks = splitIntoThreadChunks(algoliaData, CONFIG.commentChunks);
    console.log('[HN] Split into', threadChunks.length, 'thread chunks');

    const briefArticleSummary = articleSummary
      ? articleSummary.slice(0, CONFIG.maxArticleSummaryCharsForChunk)
      : null;

    const phase2Start = Date.now();
    sendToTab(tabId, { type: 'phase-start', phase: 'chunks', label: 'Summarizing comments' });
    const totalChunks = threadChunks.length;
    const chunkSummaries = totalChunks
      ? await Promise.all(
          threadChunks.map((chunkText, i) =>
            fetchAnthropicChunkSummary({ chunkText, briefArticleSummary, title, chunkIndex: i, totalChunks }, anthropicKey),
          ),
        )
      : [];
    sendToTab(tabId, { type: 'phase-done', phase: 'chunks', elapsedMs: Date.now() - phase2Start });

    const phase3Start = Date.now();
    sendToTab(tabId, { type: 'phase-start', phase: 'synthesis', label: 'Generating final summary' });
    const summary = await fetchAnthropicSynthesis(
      { articleSummary, chunkSummaries, title, isSelfPost },
      anthropicKey,
    );
    await sendToTab(tabId, { type: 'result', summary, synthesisElapsedMs: Date.now() - phase3Start });
  } catch (err) {
    console.error('[HN] Error:', err);
    await sendToTab(tabId, { type: 'error', message: err.message });
  }
}

async function fetchWithTimeout(url, options, timeoutMs, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s. The site may be slow or blocking automated access — try again or open the article directly.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAlgoliaComments(itemId) {
  console.log('[HN] Fetching Algolia comments for item', itemId);
  const res = await fetchWithTimeout(
    CONFIG.algoliaApiUrl + itemId,
    {},
    CONFIG.algoliaTimeoutMs,
    'Algolia comments fetch',
  );
  console.log('[HN] Algolia response status:', res.status);
  if (!res.ok) throw new Error(`Algolia API ${res.status}`);
  return res.json();
}

function splitIntoThreadChunks(data, n) {
  const topLevel = (data.children || []).filter(c => c.author && c.text);
  if (!topLevel.length) return [];

  const chunks = Array.from({ length: n }, () => []);
  topLevel.forEach((thread, i) => chunks[i % n].push(thread));

  return chunks
    .filter(c => c.length > 0)
    .map(threads => {
      const flat = threads.map(t => flattenComments(t)).join('');
      const maxPerChunk = Math.floor(CONFIG.maxCommentChars / n);
      return flat.length > maxPerChunk
        ? flat.slice(0, maxPerChunk) + '\n\n*(truncated)*'
        : flat;
    })
    .filter(text => text.trim());
}

async function fetchAnthropicChunkSummary({ chunkText, briefArticleSummary, title, chunkIndex, totalChunks }, apiKey) {
  const userContent = CONFIG.anthropicChunkInput({ chunkText, briefArticleSummary, title, chunkIndex, totalChunks });
  const payload = {
    model: CONFIG.anthropicModel,
    max_tokens: CONFIG.anthropicChunkMaxTokens,
    system: CONFIG.anthropicChunkSystemInstructions,
    messages: [{ role: 'user', content: userContent }],
  };

  console.log(`[HN] Anthropic chunk ${chunkIndex + 1}/${totalChunks} — content: ${userContent.length} chars`);

  const res = await fetchWithTimeout(
    CONFIG.anthropicApiUrl,
    {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    CONFIG.anthropicTimeoutMs,
    `Anthropic chunk ${chunkIndex + 1}`,
  );

  if (!res.ok) {
    const text = await res.text();
    let detail = text.slice(0, 300);
    try { detail = JSON.parse(text).error?.message || detail; } catch { /* not JSON */ }
    throw new Error(`Anthropic chunk ${chunkIndex + 1} error ${res.status}: ${detail}`);
  }

  const data = await res.json();
  return (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n\n') || '';
}

async function callPerplexity({ input, instructions, maxOutputTokens, timeoutMs, label, logKey }, apiKey) {
  const payload = {
    model: CONFIG.perplexityModel,
    input,
    tools: [{ type: 'web_search' }],
    instructions,
    max_output_tokens: maxOutputTokens,
  };

  const payloadJson = JSON.stringify(payload, null, 2);
  console.log(`[HN] Perplexity (${label}) — input:`, input.length, 'chars | instructions:', instructions.length, 'chars | total JSON:', payloadJson.length, 'chars');
  await chrome.storage.local.set({
    [`lastPromptLog_${logKey}`]: {
      ts: new Date().toISOString(),
      payload,
    },
  });

  const res = await fetchWithTimeout(
    CONFIG.perplexityApiUrl,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: payloadJson,
    },
    timeoutMs,
    label,
  );

  console.log(`[HN] Perplexity (${label}) response status:`, res.status);
  if (!res.ok) {
    const text = await res.text();
    console.error(`[HN] Perplexity (${label}) error:`, {
      status: res.status,
      statusText: res.statusText,
      body: text.slice(0, 2000),
    });
    let detail = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text);
      detail = parsed.error?.message || parsed.detail || parsed.message || detail;
    } catch { /* not JSON */ }
    throw new Error(`Perplexity API error ${res.status} (${res.statusText}): ${detail}`);
  }

  const data = await res.json();
  const texts = (data.output || [])
    .filter(o => o.type === 'message')
    .flatMap(o => (o.content || []).map(c => c.text))
    .filter(Boolean);

  console.log(`[HN] Perplexity (${label}) returned`, texts.length, 'message segments');
  return texts.join('\n\n') || '';
}

function fetchPerplexityArticleSummary({ articleUrl, title }, apiKey) {
  return callPerplexity({
    input: CONFIG.perplexityArticleInput(articleUrl, title),
    instructions: CONFIG.perplexityArticleInstructions,
    maxOutputTokens: CONFIG.perplexityArticleMaxOutputTokens,
    timeoutMs: CONFIG.perplexityTimeoutMs,
    label: 'article research',
    logKey: 'perplexity_article',
  }, apiKey);
}

function fetchPerplexityAroundTheWeb({ articleUrl, title }, apiKey) {
  return callPerplexity({
    input: CONFIG.perplexityAroundWebInput(articleUrl, title),
    instructions: CONFIG.perplexityAroundWebInstructions,
    maxOutputTokens: CONFIG.perplexityAroundWebMaxOutputTokens,
    timeoutMs: CONFIG.perplexityAroundWebTimeoutMs,
    label: 'around the web',
    logKey: 'perplexity_around_web',
  }, apiKey);
}

async function handleAskQuestion({ title, articleUrl, hnCommentsSummary, history, question }) {
  const { perplexityKey } = await chrome.storage.sync.get(['perplexityKey']);
  if (!perplexityKey) {
    return { error: 'Perplexity API key not set. Click the extension icon to configure it.' };
  }
  const answer = await callPerplexity({
    input: CONFIG.perplexityQaInput({ title, articleUrl, hnCommentsSummary, history, question }),
    instructions: CONFIG.perplexityQaInstructions,
    maxOutputTokens: CONFIG.perplexityQaMaxOutputTokens,
    timeoutMs: CONFIG.perplexityQaTimeoutMs,
    label: 'Q&A',
    logKey: 'perplexity_qa',
  }, perplexityKey);
  return { answer };
}

async function fetchAnthropicSynthesis({ articleSummary, chunkSummaries, title, isSelfPost }, apiKey) {
  const userContent = CONFIG.anthropicSynthesisInput({ articleSummary, chunkSummaries, title, isSelfPost });
  const payload = {
    model: CONFIG.anthropicModel,
    max_tokens: CONFIG.anthropicMaxTokens,
    system: CONFIG.anthropicSystemInstructions,
    messages: [{ role: 'user', content: userContent }],
  };

  const payloadJson = JSON.stringify(payload, null, 2);
  console.log('[HN] Anthropic synthesis — user content:', userContent.length, 'chars | chunks:', chunkSummaries?.length ?? 0, '| total JSON:', payloadJson.length, 'chars');
  await chrome.storage.local.set({
    lastPromptLog_anthropic: {
      ts: new Date().toISOString(),
      payload,
    },
  });

  const res = await fetchWithTimeout(
    CONFIG.anthropicApiUrl,
    {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: payloadJson,
    },
    CONFIG.anthropicTimeoutMs,
    'Anthropic synthesis',
  );

  console.log('[HN] Anthropic response status:', res.status);
  if (!res.ok) {
    const text = await res.text();
    console.error('[HN] Anthropic error:', {
      status: res.status,
      statusText: res.statusText,
      body: text.slice(0, 2000),
    });
    let detail = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text);
      detail = parsed.error?.message || parsed.message || detail;
    } catch { /* not JSON */ }
    throw new Error(`Anthropic API error ${res.status} (${res.statusText}): ${detail}`);
  }

  const data = await res.json();
  const texts = (data.content || [])
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .filter(Boolean);

  console.log('[HN] Anthropic returned', texts.length, 'text segments');
  return texts.join('\n\n') || '*(Anthropic returned no content)*';
}

function flattenComments(node, depth = 0) {
  let result = '';
  if (node.text && node.author) {
    const indent = '  '.repeat(depth);
    const text = stripHtml(node.text);
    result += `${indent}${node.author}: ${text}\n\n`;
  }
  for (const child of (node.children || [])) {
    result += flattenComments(child, depth + 1);
  }
  return result;
}

function stripHtml(html) {
  return html
    .replace(/<p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function waitForResultsReady(tabId) {
  return new Promise(resolve => {
    const listener = (msg, sender) => {
      if (msg.type === 'ready' && sender.tab?.id === tabId) {
        chrome.runtime.onMessage.removeListener(listener);
        resolve();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    setTimeout(resolve, 3000);
  });
}

async function sendToTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Tab may have been closed; ignore
  }
}
