const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrate } = require('../db/migrate');
const { createApp } = require('../server');
const { readFilters, parseJobId } = require('../routes/jobs');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'jobs-test-only-secret';

async function createTestPool() {
  if (process.env.TEST_DATABASE_URL) {
    const { Pool } = require('pg');
    return new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  }
  const { newDb, DataType } = require('pg-mem');
  const database = newDb({ noAstCoverageCheck: true });
  database.public.registerFunction({ name: 'trim', args: [DataType.text], returns: DataType.text, implementation: value => value.trim() });
  database.public.registerFunction({ name: 'length', args: [DataType.text], returns: DataType.integer, implementation: value => [...value].length });
  database.public.registerFunction({ name: 'strpos', args: [DataType.text, DataType.text], returns: DataType.integer, implementation: (text, search) => text.indexOf(search) + 1 });
  const { Pool } = database.adapters.createPg();
  return new Pool();
}

// Unit tests for job filter and ID parsing helpers.
test('readFilters trims valid query options and rejects invalid filters or sort values', () => {
  assert.deepEqual(readFilters({}), {
    q: '',
    location: '',
    category: '',
    type: '',
    sort: 'newest'
  });

  assert.deepEqual(
    readFilters({ q: '  TypeScript ', location: ' Montreal ', category: ' Software Engineering ', type: 'Internship', sort: 'title' }),
    { q: 'TypeScript', location: 'Montreal', category: 'Software Engineering', type: 'Internship', sort: 'title' }
  );

  assert.equal(readFilters(null), null);
  assert.equal(readFilters({ q: 'x'.repeat(101) }), null);
  assert.equal(readFilters({ q: ['a', 'b'] }), null);
  assert.equal(readFilters({ type: 'Volunteer' }), null);
  assert.equal(readFilters({ sort: 'salary' }), null);
});

test('parseJobId accepts only positive 32-bit integers', () => {
  assert.equal(parseJobId('42'), 42);
  for (const bad of ['abc', '0', '-1', '1.5', '2147483648', '']) {
    assert.equal(parseJobId(bad), null, String(bad));
  }
});

// Job search and job listing API (Sprint 2 + Sprint 4 enhancements).
test('job search, filtering, sorting and job details', async t => {
  const pool = await createTestPool();
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
      'INSERT INTO jobs (title, company, location, category, employment_type, description, requirements, is_open, posted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
      [
        job.title,
        job.company,
        job.location,
        job.category,
        job.type,
        job.description,
        job.requirements || '',
        job.isOpen ?? true,
        job.postedAt || new Date()
      ]
    );
    createdIds.push(result.rows[0].id);
    return result.rows[0].id;
  }
  const internId = await addJob({
    title: `Web Developer Intern ${marker}`,
    company: 'Test Labs',
    location: 'Montreal, QC',
    category: `Engineering ${marker}`,
    type: 'Internship',
    description: 'Build pages.',
    requirements: `HTML\nCSS\nUniqueSkill${marker}`,
    postedAt: new Date('2026-11-10T12:00:00Z')
  });
  const analystId = await addJob({
    title: `Alpha Data Analyst ${marker}`,
    company: 'Test Analytics',
    location: 'Toronto, ON',
    category: `Data ${marker}`,
    type: 'Full-time',
    description: 'Write 100% accurate reports.',
    postedAt: new Date('2026-11-12T12:00:00Z')
  });
  const closedId = await addJob({
    title: `Closed Role ${marker}`,
    company: 'Test Labs',
    location: 'Montreal, QC',
    category: `Engineering ${marker}`,
    type: 'Contract',
    description: 'No longer open.',
    isOpen: false
  });

  server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function get(path) {
    const response = await fetch(base + path, {
      headers: { Origin: 'http://localhost:5500' }
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  const ids = body => body.jobs.map(job => job.id).sort((a, b) => a - b);

  // Listing shows available jobs, newest first, and never closed postings.
  const all = await get('/api/jobs');
  assert.equal(all.status, 200);
  assert.ok(all.body.jobs.length >= 2);
  assert.ok(!all.body.jobs.some(job => job.id === closedId));
  assert.equal(all.headers.get('access-control-allow-origin'), 'http://localhost:5500');
  const listed = all.body.jobs.find(job => job.id === internId);
  assert.equal(listed.employmentType, 'Internship');
  assert.equal(listed.requirements, undefined);

  // Keyword search matches title, company, description, or requirements, ignoring case.
  assert.deepEqual(ids((await get(`/api/jobs?q=${marker.toUpperCase()}`)).body), [internId, analystId]);
  assert.deepEqual(ids((await get(`/api/jobs?q=intern%20${marker}`)).body), [internId]);
  assert.deepEqual(ids((await get(`/api/jobs?q=uniqueskill${marker}`)).body), [internId]);
  const byCompany = (await get('/api/jobs?q=test%20analytics')).body;
  assert.ok(byCompany.jobs.some(job => job.id === analystId) && !byCompany.jobs.some(job => job.id === internId));
  // LIKE wildcards in the keyword are matched literally.
  assert.equal((await get('/api/jobs?q=' + encodeURIComponent('100%'))).body.jobs.some(job => job.id === analystId), true);
  assert.equal((await get('/api/jobs?q=' + encodeURIComponent(`${marker}%_`))).body.jobs.length, 0);

  // Location, case-insensitive category, and type filters, alone and combined with a keyword.
  assert.deepEqual(ids((await get(`/api/jobs?q=${marker}&location=toronto`)).body), [analystId]);
  assert.deepEqual(ids((await get(`/api/jobs?category=${encodeURIComponent(`engineering ${marker}`)}`)).body), [internId]);
  assert.deepEqual(ids((await get(`/api/jobs?q=${marker}&type=Full-time`)).body), [analystId]);
  assert.equal((await get(`/api/jobs?q=${marker}&location=Vancouver`)).body.jobs.length, 0);

  // Sorting by newest, oldest, and title.
  const newestOrder = (await get(`/api/jobs?q=${marker}&sort=newest`)).body.jobs.map(job => job.id);
  assert.deepEqual(newestOrder, [analystId, internId]);
  const oldestOrder = (await get(`/api/jobs?q=${marker}&sort=oldest`)).body.jobs.map(job => job.id);
  assert.deepEqual(oldestOrder, [internId, analystId]);
  const titleOrder = (await get(`/api/jobs?q=${marker}&sort=title`)).body.jobs.map(job => job.id);
  assert.deepEqual(titleOrder, [analystId, internId]);

  // Invalid filters and sort options are rejected.
  assert.equal((await get('/api/jobs?q=' + 'x'.repeat(101))).status, 400);
  assert.equal((await get('/api/jobs?q=a&q=b')).status, 400);
  assert.equal((await get('/api/jobs?type=Freelance')).status, 400);
  assert.equal((await get('/api/jobs?sort=salary')).status, 400);

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
  assert.equal(details.body.job.requirements, `HTML\nCSS\nUniqueSkill${marker}`);
  assert.equal((await get(`/api/jobs/${closedId}`)).status, 404);
  assert.equal((await get('/api/jobs/2147483647')).status, 404);
  for (const bad of ['abc', '0', '-1', '1.5', '2147483648']) assert.equal((await get(`/api/jobs/${bad}`)).status, 400);
});

test('acceptance: recruiter postings appear, update, and disappear in public job search and details', async t => {
  const pool = await createTestPool();
  await migrate(pool);

  const server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const createdUserIds = [];
  const createdJobIds = [];

  t.after(async () => {
    try {
      if (server.listening) await new Promise(resolve => server.close(resolve));
      for (const jobId of createdJobIds) await pool.query('DELETE FROM jobs WHERE id = $1', [jobId]);
      for (const userId of createdUserIds) await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    } finally {
      await pool.end();
    }
  });

  async function api(path, method = 'GET', body, token) {
    const res = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  }

  const marker = `rec${Date.now()}`;
  const email = `recruiter-${marker}@example.com`;
  const reg = await api('/api/auth/register', 'POST', {
    email,
    password: 'Password123!',
    role: 'recruiter'
  });
  assert.equal(reg.status, 201);
  createdUserIds.push(reg.body.user.id);

  const login = await api('/api/auth/login', 'POST', { email, password: 'Password123!' });
  assert.equal(login.status, 200);
  const recruiterToken = login.body.token;

  // 1. Recruiter posts a job -> appears in public search, categories, requirements keyword search, and job details.
  const created = await api('/api/recruiter/jobs', 'POST', {
    title: `Cloud Engineer ${marker}`,
    company: 'NorthStar Cloud',
    location: 'Montreal, QC',
    category: `Cloud ${marker}`,
    employmentType: 'Full-time',
    salary: '$90,000',
    description: 'Build reliable deployment pipelines.',
    requirements: `Kubernetes${marker}\nTerraform`
  }, recruiterToken);
  assert.equal(created.status, 201);
  const jobId = created.body.job.id;
  createdJobIds.push(jobId);

  const bySkill = await api(`/api/jobs?q=kubernetes${marker}`);
  assert.equal(bySkill.status, 200);
  assert.equal(bySkill.body.jobs.length, 1);
  assert.equal(bySkill.body.jobs[0].id, jobId);

  const categories = await api('/api/jobs/categories');
  assert.ok(categories.body.categories.includes(`Cloud ${marker}`));

  const detail = await api(`/api/jobs/${jobId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.job.title, `Cloud Engineer ${marker}`);
  assert.equal(detail.body.job.requirements, `Kubernetes${marker}\nTerraform`);

  // 2. Recruiter edits posting -> public search and details reflect updated fields.
  const updated = await api(`/api/recruiter/jobs/${jobId}`, 'PUT', {
    title: `Senior Cloud Engineer ${marker}`,
    company: 'NorthStar Cloud',
    location: 'Remote',
    category: `Cloud ${marker}`,
    employmentType: 'Full-time',
    salary: '$105,000',
    description: 'Lead platform reliability work.',
    requirements: `Docker${marker}\nTerraform`
  }, recruiterToken);
  assert.equal(updated.status, 200);

  const byUpdatedLocation = await api(`/api/jobs?q=docker${marker}&location=remote`);
  assert.equal(byUpdatedLocation.status, 200);
  assert.equal(byUpdatedLocation.body.jobs.length, 1);
  assert.equal(byUpdatedLocation.body.jobs[0].title, `Senior Cloud Engineer ${marker}`);

  // 3. Recruiter archives posting -> removed from public search and returns 404 on job details.
  const archived = await api(`/api/recruiter/jobs/${jobId}/archive`, 'PATCH', { archived: true }, recruiterToken);
  assert.equal(archived.status, 200);

  const afterArchiveSearch = await api(`/api/jobs?q=${marker}`);
  assert.equal(afterArchiveSearch.status, 200);
  assert.equal(afterArchiveSearch.body.jobs.length, 0);

  const afterArchiveDetail = await api(`/api/jobs/${jobId}`);
  assert.equal(afterArchiveDetail.status, 404);
});
