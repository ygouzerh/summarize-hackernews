// Configuration for HN Summarizer — edit prompts and model settings here

const CONFIG = {
  // --- Perplexity (article research + Around-the-Web only) ---
  perplexityApiUrl: 'https://api.perplexity.ai/v1/agent',
  perplexityModel: 'anthropic/claude-sonnet-4-6',
  perplexityArticleMaxOutputTokens: 2048,
  perplexityAroundWebMaxOutputTokens: 1024,

  // --- Anthropic (chunk summaries + final synthesis) ---
  anthropicApiUrl: 'https://api.anthropic.com/v1/messages',
  anthropicModel: 'claude-sonnet-4-6',
  anthropicMaxTokens: 4096,        // final synthesis
  anthropicChunkMaxTokens: 1024,   // per-chunk comment summarization

  // --- Algolia (HN comments) ---
  algoliaApiUrl: 'https://hn.algolia.com/api/v1/items/',
  maxCommentChars: 100000,
  commentChunks: 5,                          // number of parallel chunk calls
  maxArticleSummaryCharsForChunk: 500,       // brief article context sent with each chunk

  // --- Timeouts (ms) ---
  algoliaTimeoutMs: 15000,
  perplexityTimeoutMs: 60000,
  perplexityAroundWebTimeoutMs: 90000,
  anthropicTimeoutMs: 60000,

  // --- Prompts ---

  // Perplexity: detailed article research only.
  perplexityArticleInstructions:
    'Use web_search to fetch and research the article (search by title and URL). Structure the output as follows:\n\n'
    + '1. **One-sentence TL;DR** — the core claim or finding in plain language.\n'
    + '2. **Key points** — 4–6 bullet points covering the main argument, notable data, anecdotes, or sub-claims.\n'
    + '3. **Bottom line** — 1–2 sentences on the conclusion or takeaway.\n\n'
    + 'If the article is paywalled or AI-blocked, say so briefly and synthesize what indexed snippets reveal, using the same structure. Do not include HN comments or outside-discussion — those are handled separately.',

  perplexityArticleInput: (articleUrl, title) =>
    `Research and summarize this article in detail.\n\nArticle title: ${title || '(unknown)'}\nArticle URL: ${articleUrl}`,

  // Perplexity: standalone "Around the Web" call.
  perplexityAroundWebInstructions:
    'Use web_search to find what others are saying about this article or topic *outside* Hacker News: discussions on other forums (Reddit, Lobsters, Twitter/X, Mastodon), blog responses, expert takes, related reporting, follow-ups, notable rebuttals. Structure the output with 2–3 short markdown sections using bold labels (e.g. **General consensus**, **Counterpoints**, **Notable coverage**) — only include a section if you have something to say. Each section is 1–3 sentences with source names woven in inline. Do not use bullet lists. If you find nothing substantive, return exactly the string: *(no notable outside discussion found)*',

  perplexityAroundWebInput: (articleUrl, title) =>
    `Find outside-of-HN reactions to this article.\n\nArticle title: ${title || '(unknown)'}\nArticle URL: ${articleUrl}`,

  // Anthropic: final synthesis combining (optional) article summary + raw HN comments.
  anthropicSystemInstructions:
    'You merge a pre-researched article summary with a Hacker News discussion thread into a concise, well-structured markdown summary. Sections:\n\n'
    + '## Article Summary\n'
    + 'Reproduce the supplied article research summary, preserving its structure (TL;DR line, key-points bullets, bottom line). Tighten wording only. Omit this section entirely for self-posts (Ask HN / Show HN) where no article exists.\n\n'
    + '## HN Comments Summary\n'
    + 'Use ### sub-headers for each theme or debate (3–5 max). Under each sub-header, write 2–3 tight sentences — no bullet lists. Name specific commenters inline when they made a notable point (e.g. "ZrArm argued…"). Keep the whole section under 300 words. If comments are truncated, acknowledge it briefly. If there are no comments, say so in one sentence.\n\n'
    + 'Do not invent facts beyond the supplied inputs.',

  anthropicSynthesisInput: ({ articleSummary, chunkSummaries, title, isSelfPost }) => {
    const header = `Hacker News post title: ${title || '(unknown)'}\n`;
    const article = isSelfPost
      ? '(This is a self-post — no external article.)'
      : (articleSummary
        ? `--- ARTICLE RESEARCH SUMMARY ---\n\n${articleSummary}`
        : '(No article research summary available.)');
    const comments = chunkSummaries && chunkSummaries.length
      ? `--- HN COMMENTS (pre-summarized in ${chunkSummaries.length} groups) ---\n\n`
        + chunkSummaries.map((s, i) => `### Thread Group ${i + 1} of ${chunkSummaries.length}\n${s}`).join('\n\n')
      : '(No comments yet on this post.)';
    return `${header}\n${article}\n\n${comments}`;
  },

  // Anthropic: per-chunk comment summarization.
  anthropicChunkSystemInstructions:
    'You summarize a subset of Hacker News comment threads. Extract the key points only: dominant themes, notable debates, standout individual comments (name the commenter), factual corrections. Be tight — aim for 5–8 bullets max. Do not invent facts.',

  anthropicChunkInput: ({ chunkText, briefArticleSummary, title, chunkIndex, totalChunks }) => {
    const header = `HN post: ${title || '(unknown)'} — comment group ${chunkIndex + 1} of ${totalChunks}\n`;
    const context = briefArticleSummary
      ? `Article context: ${briefArticleSummary}\n\n`
      : '';
    return `${header}${context}--- COMMENT THREADS ---\n\n${chunkText}`;
  },
};
