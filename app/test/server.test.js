const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const request = require('supertest');
const { createApp } = require('../server');

test('GET / responds with 200 and html', async () => {
  const app = createApp({ version: '1.2.3' });
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /html/);
});

test('GET / shows this machine\'s hostname', async () => {
  const app = createApp({ version: '1.2.3' });
  const res = await request(app).get('/');
  assert.match(res.text, new RegExp(os.hostname()));
});

test('GET / shows the injected app version', async () => {
  const app = createApp({ version: '9.9.9' });
  const res = await request(app).get('/');
  assert.match(res.text, /9\.9\.9/);
});

test('GET /health responds with 200 ok for k8s probes', async () => {
  const app = createApp({ version: '1.2.3' });
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.text, 'ok');
});
