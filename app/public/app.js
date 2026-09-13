const REFRESH_MS = 5000;
const POD_STALE_MS = 30 * 1000;
const POD_FORGET_MS = 3 * 60 * 1000;
const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

let lastSeenBuild = null;

// Every pod that has answered, keyed by hostname, in the order they first answered.
const pods = new Map();
let servingPod = null;

function link(href, content) {
  if (!href || !/^https?:\/\//.test(href)) return content;
  const a = document.createElement('a');
  a.href = href;
  a.append(content);
  return a;
}

function code(text) {
  const el = document.createElement('code');
  el.textContent = text;
  return el;
}

function buildLabel(buildNumber) {
  if (/^\d+$/.test(buildNumber)) return `Build ${buildNumber}`;
  if (buildNumber === 'manual') return 'Manual deploy';
  return 'Local build';
}

function headlineText(buildNumber) {
  if (/^\d+$/.test(buildNumber)) return `Build ${buildNumber} is live.`;
  if (buildNumber === 'manual') return 'A manual deploy is live.';
  return 'A local build is running.';
}

function relativeTime(iso) {
  const seconds = Math.round((new Date(iso) - Date.now()) / 1000);
  const units = [['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

function formatUptime(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function setField(field, content) {
  const el = document.querySelector(`[data-field="${field}"]`);
  if (el) el.replaceChildren(content);
}

function setHealth(state, text) {
  const el = document.getElementById('health');
  el.dataset.state = state;
  el.querySelector('.health-text').textContent = text;
}

function renderHero(data) {
  const headline = document.getElementById('headline');
  headline.textContent = headlineText(data.buildNumber);

  const buildKey = `${data.buildNumber}:${data.commit}`;
  if (lastSeenBuild && lastSeenBuild !== buildKey) {
    headline.classList.remove('is-new');
    void headline.offsetWidth;
    headline.classList.add('is-new');
  }
  lastSeenBuild = buildKey;

  document.getElementById('summary').replaceChildren(
    'Running commit ',
    link(data.commitUrl, code(data.commit)),
    `, version ${data.version}, deployed ${relativeTime(data.deployedAt)}.`,
  );
}

function renderFacts(data) {
  setField('version', data.version);
  setField('commit', link(data.commitUrl, code(data.commit)));
  setField('buildNumber', link(data.buildUrl, buildLabel(data.buildNumber)));
  setField('deployedAt', dateFormat.format(new Date(data.deployedAt)));
}

function rememberPod(data) {
  pods.set(data.hostname, {
    buildNumber: data.buildNumber,
    uptime: data.uptime,
    requestCount: data.requestCount,
    seenAt: Date.now(),
  });
  servingPod = data.hostname;
}

// Pod names end in a random 5-character suffix; that's the part worth reading.
function podName(hostname) {
  const name = document.createElement('p');
  name.className = 'pod-name';
  const match = /^(.+-)([a-z0-9]{5})$/.exec(hostname);
  if (match) {
    const prefix = document.createElement('span');
    prefix.className = 'pod-prefix';
    prefix.textContent = match[1];
    name.append(prefix, match[2]);
  } else {
    name.textContent = hostname;
  }
  return name;
}

function renderPods() {
  const now = Date.now();
  for (const [hostname, pod] of pods) {
    if (now - pod.seenAt > POD_FORGET_MS) pods.delete(hostname);
  }

  let answering = 0;
  const items = [...pods].map(([hostname, pod]) => {
    const age = now - pod.seenAt;
    const stale = age > POD_STALE_MS;
    if (!stale) answering += 1;

    const li = document.createElement('li');
    li.className = 'pod';
    if (hostname === servingPod) li.classList.add('is-serving');
    if (stale) li.classList.add('is-stale');

    const uptime = stale ? pod.uptime : pod.uptime + Math.floor(age / 1000);
    const views = pod.requestCount === 1 ? '1 page view' : `${pod.requestCount} page views`;
    const meta = document.createElement('p');
    meta.className = 'pod-meta';
    meta.textContent = `${buildLabel(pod.buildNumber)} · up ${formatUptime(uptime)} · ${views}`;

    const seen = document.createElement('p');
    seen.className = 'pod-seen';
    if (hostname === servingPod) seen.textContent = 'This refresh';
    else if (stale) seen.textContent = `No answer for ${formatUptime(Math.floor(age / 1000))}`;
    else seen.textContent = `${Math.round(age / 1000)}s ago`;

    li.append(podName(hostname), meta, seen);
    return li;
  });

  document.getElementById('pods').replaceChildren(...items);
  document.getElementById('pod-count').textContent = answering ? `${answering} answering` : '';
}

function renderHistory(history) {
  const list = document.getElementById('deploy-history');
  const items = [...history].reverse().map((entry, index) => {
    const li = document.createElement('li');
    li.className = index === 0 ? 'event is-current' : 'event';

    const title = document.createElement('p');
    title.className = 'event-title';
    title.append(link(entry.buildUrl, buildLabel(entry.buildNumber)));
    if (index === 0) {
      const tag = document.createElement('span');
      tag.className = 'event-tag';
      tag.textContent = 'Live now';
      title.append(' ', tag);
    }

    const time = document.createElement('time');
    time.dateTime = entry.startedAt;
    time.textContent = dateFormat.format(new Date(entry.startedAt));

    const meta = document.createElement('p');
    meta.className = 'event-meta';
    meta.append(link(entry.commitUrl, code(entry.commit)), `, version ${entry.version}, `, time);

    li.append(title, meta);
    return li;
  });
  list.replaceChildren(...items);
}

async function refresh() {
  try {
    const [health, status] = await Promise.all([fetch('/health'), fetch('/api/status')]);
    if (!health.ok || !status.ok) throw new Error('unhealthy');
    const data = await status.json();
    setHealth('healthy', 'Healthy');
    rememberPod(data);
    renderHero(data);
    renderFacts(data);
    renderHistory(data.deployHistory);
  } catch {
    servingPod = null;
    setHealth('down', "Can't reach the app. Retrying every 5 seconds.");
  }
  renderPods();
}

refresh();
setInterval(refresh, REFRESH_MS);
