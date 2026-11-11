const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrate } = require('../db/migrate');
const { createApp } = require('../server');
// Job search and job listing API (Sprint 2).
test('job search, filtering and job details', async t => {
  let pool;
  if (process.env.TEST_DATABASE_URL) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  } else {
    const { newDb, DataType } = require('pg-mem');
    const database = newDb({ noAstCoverageCheck: true });
    database.public.registerFunction({ name: 'trim', args: [DataType.text], returns: DataType.text, implementation: value => value.trim() });
    database.public.registerFunction({ name: 'length', args: [DataType.text], returns: DataType.integer, implementation: value => [...value].length });
    database.public.registerFunction({ name: 'strpos', args: [DataType.text, DataType.text], returns: DataType.integer, implementation: (text, search) => text.indexOf(search) + 1 });
    const { Pool } = database.adapters.createPg();
    pool = new Pool();
  }
  const createdIds = [];
  let server;
  t.after(async () => {
    try {
      if (server?.listening) await new Promise(resolve => server.close(resolve));
      for (const id of createdIds) await pool.query('DELETE FROM jobs WHERE id=$1', [id]);
    } finally { await pool.end(); }
  });
  // node --test runs test files in parallel; on a shared PostgreSQL database the other file may be migrating at the same time.
  try { await migrate(pool); } catch { await new Promise(resolve => setTimeout(resolve, 1000)); await migrate(pool); }
  // Unique marker so assertions only look at the postings created by this test.
  const marker = `zq${Date.now()}`;
  async function addJob(job) {
    const result = await pool.query(
      'INSERT INTO jobs (title, company, location, category, employment_type, description, requirements, is_open) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [job.title, job.company, job.location, job.category, job.type, job.description, job.requirements || '', job.isOpen ?? true]
    );
    createdIds.push(result.rows[0].id);
    return result.rows[0].id;
  }
  const internId = await addJob({ title: `Web Developer Intern ${marker}`, company: 'Test Labs', location: 'Montreal, QC', category: `Engineering ${marker}`, type: 'Internship', description: 'Build pages.', requirements: 'HTML\nCSS' });
  const analystId = await addJob({ title: `Data Analyst ${marker}`, company: 'Test Analytics', location: 'Toronto, ON', category: `Data ${marker}`, type: 'Full-time', description: 'Write 100% accurate reports.' });
  const closedId = await addJob({ title: `Closed Role ${marker}`, company: 'Test Labs', location: 'Montreal, QC', category: `Engineering ${marker}`, type: 'Contract', description: 'No longer open.', isOpen: false });
  server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function get(path) {
    const response = await fetch(base + path);
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  const ids = body => body.jobs.map(job => job.id).sort((a, b) => a - b);

  // Listing shows available jobs, newest first, and never closed postings.
  const all = await get('/api/jobs');
  assert.equal(all.status, 200);
  assert.ok(all.body.jobs.length >= 2);
  assert.ok(!all.body.jobs.some(job => job.id === closedId));
  assert.equal(all.headers.get('access-control-allow-origin'), '*');
  const listed = all.body.jobs.find(job => job.id === internId);
  assert.equal(listed.employmentType, 'Internship');
  assert.equal(listed.requirements, undefined);

  // Keyword search matches title, company or description, ignoring case.
  assert.deepEqual(ids((await get(`/api/jobs?q=${marker.toUpperCase()}`)).body), [internId, analystId]);
  assert.deepEqual(ids((await get(`/api/jobs?q=intern%20${marker}`)).body), [internId]);
  const byCompany = (await get('/api/jobs?q=test%20analytics')).body;
  assert.ok(byCompany.jobs.some(job => job.id === analystId) && !byCompany.jobs.some(job => job.id === internId));
  // LIKE wildcards in the keyword are matched literally.
  assert.equal((await get('/api/jobs?q=' + encodeURIComponent('100%'))).body.jobs.some(job => job.id === analystId), true);
  assert.equal((await get('/api/jobs?q=' + encodeURIComponent(`${marker}%_`))).body.jobs.length, 0);

  // Location, category and type filters, alone and combined with a keyword.
  assert.deepEqual(ids((await get(`/api/jobs?q=${marker}&location=toronto`)).body), [analystId]);
  assert.deepEqual(ids((await get(`/api/jobs?category=${encodeURIComponent(`Engineering ${marker}`)}`)).body), [internId]);
  assert.deepEqual(ids((await get(`/api/jobs?q=${marker}&type=Full-time`)).body), [analystId]);
  assert.equal((await get(`/api/jobs?q=${marker}&location=Vancouver`)).body.jobs.length, 0);

  // Invalid filters are rejected.
  assert.equal((await get('/api/jobs?q=' + 'x'.repeat(101))).status, 400);
  assert.equal((await get('/api/jobs?q=a&q=b')).status, 400);
  assert.equal((await get('/api/jobs?type=Freelance')).status, 400);

  // Categories for the filter menu include open postings only.
  const categories = await get('/api/jobs/categories');
  assert.equal(categories.status, 200);
  assert.ok(categories.body.categories.includes(`Engineering ${marker}`));
  assert.ok(categories.body.categories.includes(`Data ${marker}`));
  assert.deepEqual(categories.body.employmentTypes, ['Full-time', 'Part-time', 'Internship', 'Contract']);

  // Job details include the full description and requirements.
  const details = await get(`/api/jobs/${internId}`);
  assert.equal(details.status, 200);
  assert.equal(details.body.job.title, `Web Developer Intern ${marker}`);
  assert.equal(details.body.job.requirements, 'HTML\nCSS');
  assert.equal((await get(`/api/jobs/${closedId}`)).status, 404);
  assert.equal((await get('/api/jobs/2147483647')).status, 404);
  for (const bad of ['abc', '0', '-1', '1.5', '2147483648']) assert.equal((await get(`/api/jobs/${bad}`)).status, 400);
});
