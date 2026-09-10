const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const express = require('express');

const MAX_HISTORY_ENTRIES = 10;

function loadDeployHistory(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return [];
  }
}

function saveDeployHistory(filePath, history) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
}

function recordDeploy(filePath, entry) {
  const history = loadDeployHistory(filePath);
  history.push(entry);
  const trimmed = history.slice(-MAX_HISTORY_ENTRIES);
  saveDeployHistory(filePath, trimmed);
  return trimmed;
}

function createApp({ version, commit, buildNumber, repoUrl, buildUrl, historyFilePath } = {}) {
  const app = express();
  const appVersion = version || process.env.APP_VERSION || '0.0.0';
  const appCommit = commit || process.env.GIT_COMMIT || 'local';
  const appBuildNumber = buildNumber || process.env.BUILD_NUMBER || 'dev';
  const appRepoUrl = repoUrl || process.env.REPO_URL || null;
  const appBuildUrl = buildUrl || process.env.BUILD_URL || null;
  const commitUrl = appRepoUrl
    ? `${appRepoUrl.replace(/\.git$/, '')}/commit/${appCommit}`
    : null;
  const historyPath = historyFilePath
    || process.env.DEPLOY_HISTORY_PATH
    || path.join(__dirname, 'data', 'deploy-history.json');

  const deployedAt = new Date().toISOString();
  const deployHistory = recordDeploy(historyPath, {
    version: appVersion,
    commit: appCommit,
    buildNumber: appBuildNumber,
    commitUrl,
    buildUrl: appBuildUrl,
    startedAt: deployedAt,
  });

  let requestCount = 0;

  app.use((req, res, next) => {
    if (req.path === '/') requestCount += 1;
    next();
  });

  app.get('/health', (req, res) => {
    res.type('text').send('ok');
  });

  app.get('/api/status', (req, res) => {
    res.json({
      hostname: os.hostname(),
      uptime: Math.floor(process.uptime()),
      now: new Date().toISOString(),
      version: appVersion,
      commit: appCommit,
      buildNumber: appBuildNumber,
      commitUrl,
      buildUrl: appBuildUrl,
      deployedAt,
      requestCount,
      deployHistory,
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
