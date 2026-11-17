const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { migrate } = require('../db/migrate');
const { createApp } = require('../server');
const { summarizeApplications } = require('../routes/application-analytics');

process.env.JWT_SECRET = 'analytics-test-only-secret';

test('analytics uses UTC months and Monday-start weeks across year boundaries', () => {
  const rows = [
    { status: 'Applied', applied_at: '2026-01-01T00:30:00+02:00' },
    { status: 'Interview', applied_at: '2026-01-04T23:59:59Z' },
    { status: 'Rejected', applied_at: '2026-01-05T00:00:00Z' }
  ];
  assert.deepEqual(summarizeApplications(rows, 'week').overTime, [
    { period: '2025-12-29', count: 2 }, { period: '2026-01-05', count: 1 }
  ]);
  assert.deepEqual(summarizeApplications(rows, 'month').overTime, [
    { period: '2025-12-01', count: 1 }, { period: '2026-01-01', count: 2 }
  ]);
});

test('acceptance #96: authenticated users get only their persisted application analytics', async t => {
  let pool;
  if (process.env.TEST_DATABASE_URL) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  } else {
    const { newDb, DataType } = require('pg-mem');
    const db = newDb({ noAstCoverageCheck: true });
    db.public.registerFunction({ name: 'trim', args: [DataType.text], returns: DataType.text, implementation: value => value.trim() });
    db.public.registerFunction({ name: 'length', args: [DataType.text], returns: DataType.integer, implementation: value => [...value].length });
    const { Pool } = db.adapters.createPg();
    pool = new Pool();
  }
  const users = [];
  let server;
  t.after(async () => {
    try {
      if (server?.listening) await new Promise(resolve => server.close(resolve));
      for (const id of users) await pool.query('DELETE FROM users WHERE id=$1', [id]);
    } finally { await pool.end(); }
  });
  await migrate(pool);
  await migrate(pool);
  for (let i = 0; i < 2; i++) {
    users.push((await pool.query('INSERT INTO users(email,password_hash) VALUES ($1,$2) RETURNING id', [`analytics-${Date.now()}-${i}@example.com`, 'test-only'])).rows[0].id);
  }
  let base;
  async function start() {
    server = createApp(pool).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const token = id => jwt.sign({ userId: id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
  async function request(path = '', bearer = token(users[0])) {
    const response = await fetch(base + '/api/applications/me/analytics' + path, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
    return { status: response.status, body: await response.json() };
  }
  await start();
  assert.equal((await request('', null)).status, 401);
  assert.equal((await request('', 'invalid')).status, 401);
  const empty = await request();
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.analytics, {
    total: 0, byStatus: { Applied: 0, 'Under Review': 0, Interview: 0, Offered: 0, Rejected: 0 }, bucket: 'month', overTime: []
  });
  const statuses = ['Applied', 'Under Review', 'Interview', 'Offered', 'Rejected'];
  for (let i = 0; i < statuses.length; i++) {
    await pool.query(`INSERT INTO applications(user_id,job_id,job_title,company,status,applied_at)
      VALUES ($1,$2,'Developer','Example',$3,$4)`, [users[0], i + 1, statuses[i], i < 2 ? '2026-10-31T23:59:59Z' : '2026-11-02T00:00:00Z']);
  }
  await pool.query(`INSERT INTO applications(user_id,job_id,job_title,company) VALUES ($1,1,'Private job','Other company')`, [users[1]]);
  const result = await request(`?userId=${users[1]}`);
  assert.equal(result.status, 200);
  assert.equal(result.body.analytics.total, 5);
  assert.deepEqual(result.body.analytics.byStatus, Object.fromEntries(statuses.map(status => [status, 1])));
  assert.deepEqual(result.body.analytics.overTime, [{ period: '2026-10-01', count: 2 }, { period: '2026-11-01', count: 3 }]);
  assert.ok(!JSON.stringify(result.body).includes('Private job'));
  const weekly = await request('?bucket=week');
  assert.deepEqual(weekly.body.analytics.overTime, [{ period: '2026-10-26', count: 2 }, { period: '2026-11-02', count: 3 }]);
  assert.equal((await request('', token(users[1]))).body.analytics.total, 1);
  for (const query of ['?bucket=day', '?bucket=', '?bucket=week&bucket=month']) {
    assert.equal((await request(query)).status, 400);
  }
  await new Promise(resolve => server.close(resolve));
  await start();
  assert.deepEqual((await request()).body, result.body);
});

test('analytics returns a safe server error when the database is unavailable', async t => {
  const server = createApp({ query: async () => { throw new Error('database unavailable'); } }).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/applications/me/analytics`, {
    headers: { Authorization: `Bearer ${jwt.sign({ userId: 1 }, process.env.JWT_SECRET)}` }
  });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { message: 'Internal server error' });
});
