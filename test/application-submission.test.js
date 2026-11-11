const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { migrate } = require('../db/migrate');
const { createApp } = require('../server');

process.env.JWT_SECRET = 'submission-test-only-secret';

test('application submission uses open postings and authenticated ownership', async t => {
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
  const users = [], jobs = [];
  let server;
  t.after(async () => {
    try {
      if (server?.listening) await new Promise(resolve => server.close(resolve));
      for (const id of users) await pool.query('DELETE FROM users WHERE id=$1', [id]);
      for (const id of jobs) await pool.query('DELETE FROM jobs WHERE id=$1', [id]);
    } finally { await pool.end(); }
  });
  await migrate(pool);
  for (let i = 0; i < 2; i++) {
    users.push((await pool.query('INSERT INTO users(email,password_hash) VALUES ($1,$2) RETURNING id', [`submission-${Date.now()}-${i}@example.com`, 'test-only'])).rows[0].id);
  }
  for (const open of [true, false, true]) {
    jobs.push((await pool.query(`INSERT INTO jobs(title,company,location,category,employment_type,description,is_open)
      VALUES ('Backend Developer','CareerConnect Labs','Montreal','Engineering','Full-time','Build APIs',$1) RETURNING id`, [open])).rows[0].id);
  }
  let base;
  async function start() {
    server = createApp(pool).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const token = id => jwt.sign({ userId: id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
  async function request(path, body, bearer = token(users[0])) {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  }
  const apply = (body, bearer) => request('/api/applications', body, bearer);
  const count = async () => Number((await pool.query('SELECT COUNT(*) AS count FROM applications WHERE user_id=$1', [users[0]])).rows[0].count);
  await start();

  await t.test('missing or invalid authentication cannot submit', async () => {
    assert.equal((await apply({ jobId: jobs[0] }, null)).status, 401);
    assert.equal((await apply({ jobId: jobs[0] }, 'bad-token')).status, 401);
    assert.equal(await count(), 0);
  });
  await t.test('invalid IDs and cover letters are rejected without saving', async () => {
    for (const jobId of [undefined, null, true, false, [], [jobs[0]], {}, '', '1.0', '1e0', ' 1 ', '1 OR 1=1', 0, -1, 1.5, 2147483648]) {
      assert.equal((await apply({ jobId })).status, 400, `invalid jobId: ${JSON.stringify(jobId)}`);
    }
    for (const coverLetter of [null, 123, [], {}, 'x'.repeat(2001)]) {
      assert.equal((await apply({ jobId: jobs[0], coverLetter })).status, 400);
    }
    assert.equal((await apply([])).status, 400);
    assert.equal(await count(), 0);
  });
  await t.test('missing and closed jobs cannot receive applications', async () => {
    for (const jobId of [2147483647, jobs[1]]) {
      const result = await apply({ jobId });
      assert.equal(result.status, 404);
      assert.equal(result.body.message, 'Open job not found.');
    }
    assert.equal(await count(), 0);
  });
  await t.test('acceptance: submitting a real job uses saved details and JWT ownership', async () => {
    const result = await apply({ jobId: jobs[0], coverLetter: '  Interested!  ', jobTitle: 'Forged title', company: 'Forged company', userId: users[1], status: 'Offered' });
    assert.equal(result.status, 201);
    const application = result.body.application;
    assert.equal(application.jobId, jobs[0]);
    assert.equal(application.jobTitle, 'Backend Developer');
    assert.equal(application.company, 'CareerConnect Labs');
    assert.equal(application.userId, users[0]);
    assert.equal(application.coverLetter, 'Interested!');
    assert.equal(application.status, 'Applied');
    assert.ok(application.appliedAt && application.updatedAt);
    assert.equal(await count(), 1);
    assert.equal((await apply({ jobId: jobs[0] })).status, 409);
    assert.equal(await count(), 1);
  });
  await t.test('other users can apply independently; optional cover letter defaults empty', async () => {
    const result = await apply({ jobId: String(jobs[0]) }, token(users[1]));
    assert.equal(result.status, 201);
    assert.equal(result.body.application.coverLetter, '');
    assert.equal(result.body.application.userId, users[1]);
  });
  await t.test('simultaneous duplicate submissions save only one application', async () => {
    const results = await Promise.all([apply({ jobId: jobs[2], coverLetter: 'x'.repeat(2000) }), apply({ jobId: jobs[2] })]);
    assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
    assert.equal(await count(), 2);
  });
  await t.test('saved submissions survive restart and feed history and analytics', async () => {
    await new Promise(resolve => server.close(resolve));
    await start();
    const history = await request('/api/applications/me');
    assert.equal(history.status, 200);
    assert.equal(history.body.applications.length, 2);
    assert.ok(history.body.applications.every(row => row.userId === users[0]));
    const analytics = await request('/api/applications/me/analytics');
    assert.equal(analytics.status, 200);
    assert.equal(analytics.body.analytics.total, 2);
    assert.equal(analytics.body.analytics.byStatus.Applied, 2);
  });
});
