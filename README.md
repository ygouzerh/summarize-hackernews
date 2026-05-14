# HN Summarizer

Summarize any Hacker News post — fetches the linked article and the HN discussion, then produces a combined summary using AI.

---

## Install

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select this folder
4. Click the extension icon in the toolbar, enter your **Perplexity API key** and **Anthropic API key**, and save

## Usage

Navigate to [news.ycombinator.com](https://news.ycombinator.com). Each story will have a **"summarize"** link next to the comments count. Click it — a new tab opens and shows:

- **Article Summary** — the linked article fetched and summarized by Perplexity
- **HN Comments Summary** — the discussion summarized from all comments

Also works on individual post pages (`/item?id=...`).

## How it works

1. The content script extracts the HN item ID and article URL from the page DOM
2. Comments are fetched from the [Algolia HN API](https://hn.algolia.com/api/v1/items/{id}) as structured JSON (free, no key needed)
3. A Perplexity Agent API call researches the article; Anthropic summarizes the comments in parallel chunks and synthesizes the final output

## Requirements

- A [Perplexity API key](https://www.perplexity.ai/settings/api) (for article research)
- An [Anthropic API key](https://console.anthropic.com/) (for comment summarization and synthesis)

## Updating after code changes

Go to `chrome://extensions` and click the **↺ refresh** icon on the extension card. Then reload any open HN tabs.
