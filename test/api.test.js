const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createApp } = require('../src/app');

let app;
let db;

function authHeader(token) {
  return `Be${'arer'} ${token}`;
}

test.before(async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'iptv-test-'));
  const databasePath = path.join(tempDirectory, 'test.sqlite');

  app = await createApp({
    databasePath,
    jwtSecret: 'test-secret',
    seedSampleData: false,
    baseUrl: 'http://localhost:3000',
  });

  db = app.locals.db;
});

test.after(async () => {
  await db.close();
});

test('register and login returns JWT tokens', async () => {
  const registerResponse = await request(app)
    .post('/api/auth/register')
    .send({ username: 'alice', password: 'secret123' })
    .expect(201);

  assert.equal(registerResponse.body.user.username, 'alice');
  assert.equal(typeof registerResponse.body.token, 'string');

  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({ username: 'alice', password: 'secret123' })
    .expect(200);

  assert.equal(loginResponse.body.user.username, 'alice');
  assert.equal(typeof loginResponse.body.token, 'string');
});

test('channel CRUD, playlist, epg, and stream endpoints work with authentication', async () => {
  const authResponse = await request(app)
    .post('/api/auth/register')
    .send({ username: 'bob', password: 'secret123' })
    .expect(201);

  const token = authResponse.body.token;

  const createResponse = await request(app)
    .post('/api/channels')
    .set('Authorization', authHeader(token))
    .send({
      name: 'Test Channel',
      url: 'https://example.com/live/test.m3u8',
      category: 'General',
      logo: 'https://example.com/logo.png',
      tvgId: 'test-channel',
    })
    .expect(201);

  const channelId = createResponse.body.channel.id;

  await db.run(
    `
      INSERT INTO epg_programs (channel_id, title, description, start_time, end_time)
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      channelId,
      'Morning Show',
      'Daily schedule sample',
      '2026-01-01T08:00:00.000Z',
      '2026-01-01T09:00:00.000Z',
    ],
  );

  const listResponse = await request(app)
    .get('/api/channels')
    .set('Authorization', authHeader(token))
    .expect(200);

  assert.equal(listResponse.body.channels.length, 1);
  assert.equal(listResponse.body.channels[0].name, 'Test Channel');

  const getResponse = await request(app)
    .get(`/api/channels/${channelId}`)
    .set('Authorization', authHeader(token))
    .expect(200);

  assert.equal(getResponse.body.channel.id, channelId);
  assert.equal(getResponse.body.channel.name, 'Test Channel');

  const updateResponse = await request(app)
    .put(`/api/channels/${channelId}`)
    .set('Authorization', authHeader(token))
    .send({ category: 'Updated Category' })
    .expect(200);

  assert.equal(updateResponse.body.channel.category, 'Updated Category');

  const playlistResponse = await request(app)
    .get('/api/playlist')
    .set('Authorization', authHeader(token))
    .expect(200);

  assert.match(playlistResponse.text, /#EXTM3U/);
  assert.match(playlistResponse.text, /tvg-id="test-channel"/);
  assert.match(playlistResponse.text, new RegExp(`/api/stream/${channelId}\\?token=`));

  const epgResponse = await request(app)
    .get(`/api/epg?channelId=${channelId}`)
    .set('Authorization', authHeader(token))
    .expect(200);

  assert.equal(epgResponse.body.programs.length, 1);
  assert.equal(epgResponse.body.programs[0].title, 'Morning Show');

  const streamResponse = await request(app)
    .get(`/api/stream/${channelId}?token=${encodeURIComponent(token)}`)
    .redirects(0)
    .expect(302);

  assert.equal(streamResponse.headers.location, 'https://example.com/live/test.m3u8');

  await request(app)
    .delete(`/api/channels/${channelId}`)
    .set('Authorization', authHeader(token))
    .expect(204);

  const afterDeleteResponse = await request(app)
    .get('/api/channels')
    .set('Authorization', authHeader(token))
    .expect(200);

  assert.equal(afterDeleteResponse.body.channels.length, 0);
});
