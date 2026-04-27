// Service worker: fetch HN comments via Algolia, then one Perplexity call for everything
// Config is loaded via importScripts (see manifest)

importScripts('config.js');

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action !== 'summarize') return;
  handleSummarize(msg).then(sendResponse).catch(err => sendResponse({ error: err.message }));
  return true; // keep message channel open for async response
});

async function handleSummarize({ itemId, articleUrl, title }) {
  // Open results tab immediately
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL('results.html') });
  const tabId = tab.id;
  console.log('[HN] Results tab opened, waiting for ready signal...');

  await waitForResultsReady(tabId);
  console.log('[HN] Results page ready. Sending init...');
  await sendToTab(tabId, { type: 'init', title, itemId, articleUrl });

  const { perplexityKey } = await chrome.storage.sync.get(['perplexityKey']);
  if (!perplexityKey) {
    await sendToTab(tabId, { type: 'error', message: 'Perplexity API key not set. Click the extension icon to configure it.' });
    return;
  }
  console.log('[HN] API key found. Starting Algolia + Perplexity calls...');

  try {
    // Fetch comments from Algolia (fast, no AI needed)
    const commentsText = await fetchAlgoliaComments(itemId);

    // One Perplexity call: fetch article + summarize both
    const summary = await fetchCombinedSummary(articleUrl, commentsText, perplexityKey);
    await sendToTab(tabId, { type: 'result', summary });
  } catch (err) {
    console.error('[HN] Error:', err);
    await sendToTab(tabId, { type: 'error', message: err.message });
  }
}

async function fetchAlgoliaComments(itemId) {
  console.log('[HN] Fetching Algolia comments for item', itemId);
  const res = await fetch(CONFIG.algoliaApiUrl + itemId);
  console.log('[HN] Algolia response status:', res.status);
  if (!res.ok) throw new Error(`Algolia API ${res.status}`);
  const data = await res.json();

  const flat = flattenComments(data);
  if (!flat.trim()) {
    console.log('[HN] No comments found');
    return null;
  }

  console.log('[HN] Comments fetched, length:', flat.length);
  return flat.length > CONFIG.maxCommentChars
    ? flat.slice(0, CONFIG.maxCommentChars) + '\n\n*(comments truncated due to length)*'
    : flat;
}

async function fetchCombinedSummary(articleUrl, commentsText, apiKey) {
  const isSelfPost = !articleUrl || articleUrl.startsWith('https://news.ycombinator.com');
  console.log('[HN] Calling Perplexity API. isSelfPost:', isSelfPost, 'articleUrl:', articleUrl);

  let input;
  if (isSelfPost) {
    input = commentsText
      ? CONFIG.selfPostInput(commentsText)
      : CONFIG.selfPostEmptyInput;
  } else {
    input = commentsText
      ? CONFIG.articleWithCommentsInput(articleUrl, commentsText)
      : CONFIG.articleOnlyInput(articleUrl);
  }

  const instructions = isSelfPost
    ? CONFIG.selfPostInstructions
    : CONFIG.articleInstructions;

  const payload = {
    model: CONFIG.perplexityModel,
    input,
    tools: isSelfPost ? [] : [{ type: 'fetch_url' }],
    instructions,
    max_output_tokens: CONFIG.maxOutputTokens,
  };

  const res = await fetch(CONFIG.perplexityApiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  console.log('[HN] Perplexity response status:', res.status);
  if (!res.ok) {
    const text = await res.text();
    const headers = Object.fromEntries(res.headers.entries());
    console.error('[HN] Perplexity error:', {
      status: res.status,
      statusText: res.statusText,
      headers,
      body: text.slice(0, 2000),
      model: CONFIG.perplexityModel,
      url: CONFIG.perplexityApiUrl,
    });
    let detail = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text);
      detail = parsed.error?.message || parsed.detail || parsed.message || detail;
    } catch { /* not JSON, use raw text */ }
    throw new Error(`Perplexity API error ${res.status} (${res.statusText}): ${detail}`);
  }

  const data = await res.json();
  const texts = (data.output || [])
    .filter(o => o.type === 'message')
    .flatMap(o => (o.content || []).map(c => c.text))
    .filter(Boolean);

  console.log('[HN] Perplexity returned', texts.length, 'message segments');
  return texts.join('\n\n') || '*(Perplexity returned no content)*';
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
