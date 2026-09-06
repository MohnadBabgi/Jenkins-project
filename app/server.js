const path = require('node:path');
const os = require('node:os');
const express = require('express');

function renderStatusPage({ hostname, uptime, now, version }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>DevOps Status Page</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <main class="card">
    <h1>It's alive</h1>
    <dl>
      <dt>Hostname</dt><dd>${hostname}</dd>
      <dt>Version</dt><dd>${version}</dd>
      <dt>Server time</dt><dd>${now}</dd>
      <dt>Uptime (s)</dt><dd>${uptime}</dd>
    </dl>
  </main>
</body>
</html>`;
}

function createApp({ version } = {}) {
  const app = express();
  const appVersion = version || process.env.APP_VERSION || '0.0.0';

  app.get('/health', (req, res) => {
    res.type('text').send('ok');
  });

  app.get('/', (req, res) => {
    res.type('html').send(renderStatusPage({
      hostname: os.hostname(),
      uptime: Math.floor(process.uptime()),
      now: new Date().toISOString(),
      version: appVersion,
    }));
  });

  app.use(express.static(path.join(__dirname, 'public')));

  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  const app = createApp();
  app.listen(port, () => {
    console.log(`Status app listening on port ${port}`);
  });
}

module.exports = { createApp };
