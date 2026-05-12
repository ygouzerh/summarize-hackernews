const perplexityInput = document.getElementById('perplexityKey');
const anthropicInput = document.getElementById('anthropicKey');
const saveBtn = document.getElementById('saveBtn');
const status = document.getElementById('status');

function maskedPlaceholder(key) {
  return '••••••••' + key.slice(-4);
}

function refreshPlaceholders() {
  chrome.storage.sync.get(['perplexityKey', 'anthropicKey'], ({ perplexityKey, anthropicKey }) => {
    if (perplexityKey) perplexityInput.placeholder = maskedPlaceholder(perplexityKey);
    if (anthropicKey) anthropicInput.placeholder = maskedPlaceholder(anthropicKey);
  });
}

refreshPlaceholders();

saveBtn.addEventListener('click', () => {
  const perplexityValue = perplexityInput.value.trim();
  const anthropicValue = anthropicInput.value.trim();

  const update = {};
  if (perplexityValue) update.perplexityKey = perplexityValue;
  if (anthropicValue) update.anthropicKey = anthropicValue;

  if (Object.keys(update).length === 0) {
    status.textContent = 'No changes to save.';
    return;
  }

  chrome.storage.sync.set(update, () => {
    status.textContent = 'Saved!';
    perplexityInput.value = '';
    anthropicInput.value = '';
    refreshPlaceholders();
    setTimeout(() => { status.textContent = ''; }, 2000);
  });
});
