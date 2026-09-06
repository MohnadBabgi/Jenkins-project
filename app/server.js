const path = require('node:path');
const os = require('node:os');
const express = require('express');

function createApp({ version } = {}) {
  const app = express();
  const appVersion = version || process.env.APP_VERSION || '0.0.0';

  app.get('/health', (req, res) => {
    res.type('text').send('ok');
  });

  app.get('/api/status', (req, res) => {
    res.json({
      hostname: os.hostname(),
      uptime: Math.floor(process.uptime()),
      now: new Date().toISOString(),
      version: appVersion,
    });
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
