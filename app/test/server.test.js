const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const request = require('supertest');
const { createApp } = require('../server');

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
