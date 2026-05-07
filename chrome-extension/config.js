// Configuration for HN Summarizer — edit prompts and model settings here

const CONFIG = {
  perplexityApiUrl: 'https://api.perplexity.ai/v1/agent',
  perplexityModel: 'anthropic/claude-sonnet-4-6',
  algoliaApiUrl: 'https://hn.algolia.com/api/v1/items/',
  maxCommentChars: 100000,
  maxOutputTokens: 4096,

  // --- Timeouts (ms) ---
  algoliaTimeoutMs: 15000,
  perplexityTimeoutMs: 180000,

  // --- Prompts ---

  // Instructions sent to Perplexity for self-posts (Ask HN, Show HN, etc.)
  selfPostInstructions:
    'Summarize the HN discussion. Focus on: dominant themes and opinions, notable debates or disagreements, insightful comments, any corrections or additional context provided by commenters. Use markdown with clear headers.',

  // Instructions sent to Perplexity for link posts (article + comments)
  articleInstructions:
    'Use web_search to research the article (search by its title and URL) and gather outside reactions and related coverage from indexed content. Produce three sections:\n\n'
    + '## Article Summary\n'
    + 'Cover the main argument, key points, notable data or anecdotes, and conclusions. Base this on what you can find via web search; if the article itself is not accessible (paywall, AI-blocking, etc.), say so and summarize what indexed snippets and discussions reveal about it.\n\n'
    + '## HN Comments Summary\n'
    + 'Focus on: dominant themes and opinions, notable debates or disagreements, insightful comments, corrections or additional context provided by commenters.\n\n'
    + '## Around the Web\n'
    + 'Search for what others are saying about this article or topic outside HN: discussions on other forums (Reddit, Lobsters, Twitter/X, Mastodon), blog responses, expert takes, related reporting, follow-ups, or notable rebuttals. Summarize the range of reactions as a bulleted list (max 5 bullets) with sources linked inline. If the article makes specific factual claims, briefly note whether other sources corroborate or contradict them. Omit this section entirely if you find nothing substantive.\n\n'
    + 'Be concise but comprehensive. Use markdown.',

  // Input template for self-posts with comments
  selfPostInput: (commentsText) =>
    `Summarize the following Hacker News discussion:\n\n${commentsText}`,

  // Input template for self-posts with no comments
  selfPostEmptyInput: 'This is an Ask HN / self-post with no comments yet.',

  // Input template for link posts with comments
  articleWithCommentsInput: (articleUrl, commentsText, title) =>
    `Research and summarize this Hacker News post.\n\nArticle title: ${title || '(unknown)'}\nArticle URL: ${articleUrl}\n\nUse web_search to find the article and outside discussions of it. Then, separately summarize the Hacker News discussion below.\n\n--- HN COMMENTS ---\n\n${commentsText}`,

  // Input template for link posts without comments
  articleOnlyInput: (articleUrl, title) =>
    `Research and summarize this Hacker News article.\n\nArticle title: ${title || '(unknown)'}\nArticle URL: ${articleUrl}\n\nUse web_search to find the article and outside discussions of it.`,
};
