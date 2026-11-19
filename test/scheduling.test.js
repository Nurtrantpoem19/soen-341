const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { futureTime } = require('../routes/scheduling');
const { createApp } = require('../server');

test('schedules require real future calendar dates and explicit timezones', () => {
  for (const value of [null, 42, 'tomorrow', '2099-02-30T12:00:00Z', '2099-13-01T12:00:00Z', '2099-01-01T12:00:00', '2000-01-01T12:00:00Z']) {
    assert.equal(futureTime(value), null, String(value));
  }
  assert.equal(futureTime('2099-01-01T12:00:00-05:00').toISOString(), '2099-01-01T17:00:00.000Z');
});

test('interview notification failure rolls back the schedule and status', async t => {
  process.env.JWT_SECRET ||= 'scheduling-test-secret';
  const commands = [];
  const client = {
    async query(sql) {
      commands.push(sql);
      if (sql.startsWith('SELECT a.*')) return { rowCount: 1, rows: [{ id: 1, user_id: 2, job_id: 3, job_title: 'Developer', company: 'Example', status: 'Applied' }] };
      if (sql.includes('INSERT INTO notifications')) throw new Error('notification write failed');
      return { rows: [], rowCount: 0 };
    },
    release() { commands.push('RELEASE'); }
  };
  const pool = { query: async () => ({ rows: [{ role: 'recruiter' }] }), connect: async () => client };
  const server = createApp(pool).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/recruiter/applications/1/interview`, {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt.sign({ userId: 1 }, process.env.JWT_SECRET)}` },
    body: JSON.stringify({ scheduledAt: '2099-01-01T12:00:00Z', location: 'Room 341' })
  });
  assert.equal(response.status, 500);
  assert.ok(commands.includes('ROLLBACK'));
  assert.ok(!commands.includes('COMMIT'));
  assert.equal(commands.at(-1), 'RELEASE');
});

test('the app serves public pages without exposing source, secrets or uploads', async t => {
  const server = createApp({}).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/', '/index.html', '/frontend/applications.html', '/frontend/js/interviews.js']) assert.equal((await fetch(base + path)).status, 200, path);
  for (const path of ['/.env', '/.git/config', '/server.js', '/uploads/example.pdf']) assert.equal((await fetch(base + path)).status, 404, path);
});
