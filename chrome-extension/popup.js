const perplexityInput = document.getElementById('perplexityKey');
const saveBtn = document.getElementById('saveBtn');
const status = document.getElementById('status');

// Load saved key (show masked)
chrome.storage.sync.get(['perplexityKey'], ({ perplexityKey }) => {
  if (perplexityKey) perplexityInput.placeholder = '••••••••' + perplexityKey.slice(-4);
});

saveBtn.addEventListener('click', () => {
  const value = perplexityInput.value.trim();
  if (!value) {
    status.textContent = 'No changes to save.';
    return;
  }

  chrome.storage.sync.set({ perplexityKey: value }, () => {
    status.textContent = 'Saved!';
    perplexityInput.value = '';
    chrome.storage.sync.get(['perplexityKey'], ({ perplexityKey }) => {
      if (perplexityKey) perplexityInput.placeholder = '••••••••' + perplexityKey.slice(-4);
    });
    setTimeout(() => { status.textContent = ''; }, 2000);
  });
});
