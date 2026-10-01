const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { migrate } = require('../db/migrate');
const { createApp } = require('../server');
test('database migrations, constraints and API persistence', async t => {
  let pool;
  if (process.env.TEST_DATABASE_URL) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  } else {
    const { newDb, DataType } = require('pg-mem');
    const database = newDb({ noAstCoverageCheck: true });
    database.public.registerFunction({ name: 'trim', args: [DataType.text], returns: DataType.text, implementation: value => value.trim() });
    database.public.registerFunction({ name: 'length', args: [DataType.text], returns: DataType.integer, implementation: value => [...value].length });
    const { Pool } = database.adapters.createPg();
    pool = new Pool();
  }
  let cleanupId;
  let server;
  t.after(async () => {
    try {
      if (server?.listening) await new Promise(resolve => server.close(resolve));
      if (cleanupId) await pool.query('DELETE FROM users WHERE id=$1', [cleanupId]);
    } finally { await pool.end(); }
  });
  await migrate(pool);
  await migrate(pool);
  assert.equal((await pool.query('SELECT * FROM schema_migrations')).rowCount, 1);
  const email = `test-${Date.now()}@example.com`;
  async function start(demoAuth = true) {
    server = createApp(pool, { demoAuth }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  }
  const stop = () => new Promise(resolve => server.close(resolve));
  let base = await start();
  async function request(path, method = 'GET', body, id) {
    const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(id ? { 'x-demo-user-id': String(id) } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  assert.equal((await request('/api/health')).status, 200);
  assert.equal((await request('/api/auth/register', 'POST', { email: 'invalid', password: 'short' })).status, 400);
  const registration = await request('/api/auth/register', 'POST', { email, password: 'ExamplePass123!' });
  assert.equal(registration.status, 201);
  const id = registration.body.user.id;
  cleanupId = id;
  assert.equal(registration.body.user.password_hash, undefined);
  const hash = (await pool.query('SELECT password_hash FROM users WHERE id=$1', [id])).rows[0].password_hash;
  assert.ok(await bcrypt.compare('ExamplePass123!', hash));
  assert.equal((await request('/api/auth/register', 'POST', { email: email.toUpperCase(), password: 'ExamplePass123!' })).status, 409);
  const profile = { firstName: 'Test', lastName: 'Student', phone: '555-0100', location: 'Montreal', headline: 'Student' };
  assert.equal((await request('/api/profile', 'POST', profile)).status, 401);
  assert.equal((await request('/api/profile', 'POST', {}, id)).status, 400);
  assert.equal((await request('/api/profile', 'POST', profile, id)).status, 201);
  assert.equal((await request('/api/profile', 'POST', profile, id)).status, 409);
  assert.equal((await request('/api/profile/me', 'PUT', { ...profile, headline: 'Developer' }, id)).status, 200);
  await stop(); base = await start();
  assert.equal((await request('/api/profile/me', 'GET', undefined, id)).body.profile.headline, 'Developer');
  await assert.rejects(pool.query('UPDATE profiles SET summary=$1 WHERE user_id=$2', ['x'.repeat(2001), id]));
  await assert.rejects(pool.query('INSERT INTO resumes (user_id,original_name,storage_path,file_size,mime_type) VALUES ($1,$2,$3,$4,$5)', [id,'bad.exe',`bad-${id}`,10,'application/octet-stream']));
  await pool.query('INSERT INTO resumes (user_id,original_name,storage_path,file_size,mime_type) VALUES ($1,$2,$3,$4,$5)', [id,'resume.pdf',`test-${id}`,100,'application/pdf']);
  await stop(); base = await start(false);
  assert.equal((await request('/api/profile/me', 'GET', undefined, id)).status, 401);
  await pool.query('DELETE FROM users WHERE id=$1', [id]);
  assert.equal((await pool.query('SELECT * FROM profiles WHERE user_id=$1', [id])).rowCount, 0);
  assert.equal((await pool.query('SELECT * FROM resumes WHERE user_id=$1', [id])).rowCount, 0);
});
