const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { migrate } = require('../db/migrate');
const { createApp } = require('../server');
const fsPromises = require('node:fs/promises');
// Use a dedicated secret for automated tests only.
// Production must use its own securely generated JWT_SECRET.
process.env.JWT_SECRET = 'careerconnect-test-only-jwt-secret-not-for-production';
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
let secondCleanupId;
let uploadedResumeId;
let uploadedResumePath;
let server;

t.after(async () => {
  try {
    if (server?.listening) {
      await new Promise(resolve => server.close(resolve));
    }

    if (uploadedResumePath) {
      await fsPromises.unlink(uploadedResumePath).catch(error => {
        if (error.code !== 'ENOENT') throw error;
      });
    }

    if (cleanupId) {
      await pool.query('DELETE FROM users WHERE id=$1', [cleanupId]);
    }

    if (secondCleanupId) {
      await pool.query('DELETE FROM users WHERE id=$1', [secondCleanupId]);
    }
  } finally {
    await pool.end();
  }
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
  const preflight = await fetch(base + '/api/auth/register', {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5500', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  async function request(path, method = 'GET', body, token) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  return {
    status: response.status,
    body: await response.json()
  };
}
  assert.equal((await request('/api/health')).status, 200);
  assert.equal((await request('/api/auth/register', 'POST', { email: 'invalid', password: 'short' })).status, 400);
  assert.equal((await request('/api/auth/register', 'POST', { email, password: '1234567' })).status, 400);
  assert.equal((await request('/api/auth/register', 'POST', { email, password: 'x'.repeat(73) })).status, 400);
  const registration = await request('/api/auth/register', 'POST', { email, password: 'ExamplePass123!' });
  assert.equal(registration.status, 201);
  const id = registration.body.user.id;
  cleanupId = id;
  // Verify login and retrieve authentication token
const login = await request('/api/auth/login', 'POST', {
  email,
  password: 'ExamplePass123!'
});

assert.equal(login.status, 200);
assert.ok(login.body.token);

const token = login.body.token;
// Test authenticated resume upload
const resumeForm = new FormData();

const pdfContent = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'
);

resumeForm.append(
  'resume',
  new Blob([pdfContent], { type: 'application/pdf' }),
  'automated-test-resume.pdf'
);

const resumeUpload = await fetch(base + '/api/resumes', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`
  },
  body: resumeForm
});

assert.equal(resumeUpload.status, 201);

const uploadedResume = await resumeUpload.json();
uploadedResumeId = uploadedResume.resume.id;

assert.equal(uploadedResume.message, 'Resume uploaded successfully.');
assert.equal(uploadedResume.resume.original_name, 'automated-test-resume.pdf');

console.log('Resume upload test passed.');
const resumeList = await fetch(base + '/api/resumes', {
  method: 'GET',
  headers: {
    Authorization: `Bearer ${token}`
  }
});

assert.equal(resumeList.status, 200);

const resumeListBody = await resumeList.json();

assert.ok(Array.isArray(resumeListBody.resumes));

const listedResume = resumeListBody.resumes.find(
  resume => resume.id === uploadedResume.resume.id
);

assert.ok(listedResume);
assert.equal(listedResume.original_name, 'automated-test-resume.pdf');

console.log('Resume listing test passed.');
// Test authenticated resume download
const resumeDownload = await fetch(
  base + `/api/resumes/${uploadedResume.resume.id}/download`,
  {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  }
);

assert.equal(resumeDownload.status, 200);

const downloadedPdf = Buffer.from(
  await resumeDownload.arrayBuffer()
);

// Verify the downloaded file matches the uploaded PDF
assert.deepEqual(downloadedPdf, pdfContent);

console.log('Resume download test passed.');
// Test authenticated resume replacement
const replacementContent = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% Updated resume\n%%EOF'
);

const replacementForm = new FormData();

replacementForm.append(
  'resume',
  new Blob([replacementContent], { type: 'application/pdf' }),
  'updated-automated-resume.pdf'
);

const replacementResponse = await fetch(
  base + `/api/resumes/${uploadedResume.resume.id}`,
  {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: replacementForm
  }
);

assert.equal(replacementResponse.status, 200);

const replacementBody = await replacementResponse.json();

assert.equal(replacementBody.message, 'Resume replaced successfully.');
assert.equal(replacementBody.resume.id, uploadedResume.resume.id);
assert.equal(
  replacementBody.resume.original_name,
  'updated-automated-resume.pdf'
);

// Verify that downloading now returns the replacement file
const updatedDownload = await fetch(
  base + `/api/resumes/${uploadedResume.resume.id}/download`,
  {
    headers: {
      Authorization: `Bearer ${token}`
    }
  }
);

assert.equal(updatedDownload.status, 200);

const updatedPdf = Buffer.from(await updatedDownload.arrayBuffer());

assert.deepEqual(updatedPdf, replacementContent);

console.log('Resume replacement test passed.');
const resumeOwnerCheck = await pool.query(
  'SELECT id, user_id, storage_path FROM resumes WHERE id = $1',
  [uploadedResume.resume.id]
);
uploadedResumePath = resumeOwnerCheck.rows[0].storage_path;

const path = require('node:path');

const resumeDirectory = path.join(__dirname, '..', 'uploads', 'resumes');

// Resume endpoints must require authentication
const protectedEndpoints = [
  {
    method: 'GET',
    path: '/api/resumes'
  },
  {
    method: 'GET',
    path: `/api/resumes/${uploadedResume.resume.id}/download`
  },
  {
    method: 'POST',
    path: '/api/resumes'
  },
  {
    method: 'PUT',
    path: `/api/resumes/${uploadedResume.resume.id}`
  }
];

for (const endpoint of protectedEndpoints) {
  const response = await fetch(base + endpoint.path, {
    method: endpoint.method
  });

  assert.equal(
    response.status,
    401,
    `${endpoint.method} ${endpoint.path} should require authentication`
  );
}

console.log('Resume authentication tests passed.');
// Register a second user
const secondEmail = `second-user-${Date.now()}@example.com`;

const secondRegistration = await request('/api/auth/register', 'POST', {
  email: secondEmail,
  password: 'SecondPass123!'
});

assert.equal(secondRegistration.status, 201);
secondCleanupId = secondRegistration.body.user.id;

// Log in as the second user
const secondLogin = await request('/api/auth/login', 'POST', {
  email: secondEmail,
  password: 'SecondPass123!'
});

assert.equal(secondLogin.status, 200);

const secondToken = secondLogin.body.token;

// User B must not be able to download User A's resume
const forbiddenDownload = await fetch(
  base + `/api/resumes/${uploadedResume.resume.id}/download`,
  {
    headers: {
      Authorization: `Bearer ${secondToken}`
    }
  }
);

assert.equal(forbiddenDownload.status, 404);

// User B should not see User A's resume in their list
const secondUserList = await fetch(base + '/api/resumes', {
  headers: {
    Authorization: `Bearer ${secondToken}`
  }
});

assert.equal(secondUserList.status, 200);

const secondUserResumes = await secondUserList.json();

assert.deepEqual(secondUserResumes.resumes, []);

console.log('Resume ownership tests passed.');
const invalidForm = new FormData();

invalidForm.append(
  'resume',
  new Blob(['This is not a real PDF'], {
    type: 'application/pdf'
  }),
  'fake-resume.pdf'
);

const invalidUpload = await fetch(base + '/api/resumes', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`
  },
  body: invalidForm
});

assert.equal(invalidUpload.status, 400);

console.log('Invalid resume upload test passed.');
// Test that another user cannot replace this resume
const unauthorizedForm = new FormData();

unauthorizedForm.append(
  'resume',
  new Blob([replacementContent], { type: 'application/pdf' }),
  'unauthorized-replacement.pdf'
);

const unauthorizedReplacement = await fetch(
  base + `/api/resumes/${uploadedResume.resume.id}`,
  {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${secondToken}`
    },
    body: unauthorizedForm
  }
);

assert.equal(unauthorizedReplacement.status, 404);

// Confirm the original owner's file was not changed
const ownerDownload = await fetch(
  base + `/api/resumes/${uploadedResume.resume.id}/download`,
  {
    headers: {
      Authorization: `Bearer ${token}`
    }
  }
);

assert.equal(ownerDownload.status, 200);

const ownerPdf = Buffer.from(await ownerDownload.arrayBuffer());

assert.deepEqual(ownerPdf, replacementContent);

console.log('Resume replacement ownership test passed.');
// Test rejection of resumes larger than 5 MB
const oversizedForm = new FormData();

const oversizedPdf = Buffer.concat([
  Buffer.from('%PDF-1.4\n'),
  Buffer.alloc(6 * 1024 * 1024, 65)
]);

oversizedForm.append(
  'resume',
  new Blob([oversizedPdf], { type: 'application/pdf' }),
  'oversized-resume.pdf'
);

const oversizedUpload = await fetch(base + '/api/resumes', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`
  },
  body: oversizedForm
});

assert.equal(oversizedUpload.status, 413);

console.log('Resume file size limit test passed.');
// Test rejection of unsupported file types
const unsupportedForm = new FormData();

unsupportedForm.append(
  'resume',
  new Blob(['This is a text file'], {
    type: 'text/plain'
  }),
  'resume.txt'
);

const unsupportedUpload = await fetch(base + '/api/resumes', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`
  },
  body: unsupportedForm
});

assert.equal(unsupportedUpload.status, 400);

console.log('Unsupported resume file type test passed.');
// Verify rejected uploads did not create database records
const finalResumeList = await fetch(base + '/api/resumes', {
  headers: {
    Authorization: `Bearer ${token}`
  }
});

assert.equal(finalResumeList.status, 200);

const finalResumeBody = await finalResumeList.json();

assert.equal(finalResumeBody.resumes.length, 1);
assert.equal(
  finalResumeBody.resumes[0].id,
  uploadedResume.resume.id
);

console.log('Rejected upload database cleanup test passed.');
// Incorrect password must be rejected
const invalidLogin = await request('/api/auth/login', 'POST', {
  email,
  password: 'WrongPassword123!'
});

assert.equal(invalidLogin.status, 401);
  assert.equal(registration.body.user.password_hash, undefined);
  const hash = (await pool.query('SELECT password_hash FROM users WHERE id=$1', [id])).rows[0].password_hash;
  assert.ok(await bcrypt.compare('ExamplePass123!', hash));
  assert.equal((await request('/api/auth/register', 'POST', { email: email.toUpperCase(), password: 'ExamplePass123!' })).status, 409);
const profile = {
  firstName: 'Test',
  lastName: 'Student',
  phone: '555-0100',
  location: 'Montreal',
  headline: 'Student'
};

// Unauthenticated requests must be rejected
assert.equal(
  (await request('/api/profile', 'POST', profile)).status,
  401
);

// Invalid profile data must be rejected
assert.equal(
  (await request('/api/profile', 'POST', {}, token)).status,
  400
);

// Create profile
assert.equal(
  (await request('/api/profile', 'POST', profile, token)).status,
  201
);

// Prevent duplicate profiles
assert.equal(
  (await request('/api/profile', 'POST', profile, token)).status,
  409
);

// Update profile
assert.equal(
  (await request('/api/profile/me', 'PUT', {
    ...profile,
    headline: 'Developer'
  }, token)).status,
  200
);

// Restart server and verify persistence
await stop();
base = await start();

assert.equal(
  (await request('/api/profile/me', 'GET', undefined, token))
    .body.profile.headline,
  'Developer'
);
  await assert.rejects(pool.query('UPDATE profiles SET summary=$1 WHERE user_id=$2', ['x'.repeat(2001), id]));
  await assert.rejects(pool.query('INSERT INTO resumes (user_id,original_name,storage_path,file_size,mime_type) VALUES ($1,$2,$3,$4,$5)', [id,'bad.exe',`bad-${id}`,10,'application/octet-stream']));
  await pool.query('INSERT INTO resumes (user_id,original_name,storage_path,file_size,mime_type) VALUES ($1,$2,$3,$4,$5)', [id,'resume.pdf',`test-${id}`,100,'application/pdf']);
 await stop();
base = await start(false);

assert.equal(
  (await request('/api/profile/me', 'GET')).status,
  401
);
  await pool.query('DELETE FROM users WHERE id=$1', [id]);
  assert.equal((await pool.query('SELECT * FROM profiles WHERE user_id=$1', [id])).rowCount, 0);
  assert.equal((await pool.query('SELECT * FROM resumes WHERE user_id=$1', [id])).rowCount, 0);
});
