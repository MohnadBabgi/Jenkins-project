function renderDeployHistory(history) {
  const list = document.getElementById('deploy-history');
  if (!list || !history) return;
  list.innerHTML = '';
  for (const entry of [...history].reverse()) {
    const li = document.createElement('li');
    li.textContent = `${entry.startedAt} — v${entry.version} (${entry.commit}, build ${entry.buildNumber})`;
    list.appendChild(li);
  }
}

async function refreshStatus() {
  const res = await fetch('/api/status');
  const data = await res.json();
  for (const [field, value] of Object.entries(data)) {
    if (field === 'deployHistory') continue;
    const el = document.querySelector(`[data-field="${field}"]`);
    if (el) el.textContent = value;
  }
  renderDeployHistory(data.deployHistory);
}

refreshStatus();
setInterval(refreshStatus, 5000);
