// Configuration for HN Summarizer — edit prompts and model settings here

const CONFIG = {
  // --- Perplexity (article research + Around-the-Web only) ---
  perplexityApiUrl: 'https://api.perplexity.ai/v1/agent',
  perplexityModel: 'anthropic/claude-sonnet-4-6',
  perplexityArticleMaxOutputTokens: 2048,
  perplexityAroundWebMaxOutputTokens: 1024,

  // --- Anthropic (final synthesis) ---
  anthropicApiUrl: 'https://api.anthropic.com/v1/messages',
  anthropicModel: 'claude-sonnet-4-6',
  anthropicMaxTokens: 4096,

  // --- Algolia (HN comments) ---
  algoliaApiUrl: 'https://hn.algolia.com/api/v1/items/',
  maxCommentChars: 100000,

  // --- Timeouts (ms) ---
  algoliaTimeoutMs: 15000,
  perplexityTimeoutMs: 60000,
  perplexityAroundWebTimeoutMs: 90000,
  anthropicTimeoutMs: 60000,

  // --- Prompts ---

  // Perplexity: detailed article research only.
  perplexityArticleInstructions:
    'Use web_search to fetch and research the article (search by title and URL). Produce a *detailed* summary of the article only — main argument, key points, notable data or anecdotes, conclusions. If the article is paywalled or AI-blocked, say so and synthesize what indexed snippets and discussions reveal about it. Do not include HN comments analysis or outside-discussion bullets — those are handled separately. Use markdown.',

  perplexityArticleInput: (articleUrl, title) =>
    `Research and summarize this article in detail.\n\nArticle title: ${title || '(unknown)'}\nArticle URL: ${articleUrl}`,

  // Perplexity: standalone "Around the Web" call.
  perplexityAroundWebInstructions:
    'Use web_search to find what others are saying about this article or topic *outside* Hacker News: discussions on other forums (Reddit, Lobsters, Twitter/X, Mastodon), blog responses, expert takes, related reporting, follow-ups, notable rebuttals. Return a markdown bulleted list (max 5 bullets) with sources linked inline. If the article makes specific factual claims, briefly note whether other sources corroborate or contradict them. If you find nothing substantive, return exactly the string: *(no notable outside discussion found)*',

  perplexityAroundWebInput: (articleUrl, title) =>
    `Find outside-of-HN reactions to this article.\n\nArticle title: ${title || '(unknown)'}\nArticle URL: ${articleUrl}`,

  // Anthropic: final synthesis combining (optional) article summary + raw HN comments.
  anthropicSystemInstructions:
    'You merge a pre-researched article summary with a Hacker News discussion thread into a concise, well-structured markdown summary. Sections:\n\n'
    + '## Article Summary\n'
    + 'Reproduce the supplied article research summary, lightly tightened for clarity. Omit this section entirely for self-posts (Ask HN / Show HN) where no article exists.\n\n'
    + '## HN Comments Summary\n'
    + 'Focus on: dominant themes and opinions, notable debates or disagreements, insightful comments, corrections or additional context provided by commenters. If comments are truncated, acknowledge it. If there are no comments, say so briefly.\n\n'
    + 'Be concise but comprehensive. Use markdown headers, bullet lists where helpful. Do not invent facts beyond the supplied inputs.',

  anthropicSynthesisInput: ({ articleSummary, commentsText, title, isSelfPost }) => {
    const header = `Hacker News post title: ${title || '(unknown)'}\n`;
    const article = isSelfPost
      ? '(This is a self-post — no external article.)'
      : (articleSummary
        ? `--- ARTICLE RESEARCH SUMMARY ---\n\n${articleSummary}`
        : '(No article research summary available.)');
    const comments = commentsText
      ? `--- HN COMMENTS (raw, threaded) ---\n\n${commentsText}`
      : '(No comments yet on this post.)';
    return `${header}\n${article}\n\n${comments}`;
  },
};
