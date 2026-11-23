const { test } = require('node:test');
const assert = require('node:assert/strict');
const fsPromises = require('node:fs/promises');
const JSZip = require('jszip');
const { migrate } = require('../db/migrate');
const { createApp } = require('../server');
const { validateRegistration, validateLogin } = require('../routes/auth');
const { validateProfile } = require('../routes/profile');
const { parseResumeId } = require('../routes/resumes');

process.env.JWT_SECRET = 'careerconnect-test-only-jwt-secret-not-for-production';

async function createTestPool() {
  if (process.env.TEST_DATABASE_URL) {
    const { Pool } = require('pg');
    return new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  }
  const { newDb, DataType } = require('pg-mem');
  const db = newDb({ noAstCoverageCheck: true });
  db.public.registerFunction({ name: 'trim', args: [DataType.text], returns: DataType.text, implementation: v => v.trim() });
  db.public.registerFunction({ name: 'length', args: [DataType.text], returns: DataType.integer, implementation: v => [...v].length });
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

async function createValidDocxBuffer() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types/>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships/>');
  zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document><w:body><w:p><w:r><w:t>Resume content</w:t></w:r></w:p></w:body></w:document>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('validateRegistration and validateLogin check email, password, and role', () => {
  assert.ok(validateRegistration({ email: 'bad-email', password: 'Password123!' }).error);
  assert.ok(validateRegistration({ email: 'user@example.com', password: 'short' }).error);
  assert.ok(validateRegistration({ email: 'user@example.com', password: 'Password123!', role: 'admin' }).error);

  const ok = validateRegistration({ email: '  Recruiter@Example.COM ', password: 'Password123!', role: 'recruiter' });
  assert.equal(ok.error, undefined);
  assert.equal(ok.email, 'recruiter@example.com');
  assert.equal(ok.role, 'recruiter');

  assert.ok(validateLogin({ email: '', password: 'Password123!' }).error);
  assert.equal(validateLogin({ email: ' User@Example.com ', password: 'Password123!' }).email, 'user@example.com');
});

test('validateProfile validates required fields, optional company/summary, and deduplicates skills', () => {
  assert.equal(validateProfile(null), null);
  assert.equal(validateProfile({ firstName: 'A', lastName: 'B', phone: '1', location: 'MTL', headline: 'Dev', company: 'x'.repeat(201) }), null);
  assert.equal(validateProfile({ firstName: 'A', lastName: 'B', phone: '1', location: 'MTL', headline: 'Dev', summary: 'x'.repeat(2001) }), null);

  const valid = validateProfile({
    firstName: '  Jane ',
    lastName: ' Doe ',
    phone: ' 514-555-0100 ',
    location: ' Montreal, QC ',
    headline: ' Technical Recruiter ',
    company: '  CareerConnect Labs ',
    summary: '  Hiring software engineers in Montreal. ',
    skills: ['JavaScript', 'javascript', ' PostgreSQL ']
  });

  assert.deepEqual(valid, {
    firstName: 'Jane',
    lastName: 'Doe',
    phone: '514-555-0100',
    location: 'Montreal, QC',
    headline: 'Technical Recruiter',
    company: 'CareerConnect Labs',
    summary: 'Hiring software engineers in Montreal.',
    skills: ['JavaScript', 'PostgreSQL']
  });
});

test('parseResumeId accepts positive 32-bit integers only', () => {
  assert.equal(parseResumeId('12'), 12);
  assert.equal(parseResumeId('0'), null);
  assert.equal(parseResumeId('-5'), null);
  assert.equal(parseResumeId('1.5'), null);
  assert.equal(parseResumeId('abc'), null);
});

test('acceptance: auth logout revocation, recruiter/seeker profiles, DOCX upload and resume delete', async t => {
  const pool = await createTestPool();
  await migrate(pool);

  const server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const createdUserIds = [];
  const uploadedPaths = [];

  t.after(async () => {
    try {
      if (server.listening) {
        await new Promise(resolve => server.close(resolve));
      }
      for (const filePath of uploadedPaths) {
        await fsPromises.unlink(filePath).catch(err => {
          if (err.code !== 'ENOENT') throw err;
        });
      }
      for (const userId of createdUserIds) {
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      }
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

  const marker = Date.now();
  const recruiterEmail = `recruiter-s4-${marker}@example.com`;
  const seekerEmail = `seeker-s4-${marker}@example.com`;

  // 1. Register recruiter and job seeker
  const regRecruiter = await api('/api/auth/register', 'POST', {
    email: recruiterEmail,
    password: 'Password123!',
    role: 'recruiter'
  });
  assert.equal(regRecruiter.status, 201);
  createdUserIds.push(regRecruiter.body.user.id);

  const regSeeker = await api('/api/auth/register', 'POST', {
    email: seekerEmail,
    password: 'Password123!'
  });
  assert.equal(regSeeker.status, 201);
  createdUserIds.push(regSeeker.body.user.id);

  // 2. Login and verify /api/auth/me
  const loginRecruiter = await api('/api/auth/login', 'POST', {
    email: recruiterEmail,
    password: 'Password123!'
  });
  assert.equal(loginRecruiter.status, 200);
  const recruiterToken = loginRecruiter.body.token;

  const me = await api('/api/auth/me', 'GET', undefined, recruiterToken);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, 'recruiter');
  assert.equal(me.body.user.email, recruiterEmail);

  // 3. Recruiter creates and updates profile with dedicated company & summary fields
  const createRecruiterProfile = await api('/api/profile', 'POST', {
    firstName: 'Alex',
    lastName: 'Martin',
    company: 'NorthStar Tech',
    phone: '514-555-0199',
    location: 'Montreal, QC',
    headline: 'Engineering Recruiter',
    summary: 'Hiring full-stack interns and new grads.'
  }, recruiterToken);
  assert.equal(createRecruiterProfile.status, 201);
  assert.equal(createRecruiterProfile.body.profile.company, 'NorthStar Tech');
  assert.equal(createRecruiterProfile.body.profile.summary, 'Hiring full-stack interns and new grads.');
  assert.deepEqual(createRecruiterProfile.body.profile.skills, []);

  const updateRecruiterProfile = await api('/api/profile/me', 'PUT', {
    firstName: 'Alex',
    lastName: 'Martin',
    company: 'NorthStar Systems',
    phone: '514-555-0199',
    location: 'Montreal, QC',
    headline: 'Lead Recruiter',
    summary: 'Updated recruiting summary.'
  }, recruiterToken);
  assert.equal(updateRecruiterProfile.status, 200);
  assert.equal(updateRecruiterProfile.body.profile.company, 'NorthStar Systems');
  assert.equal(updateRecruiterProfile.body.profile.summary, 'Updated recruiting summary.');

  // 4. Logout revokes token server-side
  const logoutRes = await api('/api/auth/logout', 'POST', undefined, recruiterToken);
  assert.equal(logoutRes.status, 200);

  const afterLogoutMe = await api('/api/auth/me', 'GET', undefined, recruiterToken);
  assert.equal(afterLogoutMe.status, 401);

  const secondLogout = await api('/api/auth/logout', 'POST', undefined, recruiterToken);
  assert.equal(secondLogout.status, 401);

  // 5. Job seeker logs in, uploads a DOCX resume, verifies another user cannot delete it, then deletes it
  const loginSeeker = await api('/api/auth/login', 'POST', {
    email: seekerEmail,
    password: 'Password123!'
  });
  assert.equal(loginSeeker.status, 200);
  const seekerToken = loginSeeker.body.token;

  const loginRecruiterAgain = await api('/api/auth/login', 'POST', {
    email: recruiterEmail,
    password: 'Password123!'
  });
  const freshRecruiterToken = loginRecruiterAgain.body.token;

  const docxBuffer = await createValidDocxBuffer();
  const form = new FormData();
  form.append(
    'resume',
    new Blob([docxBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }),
    'sprint4-resume.docx'
  );

  const uploadRes = await fetch(base + '/api/resumes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${seekerToken}` },
    body: form
  });
  assert.equal(uploadRes.status, 201);
  const uploaded = await uploadRes.json();
  const resumeId = uploaded.resume.id;

  const row = await pool.query('SELECT storage_path FROM resumes WHERE id = $1', [resumeId]);
  const storagePath = row.rows[0].storage_path;
  uploadedPaths.push(storagePath);

  // Another user cannot delete seeker's resume
  const forbiddenDelete = await api(`/api/resumes/${resumeId}`, 'DELETE', undefined, freshRecruiterToken);
  assert.equal(forbiddenDelete.status, 404);

  // Invalid ID returns 400
  const invalidDelete = await api('/api/resumes/not-a-number', 'DELETE', undefined, seekerToken);
  assert.equal(invalidDelete.status, 400);

  // Owner deletes resume; DB row and disk file are removed
  const ownerDelete = await api(`/api/resumes/${resumeId}`, 'DELETE', undefined, seekerToken);
  assert.equal(ownerDelete.status, 200);
  assert.equal(ownerDelete.body.id, resumeId);

  const remaining = await api('/api/resumes', 'GET', undefined, seekerToken);
  assert.equal(remaining.status, 200);
  assert.deepEqual(remaining.body.resumes, []);

  await assert.rejects(fsPromises.access(storagePath));
});
