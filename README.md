# HN Summarizer

Summarize any Hacker News post — fetches the linked article and the HN discussion, then produces a combined summary using AI.

Available as both a **CLI script** and a **Chrome extension**.

---

## Chrome Extension

### Install

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `chrome-extension/` folder
4. Click the extension icon in the toolbar, enter your **Perplexity API key**, and save

### Usage

Navigate to [news.ycombinator.com](https://news.ycombinator.com). Each story will have a **"summarize"** link next to the comments count. Click it — a new tab opens and shows:

- **Article Summary** — the linked article fetched and summarized by Perplexity
- **HN Comments Summary** — the discussion summarized from all comments

Also works on individual post pages (`/item?id=...`).

### How it works

1. The content script extracts the HN item ID and article URL from the page DOM
2. Comments are fetched from the [Algolia HN API](https://hn.algolia.com/api/v1/items/{id}) as structured JSON (free, no key needed)
3. A single Perplexity Agent API call fetches the article via `fetch_url` and summarizes both the article and the comments

### Requirements

- A [Perplexity API key](https://www.perplexity.ai/settings/api) (set via the extension popup)

### Updating after code changes

Go to `chrome://extensions` and click the **↺ refresh** icon on the extension card. Then reload any open HN tabs.

---

## CLI Script

### Install

```bash
# Make sure the script is executable and on your PATH
chmod +x hn-summarize
cp hn-summarize /usr/local/bin/   # or any directory on your PATH
```

### Requirements

- `PERPLEXITY_API_KEY` environment variable set
- `claude` CLI installed and authenticated
- Google Chrome at `/Applications/Google Chrome.app/...`
- `jq`, `curl`, `python3`

### Usage

```bash
hn-summarize 43567890
hn-summarize https://news.ycombinator.com/item?id=43567890
hn-summarize   # prompts for URL interactively
```

Output is markdown to stdout — redirect to save:

```bash
hn-summarize 43567890 > summary.md
```
