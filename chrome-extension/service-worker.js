// Service worker: fetch HN comments via Algolia, then one Perplexity call for everything

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/v1/agent';
const PERPLEXITY_MODEL = 'anthropic/claude-sonnet-4-6';
const ALGOLIA_API_URL = 'https://hn.algolia.com/api/v1/items/';
const MAX_COMMENT_CHARS = 100000;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action !== 'summarize') return;
  handleSummarize(msg).then(sendResponse).catch(err => sendResponse({ error: err.message }));
  return true; // keep message channel open for async response
});

async function handleSummarize({ itemId, articleUrl, title }) {
  // Open results tab immediately
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL('results.html') });
  const tabId = tab.id;

  await waitForResultsReady(tabId);
  await sendToTab(tabId, { type: 'init', title, itemId, articleUrl });

  const { perplexityKey } = await chrome.storage.sync.get(['perplexityKey']);
  if (!perplexityKey) {
    await sendToTab(tabId, { type: 'error', message: 'Perplexity API key not set. Click the extension icon to configure it.' });
    return;
  }

  try {
    // Fetch comments from Algolia (fast, no AI needed)
    const commentsText = await fetchAlgoliaComments(itemId);

    // One Perplexity call: fetch article + summarize both
    const summary = await fetchCombinedSummary(articleUrl, commentsText, perplexityKey);
    await sendToTab(tabId, { type: 'result', summary });
  } catch (err) {
    await sendToTab(tabId, { type: 'error', message: err.message });
  }
}

async function fetchAlgoliaComments(itemId) {
  const res = await fetch(ALGOLIA_API_URL + itemId);
  if (!res.ok) throw new Error(`Algolia API ${res.status}`);
  const data = await res.json();

  const flat = flattenComments(data);
  if (!flat.trim()) return null;

  return flat.length > MAX_COMMENT_CHARS
    ? flat.slice(0, MAX_COMMENT_CHARS) + '\n\n*(comments truncated due to length)*'
    : flat;
}

async function fetchCombinedSummary(articleUrl, commentsText, apiKey) {
  const isSelfPost = !articleUrl || articleUrl.startsWith('https://news.ycombinator.com');

  let input;
  if (isSelfPost) {
    input = commentsText
      ? `Summarize the following Hacker News discussion:\n\n${commentsText}`
      : 'This is an Ask HN / self-post with no comments yet.';
  } else {
    input = commentsText
      ? `Fetch the article at this URL and summarize it: ${articleUrl}\n\nThen, separately summarize the Hacker News discussion below.\n\n--- HN COMMENTS ---\n\n${commentsText}`
      : `Fetch and summarize the article at this URL: ${articleUrl}`;
  }

  const instructions = isSelfPost
    ? 'Summarize the HN discussion. Focus on: dominant themes and opinions, notable debates or disagreements, insightful comments, any corrections or additional context provided by commenters. Use markdown with clear headers.'
    : 'Use fetch_url to retrieve the full article. Then produce two sections:\n\n## 📰 Article Summary\nCover the main argument, key points, notable data or anecdotes, and conclusions.\n\n## 💬 HN Comments Summary\nFocus on: dominant themes and opinions, notable debates or disagreements, insightful comments, corrections or additional context provided by commenters.\n\nBe concise but comprehensive. Use markdown.';

  const payload = {
    model: PERPLEXITY_MODEL,
    input,
    tools: isSelfPost ? [] : [{ type: 'fetch_url' }],
    instructions,
    max_output_tokens: 4096,
  };

  const res = await fetch(PERPLEXITY_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Perplexity API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const texts = (data.output || [])
    .filter(o => o.type === 'message')
    .flatMap(o => (o.content || []).map(c => c.text))
    .filter(Boolean);

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
