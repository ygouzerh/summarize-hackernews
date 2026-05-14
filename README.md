# HN Summarizer

Summarize any Hacker News post — fetches the linked article and the HN discussion, then produces a combined summary using AI.

---

## Install

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select this folder
4. Click the extension icon in the toolbar, enter your **Perplexity API key** and **Anthropic API key**, and save

## Usage

Navigate to [news.ycombinator.com](https://news.ycombinator.com). Each story has a **"summarize"** link next to the comments count. Click it — a new tab opens and shows:

- **Article Summary** — the linked article fetched and summarized by Perplexity
- **HN Comments Summary** — the discussion summarized from all comments
- **Around the Web** — outside-of-HN reactions (Reddit, blogs, etc.), fetched in the background

Also works on individual post pages (`/item?id=...`).

### Ask follow-up questions

Once the summary finishes loading, a speech-bubble button appears in the bottom-right corner. Click it to open a side panel and ask anything about the post — technical clarifications, fact-checks, broader context. Each question is sent to Perplexity along with the article URL, the HN comments summary, and the prior conversation turns; `web_search` is enabled so answers can pull in fresh sources, cited inline. The conversation lives only while the panel is open — closing it resets the thread.

## How it works

1. The content script extracts the HN item ID and article URL from the page DOM
2. Comments are fetched from the [Algolia HN API](https://hn.algolia.com/api/v1/items/{id}) as structured JSON (free, no key needed)
3. A Perplexity Agent API call researches the article; Anthropic summarizes the comments in parallel chunks and synthesizes the final output
4. "Around the Web" runs as an independent Perplexity call and streams in separately
5. "Ask question" sends each turn (context + history + new question) to the Perplexity Agent API with `web_search`

## Requirements

- A [Perplexity API key](https://www.perplexity.ai/settings/api) (for article research)
- An [Anthropic API key](https://console.anthropic.com/) (for comment summarization and synthesis)

## Updating after code changes

Go to `chrome://extensions` and click the **↺ refresh** icon on the extension card. Then reload any open HN tabs.
