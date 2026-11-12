const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrate } = require('../db/migrate');
const { createApp } = require('../server');
const {
  validateJobPayload,
  validateApplicationFilters,
  parsePositiveId
} = require('../routes/recruiters');

process.env.JWT_SECRET = 'careerconnect-test-only-jwt-secret-not-for-production';

// --- SPRINT 3 UNIT TESTS: RECRUITER VALIDATION HELPERS ---
test('Unit Tests: validateJobPayload, validateApplicationFilters, and parsePositiveId', () => {
  // 1. Valid job payload trimming and defaults
  const validJob = validateJobPayload({
    title: '  Backend Engineer  ',
    company: '  Maple Tech ',
    location: ' Montreal, QC ',
    category: ' Software Engineering ',
    employmentType: 'Full-time',
    salary: ' $85,000 ',
    description: ' Build scalable APIs. ',
    requirements: ' Node.js and SQL '
  });
  assert.ok(validJob);
  assert.equal(validJob.title, 'Backend Engineer');
  assert.equal(validJob.company, 'Maple Tech');
  assert.equal(validJob.salary, '$85,000');

  // 2. Reject invalid job payloads
  assert.equal(validateJobPayload(null), null);
  assert.equal(validateJobPayload([]), null);
  assert.equal(validateJobPayload({ title: '', company: 'A', location: 'B', category: 'C', employmentType: 'Full-time', description: 'D' }), null);
  assert.equal(validateJobPayload({ title: 'A', company: 'B', location: 'C', category: 'D', employmentType: 'InvalidType', description: 'E' }), null);

  // 3. Validate application filters (status and date range)
  const validFilters = validateApplicationFilters({
    status: 'Interview',
    fromDate: '2026-01-01',
    toDate: '2026-12-31'
  });
  assert.ok(validFilters);
  assert.equal(validFilters.status, 'Interview');
  assert.ok(validFilters.fromDate.startsWith('2026-01-01'));

  // Reject invalid status or inverted date range (fromDate > toDate)
  assert.equal(validateApplicationFilters({ status: 'NotAStatus' }), null);
  assert.equal(validateApplicationFilters({ fromDate: 'invalid-date' }), null);
  assert.equal(validateApplicationFilters({ fromDate: '2026-12-31', toDate: '2026-01-01' }), null);

  // 4. Validate positive integer IDs
  assert.equal(parsePositiveId('42'), 42);
  assert.equal(parsePositiveId(0), null);
  assert.equal(parsePositiveId('-5'), null);
  assert.equal(parsePositiveId('abc'), null);
});

// --- SPRINT 3 ACCEPTANCE TESTS: RECRUITER DASHBOARD & POSTING MANAGEMENT ---
test('Acceptance Tests: Recruiter job creation, editing, archiving, applicant filtering, and status updates', async t => {
  const { newDb, DataType } = require('pg-mem');
  const database = newDb({ noAstCoverageCheck: true });
  database.public.registerFunction({ name: 'trim', args: [DataType.text], returns: DataType.text, implementation: value => value.trim() });
  database.public.registerFunction({ name: 'length', args: [DataType.text], returns: DataType.integer, implementation: value => [...value].length });
  database.public.registerFunction({ name: 'strpos', args: [DataType.text, DataType.text], returns: DataType.integer, implementation: (str, sub) => str.indexOf(sub) + 1 });
  const { Pool } = database.adapters.createPg();
  const pool = new Pool();

  await migrate(pool);

  const server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await pool.end();
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

  // Register Recruiter A, Recruiter B, and Candidate
  const recAEmail = `recruiter-a-${Date.now()}@example.com`;
  const recBEmail = `recruiter-b-${Date.now()}@example.com`;
  const candEmail = `candidate-${Date.now()}@example.com`;

  await api('/api/auth/register', 'POST', { email: recAEmail, password: 'Password123!' });
  await api('/api/auth/register', 'POST', { email: recBEmail, password: 'Password123!' });
  await api('/api/auth/register', 'POST', { email: candEmail, password: 'Password123!' });

  const recAToken = (await api('/api/auth/login', 'POST', { email: recAEmail, password: 'Password123!' })).body.token;
  const recBToken = (await api('/api/auth/login', 'POST', { email: recBEmail, password: 'Password123!' })).body.token;
  const candToken = (await api('/api/auth/login', 'POST', { email: candEmail, password: 'Password123!' })).body.token;

  // Candidate creates a profile
  await api('/api/profile', 'POST', {
    firstName: 'Alice',
    lastName: 'Applicant',
    phone: '514-555-0199',
    location: 'Montreal, QC',
    headline: 'Software Engineering Student'
  }, candToken);

  // Story 1: Recruiter creates a job posting
  const createRes = await api('/api/recruiter/jobs', 'POST', {
    title: 'Full-Stack Developer Intern',
    company: 'Concordia Tech',
    location: 'Montreal, QC',
    category: 'Software Engineering',
    employmentType: 'Internship',
    salary: '$28 / hour',
    description: 'Build web features for our platform.',
    requirements: 'Node.js, PostgreSQL, Express'
  }, recAToken);

  assert.equal(createRes.status, 201);
  const jobId = createRes.body.job.id;
  assert.equal(createRes.body.job.title, 'Full-Stack Developer Intern');
  assert.equal(createRes.body.job.isOpen, true);

  // Story 2: Recruiter edits their job posting (and Recruiter B is blocked from editing it)
  const forbiddenEdit = await api(`/api/recruiter/jobs/${jobId}`, 'PUT', {
    title: 'Hacked Title',
    company: 'Concordia Tech',
    location: 'Montreal, QC',
    category: 'Software Engineering',
    employmentType: 'Internship',
    description: 'Updated description.'
  }, recBToken);
  assert.equal(forbiddenEdit.status, 404);

  const editRes = await api(`/api/recruiter/jobs/${jobId}`, 'PUT', {
    title: 'Senior Full-Stack Intern',
    company: 'Concordia Tech',
    location: 'Montreal, QC',
    category: 'Software Engineering',
    employmentType: 'Internship',
    salary: '$30 / hour',
    description: 'Updated description.',
    requirements: 'Node.js, PostgreSQL'
  }, recAToken);
  assert.equal(editRes.status, 200);
  assert.equal(editRes.body.job.title, 'Senior Full-Stack Intern');

  // Candidate applies to Recruiter A's job posting
  const applyRes = await api('/api/applications', 'POST', {
    jobId,
    coverLetter: 'I love building backend services!'
  }, candToken);
  assert.equal(applyRes.status, 201);
  const appId = applyRes.body.application.id;

  // Story 3: Recruiter views dashboard postings with application counts
  const listRes = await api('/api/recruiter/jobs', 'GET', undefined, recAToken);
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.jobs.length, 1);
  assert.equal(listRes.body.jobs[0].applicationCount, 1);

  // Story 4: Recruiter views applications for the posting with status & date filters
  const appsList = await api(`/api/recruiter/jobs/${jobId}/applications?status=Applied`, 'GET', undefined, recAToken);
  assert.equal(appsList.status, 200);
  assert.equal(appsList.body.applications.length, 1);
  assert.equal(appsList.body.applications[0].firstName, 'Alice');
  assert.equal(appsList.body.applications[0].candidateEmail, candEmail);

  const emptyFilterList = await api(`/api/recruiter/jobs/${jobId}/applications?status=Offered`, 'GET', undefined, recAToken);
  assert.equal(emptyFilterList.status, 200);
  assert.equal(emptyFilterList.body.applications.length, 0);

  // Story 5: Recruiter reviews candidate and updates application status
  const statusUpdate = await api(
    `/api/recruiter/jobs/${jobId}/applications/${appId}/status`,
    'PATCH',
    { status: 'Interview' },
    recAToken
  );
  assert.equal(statusUpdate.status, 200);
  assert.equal(statusUpdate.body.application.status, 'Interview');

  // Story 6: Recruiter archives the job posting (removes it from public active job search)
  const archiveRes = await api(`/api/recruiter/jobs/${jobId}/archive`, 'PATCH', { isOpen: false }, recAToken);
  assert.equal(archiveRes.status, 200);
  assert.equal(archiveRes.body.job.isOpen, false);

  const archivedList = await api('/api/recruiter/jobs?state=archived', 'GET', undefined, recAToken);
  assert.equal(archivedList.status, 200);
  assert.equal(archivedList.body.jobs.length, 1);
});