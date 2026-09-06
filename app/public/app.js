async function refreshStatus() {
  const res = await fetch('/api/status');
  const data = await res.json();
  for (const [field, value] of Object.entries(data)) {
    const el = document.querySelector(`[data-field="${field}"]`);
    if (el) el.textContent = value;
  }
}

refreshStatus();
setInterval(refreshStatus, 5000);
