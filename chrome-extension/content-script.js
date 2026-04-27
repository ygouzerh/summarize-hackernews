// Inject "Summarize" buttons on Hacker News pages

function getItemIdFromUrl() {
  const m = location.search.match(/[?&]id=(\d+)/);
  return m ? m[1] : null;
}

function injectButtons() {
  // Homepage / list pages: each story row has class "athing" with id = item id
  document.querySelectorAll('tr.athing').forEach(row => {
    const itemId = row.id;
    if (!itemId || document.getElementById('hn-sum-btn-' + itemId)) return;

    // Article URL is in the titleline anchor
    const titleAnchor = row.querySelector('.titleline > a');
    if (!titleAnchor) return;
    const articleUrl = titleAnchor.href || '';
    const title = titleAnchor.textContent || '';

    // Subtext row is the next sibling tr
    const subtextRow = row.nextElementSibling;
    if (!subtextRow) return;
    const subtext = subtextRow.querySelector('.subtext');
    if (!subtext) return;

    const btn = document.createElement('a');
    btn.id = 'hn-sum-btn-' + itemId;
    btn.href = '#';
    btn.className = 'hn-summarize-btn';
    btn.textContent = 'summarize';
    btn.addEventListener('click', e => {
      e.preventDefault();
      btn.textContent = 'summarizing…';
      btn.classList.add('loading');
      try {
        chrome.runtime.sendMessage(
          { action: 'summarize', itemId, articleUrl, title },
          () => {
            // Re-enable after a moment (tab opened)
            setTimeout(() => {
              btn.textContent = 'summarize';
              btn.classList.remove('loading');
            }, 2000);
          }
        );
      } catch {
        btn.textContent = 'reload page';
        btn.classList.remove('loading');
      }
    });

    subtext.appendChild(document.createTextNode(' | '));
    subtext.appendChild(btn);
  });

  // Individual item page: add a button in the page header area
  const itemId = getItemIdFromUrl();
  if (itemId && !document.getElementById('hn-sum-btn-item')) {
    const titleline = document.querySelector('.titleline > a');
    if (titleline) {
      const articleUrl = titleline.href || '';
      const title = titleline.textContent || '';

      const btn = document.createElement('a');
      btn.id = 'hn-sum-btn-item';
      btn.href = '#';
      btn.className = 'hn-summarize-btn hn-summarize-btn-item';
      btn.textContent = 'summarize';
      btn.addEventListener('click', e => {
        e.preventDefault();
        btn.textContent = 'summarizing…';
        btn.classList.add('loading');
        try {
          chrome.runtime.sendMessage(
            { action: 'summarize', itemId, articleUrl, title },
            () => {
              setTimeout(() => {
                btn.textContent = 'summarize';
                btn.classList.remove('loading');
              }, 2000);
            }
          );
        } catch {
          btn.textContent = 'reload page';
          btn.classList.remove('loading');
        }
      });

      const subtext = document.querySelector('.subtext');
      if (subtext) {
        subtext.appendChild(document.createTextNode(' | '));
        subtext.appendChild(btn);
      }
    }
  }
}

// Run on load and on DOM changes (HN uses dynamic updates on some pages)
injectButtons();

const observer = new MutationObserver(() => injectButtons());
observer.observe(document.body, { childList: true, subtree: true });
