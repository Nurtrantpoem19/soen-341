const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { migrate } = require('../db/migrate');
const { createApp } = require('../server');
const { validateJob, readDate, summarizePostings } = require('../routes/recruiter');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'recruiter-test-only-secret';

const posting = { title: 'Backend Developer', company: 'CareerConnect Labs', location: 'Montreal, QC', category: 'Engineering', employmentType: 'Full-time', salary: '$70,000', description: 'Build APIs.', requirements: 'Node.js\nSQL' };

// Unit tests: pure helpers, no database.
test('validateJob trims valid postings and rejects invalid ones', () => {
  assert.deepEqual(validateJob({ ...posting, title: '  Backend Developer  ' }), ['Backend Developer', 'CareerConnect Labs', 'Montreal, QC', 'Engineering', 'Full-time', '$70,000', 'Build APIs.', 'Node.js\nSQL']);
  const { salary, requirements, ...required } = posting;
  assert.deepEqual(validateJob(required).slice(5), ['', 'Build APIs.', '']);
  for (const body of [null, [], 'text', {}, { ...posting, title: '   ' }, { ...posting, title: 123 }, { ...posting, title: 'x'.repeat(201) },
    { ...posting, category: 'x'.repeat(101) }, { ...posting, description: undefined }, { ...posting, description: 'x'.repeat(5001) },
    { ...posting, salary: 'x'.repeat(101) }, { ...posting, requirements: null }, { ...posting, employmentType: 'Volunteer' }, { ...posting, employmentType: undefined }]) {
    assert.equal(validateJob(body), null, JSON.stringify(body)?.slice(0, 80));
  }
});

test('readDate accepts only real YYYY-MM-DD dates', () => {
  assert.equal(readDate('2026-11-05').toISOString(), '2026-11-05T00:00:00.000Z');
  assert.equal(readDate('2026-11-30', 1).toISOString(), '2026-12-01T00:00:00.000Z');
  for (const value of ['2026-02-30', '2026-13-01', '11/05/2026', '2026-11-5', '', 'today', undefined, 20261105, ['2026-11-05']]) {
    assert.equal(readDate(value), null, String(value));
  }
});

test('summarizePostings counts applications per posting and status', () => {
  const [first, second] = summarizePostings([{ id: 1, title: 'A' }, { id: 2, title: 'B' }], [
    { job_id: 1, status: 'Applied' }, { job_id: 1, status: 'Applied' }, { job_id: 1, status: 'Interview' }, { job_id: 99, status: 'Applied' }
  ]);
  assert.equal(first.applicationCount, 3);
  assert.deepEqual(first.applicationsByStatus, { Applied: 2, 'Under Review': 0, Interview: 1, Offered: 0, Rejected: 0 });
  assert.equal(second.applicationCount, 0);
  assert.equal(second.title, 'B');
});

// Integration and acceptance tests: real routes against PostgreSQL (CI) or pg-mem (local).
test('recruiter dashboard and posting management', async t => {
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
      for (const id of jobs) await pool.query('DELETE FROM jobs WHERE id=$1', [id]);
      for (const id of users) await pool.query('DELETE FROM users WHERE id=$1', [id]);
    } finally { await pool.end(); }
  });
  await migrate(pool);
  const marker = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  async function addUser(name, role) {
    const id = (await pool.query('INSERT INTO users(email,password_hash,role) VALUES ($1,$2,$3) RETURNING id', [`${name}-${marker}@example.com`, 'test-only', role])).rows[0].id;
    users.push(id);
    return id;
  }
  const recruiter = await addUser('recruiter', 'recruiter');
  const otherRecruiter = await addUser('other-recruiter', 'recruiter');
  const seeker = await addUser('seeker', 'job_seeker');
  const secondSeeker = await addUser('second-seeker', 'job_seeker');
  await pool.query(`INSERT INTO profiles(user_id,first_name,last_name,phone,location,headline) VALUES ($1,'Sam','Seeker','514-555-0100','Montreal','Junior developer')`, [seeker]);

  server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = id => jwt.sign({ userId: id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
  async function request(method, path, { body, as = recruiter } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(as ? { Authorization: `Bearer ${token(as)}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  }
  let jobId, otherJobId, applicationId, secondApplicationId;

  await t.test('registration and login carry the account role', async () => {
    const email = `signup-${marker}@example.com`;
    assert.equal((await request('POST', '/api/auth/register', { as: null, body: { email, password: 'ExamplePass123!', role: 'admin' } })).status, 400);
    const registration = await request('POST', '/api/auth/register', { as: null, body: { email, password: 'ExamplePass123!', role: 'recruiter' } });
    assert.equal(registration.status, 201);
    assert.equal(registration.body.user.role, 'recruiter');
    users.push(registration.body.user.id);
    const login = await request('POST', '/api/auth/login', { as: null, body: { email, password: 'ExamplePass123!' } });
    assert.equal(login.body.user.role, 'recruiter');
    const defaultRole = await request('POST', '/api/auth/register', { as: null, body: { email: `default-${marker}@example.com`, password: 'ExamplePass123!' } });
    assert.equal(defaultRole.body.user.role, 'job_seeker');
    users.push(defaultRole.body.user.id);
    assert.equal((await request('GET', '/api/auth/me', { as: seeker })).body.user.role, 'job_seeker');
    assert.equal((await request('GET', '/api/auth/me', { as: null })).status, 401);
  });

  await t.test('acceptance: only recruiters can reach recruiter routes', async () => {
    const routes = [
      ['GET', '/api/recruiter/jobs'], ['POST', '/api/recruiter/jobs', posting], ['PUT', '/api/recruiter/jobs/1', posting],
      ['PATCH', '/api/recruiter/jobs/1/archive', { archived: true }], ['GET', '/api/recruiter/jobs/1/applications'],
      ['PATCH', '/api/recruiter/applications/1/status', { status: 'Interview' }]
    ];
    for (const [method, path, body] of routes) {
      assert.equal((await request(method, path, { body, as: null })).status, 401, `${method} ${path} without a token`);
      const forbidden = await request(method, path, { body, as: seeker });
      assert.equal(forbidden.status, 403, `${method} ${path} as a job seeker`);
      assert.equal(forbidden.body.message, 'Recruiter access required.');
    }
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM jobs WHERE recruiter_id=$1', [seeker])).rows[0].count), 0);
  });

  await t.test('acceptance: a recruiter creates a posting that appears in job search and on the dashboard', async () => {
    assert.equal((await request('POST', '/api/recruiter/jobs', { body: { ...posting, title: '' } })).status, 400);
    assert.equal((await request('POST', '/api/recruiter/jobs', { body: { ...posting, employmentType: 'Volunteer' } })).status, 400);
    const created = await request('POST', '/api/recruiter/jobs', { body: { ...posting, title: `  Backend Developer ${marker} `, recruiterId: otherRecruiter, isOpen: false } });
    assert.equal(created.status, 201);
    jobId = created.body.job.id;
    jobs.push(jobId);
    assert.equal(created.body.job.title, `Backend Developer ${marker}`);
    assert.equal(created.body.job.isOpen, true);
    assert.equal((await pool.query('SELECT recruiter_id FROM jobs WHERE id=$1', [jobId])).rows[0].recruiter_id, recruiter);
    assert.equal((await request('GET', `/api/jobs/${jobId}`, { as: null })).status, 200);
    const other = await request('POST', '/api/recruiter/jobs', { as: otherRecruiter, body: { ...posting, title: `Other posting ${marker}` } });
    otherJobId = other.body.job.id;
    jobs.push(otherJobId);
    const dashboard = await request('GET', '/api/recruiter/jobs');
    assert.equal(dashboard.status, 200);
    assert.deepEqual(dashboard.body.jobs.map(job => job.id), [jobId]);
    assert.equal(dashboard.body.jobs[0].applicationCount, 0);
  });

  await t.test('acceptance: a recruiter edits only their own postings', async () => {
    const edited = await request('PUT', `/api/recruiter/jobs/${jobId}`, { body: { ...posting, title: `Senior Backend Developer ${marker}`, employmentType: 'Contract', salary: '' } });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.job.title, `Senior Backend Developer ${marker}`);
    assert.equal(edited.body.job.employmentType, 'Contract');
    assert.equal(edited.body.job.salary, '');
    assert.equal((await request('GET', `/api/jobs/${jobId}`, { as: null })).body.job.title, `Senior Backend Developer ${marker}`);
    assert.equal((await request('PUT', `/api/recruiter/jobs/${jobId}`, { body: { ...posting, description: '' } })).status, 400);
    assert.equal((await request('PUT', '/api/recruiter/jobs/abc', { body: posting })).status, 400);
    assert.equal((await request('PUT', `/api/recruiter/jobs/${otherJobId}`, { body: posting })).status, 404);
    assert.equal((await request('PUT', '/api/recruiter/jobs/2147483647', { body: posting })).status, 404);
    assert.equal((await pool.query('SELECT title FROM jobs WHERE id=$1', [otherJobId])).rows[0].title, `Other posting ${marker}`);
  });

  await t.test('acceptance: each posting shows the applications received, with status and date filters', async () => {
    const first = await request('POST', '/api/applications', { as: seeker, body: { jobId, coverLetter: 'Hire me' } });
    const second = await request('POST', '/api/applications', { as: secondSeeker, body: { jobId } });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    applicationId = first.body.application.id;
    secondApplicationId = second.body.application.id;
    await request('POST', '/api/applications', { as: seeker, body: { jobId: otherJobId } });
    await pool.query('UPDATE applications SET applied_at=$1 WHERE id=$2', ['2026-11-01T15:00:00Z', applicationId]);
    await pool.query('UPDATE applications SET applied_at=$1, status=$2 WHERE id=$3', ['2026-11-10T23:30:00Z', 'Interview', secondApplicationId]);

    const dashboard = await request('GET', '/api/recruiter/jobs');
    assert.equal(dashboard.body.jobs[0].applicationCount, 2);
    assert.equal(dashboard.body.jobs[0].applicationsByStatus.Interview, 1);

    const list = path => request('GET', `/api/recruiter/jobs/${jobId}/applications${path}`);
    const all = await list('');
    assert.equal(all.status, 200);
    assert.equal(all.body.job.id, jobId);
    assert.deepEqual(all.body.applications.map(row => row.id), [secondApplicationId, applicationId]);
    const candidate = all.body.applications[1];
    assert.equal(candidate.email, `seeker-${marker}@example.com`);
    assert.equal(candidate.firstName, 'Sam');
    assert.equal(candidate.headline, 'Junior developer');
    assert.equal(candidate.coverLetter, 'Hire me');
    assert.equal(all.body.applications[0].firstName, null);
    assert.ok(!('password_hash' in candidate) && !('passwordHash' in candidate));

    const ids = async path => (await list(path)).body.applications.map(row => row.id);
    assert.deepEqual(await ids('?status=Interview'), [secondApplicationId]);
    assert.deepEqual(await ids('?status=Rejected'), []);
    assert.deepEqual(await ids('?from=2026-11-02'), [secondApplicationId]);
    assert.deepEqual(await ids('?to=2026-11-01'), [applicationId]);
    assert.deepEqual(await ids('?from=2026-11-01&to=2026-11-10'), [secondApplicationId, applicationId]);
    assert.deepEqual(await ids('?status=Applied&from=2026-11-05'), []);
    for (const query of ['?status=Hired', '?from=yesterday', '?to=2026-02-30', '?from=2026-11-01&from=2026-11-02']) {
      assert.equal((await list(query)).status, 400, query);
    }
    assert.equal((await request('GET', `/api/recruiter/jobs/${otherJobId}/applications`)).status, 404);
    assert.equal((await request('GET', '/api/recruiter/jobs/0/applications')).status, 400);
  });

  await t.test('acceptance: a recruiter updates the status of candidates on their own postings', async () => {
    const update = (id, status, as) => request('PATCH', `/api/recruiter/applications/${id}/status`, { body: { status }, as });
    const updated = await update(applicationId, 'Under Review');
    assert.equal(updated.status, 200);
    assert.equal(updated.body.application.status, 'Under Review');
    for (const status of ['Interview', 'Offered', 'Rejected']) assert.equal((await update(applicationId, status)).body.application.status, status);
    for (const status of ['Hired', '', null, 5, undefined]) assert.equal((await update(applicationId, status)).status, 400);
    assert.equal((await update('abc', 'Interview')).status, 400);
    assert.equal((await update(applicationId, 'Offered', otherRecruiter)).status, 404);
    assert.equal((await update(2147483647, 'Offered')).status, 404);
    // The job seeker sees the recruiter's decision in their own history.
    const history = await request('GET', '/api/applications/me', { as: seeker });
    assert.equal(history.body.applications.find(row => row.id === applicationId).status, 'Rejected');
  });

  await t.test('acceptance: archiving hides a posting from job seekers and keeps its applications', async () => {
    const archive = (id, archived, as) => request('PATCH', `/api/recruiter/jobs/${id}/archive`, { body: { archived }, as });
    for (const archived of ['true', 1, null, undefined]) assert.equal((await archive(jobId, archived)).status, 400);
    assert.equal((await archive(otherJobId, true)).status, 404);
    const archived = await archive(jobId, true);
    assert.equal(archived.status, 200);
    assert.equal(archived.body.job.isOpen, false);
    assert.equal((await request('GET', `/api/jobs/${jobId}`, { as: null })).status, 404);
    assert.ok(!(await request('GET', '/api/jobs', { as: null })).body.jobs.some(job => job.id === jobId));
    assert.equal((await request('POST', '/api/applications', { as: otherRecruiter, body: { jobId } })).status, 404);
    const dashboard = await request('GET', '/api/recruiter/jobs');
    assert.equal(dashboard.body.jobs[0].isOpen, false);
    assert.equal(dashboard.body.jobs[0].applicationCount, 2);
    assert.equal((await request('GET', `/api/recruiter/jobs/${jobId}/applications`)).body.applications.length, 2);
    const restored = await archive(jobId, false);
    assert.equal(restored.body.job.isOpen, true);
    assert.equal((await request('GET', `/api/jobs/${jobId}`, { as: null })).status, 200);
  });
});
