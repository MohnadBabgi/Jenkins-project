const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');
const { createApp } = require('../server');

let tempPathCounter = 0;
function tempHistoryPath() {
  tempPathCounter += 1;
  return path.join(os.tmpdir(), `deploy-history-test-${process.pid}-${tempPathCounter}.json`);
}

test('GET / serves the static html shell', async () => {
  const app = createApp({ version: '1.2.3' });
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /html/);
  assert.match(res.text, /id="status"/);
  assert.match(res.text, /<script src="\/app\.js">/);
});

test('GET /health responds with 200 ok for k8s probes', async () => {
  const app = createApp({ version: '1.2.3' });
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.text, 'ok');
});

test('GET /api/status returns json with this machine\'s hostname', async () => {
  const app = createApp({ version: '1.2.3' });
  const res = await request(app).get('/api/status');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /json/);
  assert.equal(res.body.hostname, os.hostname());
});

test('GET /api/status returns the injected app version', async () => {
  const app = createApp({ version: '9.9.9' });
  const res = await request(app).get('/api/status');
  assert.equal(res.body.version, '9.9.9');
});

test('GET /api/status returns a numeric uptime and an ISO timestamp', async () => {
  const app = createApp({ version: '1.2.3' });
  const res = await request(app).get('/api/status');
  assert.equal(typeof res.body.uptime, 'number');
  assert.match(res.body.now, /^\d{4}-\d{2}-\d{2}T/);
});

test('GET /api/status returns the injected commit and build number', async () => {
  const app = createApp({ version: '1.2.3', commit: 'abc1234', buildNumber: '42', historyFilePath: tempHistoryPath() });
  const res = await request(app).get('/api/status');
  assert.equal(res.body.commit, 'abc1234');
  assert.equal(res.body.buildNumber, '42');
});

test('GET /api/status defaults commit/buildNumber to local/dev when not provided', async () => {
  const app = createApp({ version: '1.2.3', historyFilePath: tempHistoryPath() });
  const res = await request(app).get('/api/status');
  assert.equal(res.body.commit, 'local');
  assert.equal(res.body.buildNumber, 'dev');
});

test('GET /api/status counts how many times the page has been requested', async () => {
  const app = createApp({ version: '1.2.3', historyFilePath: tempHistoryPath() });
  await request(app).get('/');
  await request(app).get('/');
  const res = await request(app).get('/api/status');
  assert.equal(res.body.requestCount, 2);
});

test('GET /api/status is not itself counted as a page request', async () => {
  const app = createApp({ version: '1.2.3', historyFilePath: tempHistoryPath() });
  await request(app).get('/api/status');
  const res = await request(app).get('/api/status');
  assert.equal(res.body.requestCount, 0);
});

test('deploy history records the current deploy on startup', async () => {
  const historyFilePath = tempHistoryPath();
  const app = createApp({ version: '1.0.0', commit: 'aaa111', buildNumber: '10', historyFilePath });
  const res = await request(app).get('/api/status');
  assert.equal(res.body.deployHistory.length, 1);
  assert.equal(res.body.deployHistory[0].commit, 'aaa111');
  assert.equal(res.body.deployHistory[0].buildNumber, '10');
  assert.match(res.body.deployHistory[0].startedAt, /^\d{4}-\d{2}-\d{2}T/);
  fs.rmSync(historyFilePath, { force: true });
});

test('deploy history persists and appends across restarts of the process', async () => {
  const historyFilePath = tempHistoryPath();
  createApp({ version: '1.0.0', commit: 'aaa111', buildNumber: '10', historyFilePath });
  const secondDeploy = createApp({ version: '1.0.1', commit: 'bbb222', buildNumber: '11', historyFilePath });
  const res = await request(secondDeploy).get('/api/status');
  assert.equal(res.body.deployHistory.length, 2);
  assert.equal(res.body.deployHistory[0].commit, 'aaa111');
  assert.equal(res.body.deployHistory[1].commit, 'bbb222');
  fs.rmSync(historyFilePath, { force: true });
});

test('deploy history caps at the 10 most recent entries', async () => {
  const historyFilePath = tempHistoryPath();
  for (let i = 0; i < 12; i += 1) {
    createApp({ version: '1.0.0', commit: `sha${i}`, buildNumber: String(i), historyFilePath });
  }
  const res = await request(
    createApp({ version: '1.0.0', commit: 'shaFinal', buildNumber: '99', historyFilePath })
  ).get('/api/status');
  assert.equal(res.body.deployHistory.length, 10);
  assert.equal(res.body.deployHistory[9].commit, 'shaFinal');
  fs.rmSync(historyFilePath, { force: true });
});

test('GET /api/status links the commit to the repo, stripping a trailing .git', async () => {
  const app = createApp({
    commit: 'abc1234',
    repoUrl: 'https://github.com/example/project.git',
    historyFilePath: tempHistoryPath(),
  });
  const res = await request(app).get('/api/status');
  assert.equal(res.body.commitUrl, 'https://github.com/example/project/commit/abc1234');
});

test('GET /api/status passes through the build URL', async () => {
  const app = createApp({
    buildUrl: 'http://jenkins.example:8080/job/app/5/',
    historyFilePath: tempHistoryPath(),
  });
  const res = await request(app).get('/api/status');
  assert.equal(res.body.buildUrl, 'http://jenkins.example:8080/job/app/5/');
});

test('GET /api/status returns null links when repo/build URLs are not configured', async () => {
  const app = createApp({ historyFilePath: tempHistoryPath() });
  const res = await request(app).get('/api/status');
  assert.equal(res.body.commitUrl, null);
  assert.equal(res.body.buildUrl, null);
});

test('GET /api/status reports when the current deploy started', async () => {
  const app = createApp({ historyFilePath: tempHistoryPath() });
  const res = await request(app).get('/api/status');
  const latest = res.body.deployHistory[res.body.deployHistory.length - 1];
  assert.equal(res.body.deployedAt, latest.startedAt);
});

test('deploy history entries keep their commit and build links', async () => {
  const historyFilePath = tempHistoryPath();
  const app = createApp({
    commit: 'abc1234',
    repoUrl: 'https://github.com/example/project',
    buildUrl: 'http://jenkins.example:8080/job/app/5/',
    historyFilePath,
  });
  const res = await request(app).get('/api/status');
  const entry = res.body.deployHistory[0];
  assert.equal(entry.commitUrl, 'https://github.com/example/project/commit/abc1234');
  assert.equal(entry.buildUrl, 'http://jenkins.example:8080/job/app/5/');
  fs.rmSync(historyFilePath, { force: true });
});
