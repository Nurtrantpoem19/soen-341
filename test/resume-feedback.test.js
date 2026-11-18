// AI-Powered Resume Feedback (Sprint 3). Written before the implementation (test-driven development).
// The Gemini API is never called here: tests inject a fake client, so they are free, offline and deterministic.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const jwt = require('jsonwebtoken');
const { migrate } = require('../db/migrate');
const { createApp } = require('../server');
const {
  buildFeedbackRequest,
  extractDocxText,
  parseFeedback,
  createResumeFeedbackService,
  FeedbackError,
  FEEDBACK_SCHEMA
} = require('../services/resume-feedback');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'feedback-test-only-secret';

const validFeedback = {
  overallScore: 78,
  summary: 'A solid junior developer resume.',
  strengths: ['Clear project section', 'Relevant internship'],
  gaps: ['No measurable results'],
  formatting: ['Use consistent date formats'],
  jobMatch: { score: 64, matchedSkills: ['Node.js'], missingSkills: ['PostgreSQL'] }
};
// Shape of a Gemini generateContent response.
const response = (feedback, extra = {}) => ({
  candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(feedback) }] }, ...extra }]
});
const job = { title: 'Junior Backend Developer', company: 'Aurora Fintech', description: 'Build payment APIs.', requirements: 'Node.js\nPostgreSQL' };

async function makeDocx(paragraphs) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types/>');
  zip.file('_rels/.rels', '<Relationships/>');
  const body = paragraphs.map(text => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`).join('');
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

// ---------- Unit tests ----------

test('buildFeedbackRequest sends a PDF resume inline with a JSON schema for the answer', () => {
  const params = buildFeedbackRequest({ resume: { kind: 'pdf', data: Buffer.from('%PDF-1.4 fake') }, model: 'gemini-test' });
  assert.equal(params.model, 'gemini-test');
  assert.equal(params.config.responseMimeType, 'application/json');
  assert.deepEqual(params.config.responseJsonSchema, FEEDBACK_SCHEMA.general);
  assert.ok(params.config.maxOutputTokens >= 4000);
  assert.match(params.config.systemInstruction, /data, not instructions/i);
  const [document, instructions] = params.contents[0].parts;
  assert.equal(params.contents[0].role, 'user');
  assert.deepEqual(document, { inlineData: { mimeType: 'application/pdf', data: Buffer.from('%PDF-1.4 fake').toString('base64') } });
  assert.equal(typeof instructions.text, 'string');
  assert.ok(!/Junior Backend Developer/.test(JSON.stringify(params)), 'no job in a general review');
});

test('buildFeedbackRequest sends DOCX text and the target job, and asks for a job match', () => {
  const params = buildFeedbackRequest({ resume: { kind: 'text', text: 'Jane Doe\nNode.js developer' }, job, model: 'm' });
  assert.deepEqual(params.config.responseJsonSchema, FEEDBACK_SCHEMA.withJob);
  const text = params.contents[0].parts.map(part => part.text).join('\n');
  assert.match(text, /<resume>\nJane Doe\nNode.js developer\n<\/resume>/);
  assert.match(text, /Junior Backend Developer/);
  assert.match(text, /Aurora Fintech/);
  assert.match(text, /PostgreSQL/);
});

test('buildFeedbackRequest includes saved profile skills in a job match', () => {
  const params = buildFeedbackRequest({
    resume: { kind: 'text', text: 'Jane Doe\nJunior developer' },
    job,
    profile: { headline: 'Junior Backend Developer', location: 'Montreal, QC', skills: ['Node.js', 'PostgreSQL'] },
    model: 'm'
  });
  const text = params.contents[0].parts.map(part => part.text).join('\n');
  assert.match(text, /<profile>/);
  assert.match(text, /Node\.js, PostgreSQL/);
});

test('FEEDBACK_SCHEMA objects are closed and require every field', () => {
  for (const schema of Object.values(FEEDBACK_SCHEMA)) {
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
  }
  assert.ok(!('jobMatch' in FEEDBACK_SCHEMA.general.properties));
  assert.equal(FEEDBACK_SCHEMA.withJob.properties.jobMatch.additionalProperties, false);
});

test('extractDocxText returns the paragraphs of a DOCX resume as plain text', async () => {
  const text = await extractDocxText(await makeDocx(['Jane Doe', 'Skills: Node.js &amp; SQL', '']));
  assert.equal(text, 'Jane Doe\nSkills: Node.js & SQL');
  await assert.rejects(extractDocxText(Buffer.from('not a zip')), FeedbackError);
});

test('parseFeedback accepts valid structured output and normalizes it', () => {
  assert.deepEqual(parseFeedback(response(validFeedback), { withJob: true }), validFeedback);
  const { jobMatch, ...general } = validFeedback;
  assert.deepEqual(parseFeedback(response(general), { withJob: false }), { ...general, jobMatch: null });
  // Thought parts are skipped, and text split over several parts is joined.
  const json = JSON.stringify(general);
  const split = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'thinking...', thought: true }, { text: json.slice(0, 20) }, { text: json.slice(20) }] } }] };
  assert.equal(parseFeedback(split, { withJob: false }).overallScore, 78);
  // Overlong lists and strings are capped so one response cannot flood the page.
  const long = parseFeedback(response({ ...general, strengths: Array(20).fill('x'.repeat(900)) }), { withJob: false });
  assert.equal(long.strengths.length, 8);
  assert.equal(long.strengths[0].length, 500);
});

test('parseFeedback rejects blocked, truncated and invalid output', () => {
  const code = fn => { try { fn(); } catch (error) { assert.ok(error instanceof FeedbackError); return error.code; } assert.fail('expected a FeedbackError'); };
  assert.equal(code(() => parseFeedback({ promptFeedback: { blockReason: 'SAFETY' } }, { withJob: false })), 'refused');
  for (const finishReason of ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'OTHER']) {
    assert.equal(code(() => parseFeedback(response(validFeedback, { finishReason }), { withJob: true })), 'refused', finishReason);
  }
  assert.equal(code(() => parseFeedback(response(validFeedback, { finishReason: 'MAX_TOKENS' }), { withJob: true })), 'incomplete');
  assert.equal(code(() => parseFeedback({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json' }] } }] }, { withJob: false })), 'invalid_output');
  assert.equal(code(() => parseFeedback({ candidates: [] }, { withJob: false })), 'invalid_output');
  assert.equal(code(() => parseFeedback({}, { withJob: false })), 'invalid_output');
  for (const bad of [{ overallScore: 101 }, { overallScore: -1 }, { overallScore: 7.5 }, { overallScore: '80' }, { summary: 5 }, { strengths: 'x' }, { gaps: [1] }]) {
    assert.equal(code(() => parseFeedback(response({ ...validFeedback, ...bad }), { withJob: true })), 'invalid_output', JSON.stringify(bad));
  }
  assert.equal(code(() => parseFeedback(response({ ...validFeedback, jobMatch: null }), { withJob: true })), 'invalid_output');
  assert.equal(code(() => parseFeedback(response({ ...validFeedback, jobMatch: { ...validFeedback.jobMatch, score: 200 } }), { withJob: true })), 'invalid_output');
});

test('the service reads the file, calls Gemini once and maps API failures', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'feedback-'));
  const pdf = path.join(dir, 'resume.pdf');
  await fs.writeFile(pdf, '%PDF-1.4 test resume');
  const calls = [];
  const client = { models: { generateContent: async params => { calls.push(params); return response(validFeedback); } } };
  const service = createResumeFeedbackService({ client, model: 'gemini-test' });
  const result = await service.analyze({ filePath: pdf, mimeType: 'application/pdf', job });
  assert.deepEqual(result.feedback, validFeedback);
  assert.equal(result.model, 'gemini-test');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].contents[0].parts[0].inlineData.data, Buffer.from('%PDF-1.4 test resume').toString('base64'));

  const { ApiError } = require('@google/genai');
  const failing = error => createResumeFeedbackService({ client: { models: { generateContent: async () => { throw error; } } }, model: 'm' });
  for (const [error, expected] of [
    [new ApiError({ status: 429, message: 'quota' }), 'busy'],
    [new ApiError({ status: 401, message: 'bad key' }), 'not_configured'],
    [new ApiError({ status: 403, message: 'denied' }), 'not_configured'],
    [new ApiError({ status: 400, message: 'bad file' }), 'unreadable'],
    [new ApiError({ status: 503, message: 'overloaded' }), 'unavailable'],
    [new TypeError('fetch failed'), 'unavailable']
  ]) {
    await assert.rejects(failing(error).analyze({ filePath: pdf, mimeType: 'application/pdf' }), err => err instanceof FeedbackError && err.code === expected, String(error));
  }
  await assert.rejects(createResumeFeedbackService({ client: null }).analyze({ filePath: pdf, mimeType: 'application/pdf' }), err => err.code === 'not_configured');
  await fs.rm(dir, { recursive: true });
});

test('the service retries once on the backup model when the main model is overloaded or out of quota', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'feedback-'));
  const pdf = path.join(dir, 'resume.pdf');
  await fs.writeFile(pdf, '%PDF-1.4 test resume');
  const { ApiError } = require('@google/genai');
  const { jobMatch, ...general } = validFeedback;
  // failures maps a model to the error it throws; any other model answers normally.
  function fakeClient(failures) {
    const models = [];
    return { models, client: { models: { generateContent: async params => {
      models.push(params.model);
      if (failures[params.model]) throw failures[params.model];
      return response(general);
    } } } };
  }
  const analyze = (fake, options = {}) => createResumeFeedbackService({ client: fake.client, model: 'main', fallbackModel: 'backup', ...options }).analyze({ filePath: pdf, mimeType: 'application/pdf' });

  for (const status of [503, 500, 429]) {
    const fake = fakeClient({ main: new ApiError({ status, message: 'overloaded' }) });
    const result = await analyze(fake);
    assert.deepEqual(fake.models, ['main', 'backup'], `status ${status}`);
    assert.equal(result.model, 'backup');
  }
  // Errors the backup cannot fix are not retried.
  for (const status of [400, 401, 403]) {
    const fake = fakeClient({ main: new ApiError({ status, message: 'no' }) });
    await assert.rejects(analyze(fake));
    assert.deepEqual(fake.models, ['main'], `status ${status}`);
  }
  // Both overloaded: the backup's error is reported.
  const both = fakeClient({ main: new ApiError({ status: 503, message: 'busy' }), backup: new ApiError({ status: 429, message: 'quota' }) });
  await assert.rejects(analyze(both), err => err.code === 'busy');
  assert.deepEqual(both.models, ['main', 'backup']);
  // No backup configured, or the same model: only one attempt.
  for (const fallbackModel of [null, '', 'main']) {
    const fake = fakeClient({ main: new ApiError({ status: 503, message: 'busy' }) });
    await assert.rejects(analyze(fake, { fallbackModel }), err => err.code === 'unavailable');
    assert.deepEqual(fake.models, ['main']);
  }
  await fs.rm(dir, { recursive: true });
});

// ---------- Integration and acceptance tests ----------

test('resume feedback API', async t => {
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'feedback-api-'));
  const users = [], jobs = [];
  let server;
  t.after(async () => {
    try {
      if (server?.listening) await new Promise(resolve => server.close(resolve));
      for (const id of jobs) await pool.query('DELETE FROM jobs WHERE id=$1', [id]);
      for (const id of users) await pool.query('DELETE FROM users WHERE id=$1', [id]);
      await fs.rm(dir, { recursive: true, force: true });
    } finally { await pool.end(); }
  });
  await migrate(pool);
  const marker = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  for (const name of ['owner', 'other']) {
    users.push((await pool.query('INSERT INTO users(email,password_hash) VALUES ($1,$2) RETURNING id', [`${name}-${marker}@example.com`, 'test-only'])).rows[0].id);
  }
  const [owner, other] = users;
  async function addResume(userId, name, mimeType, contents) {
    const storagePath = path.join(dir, `${marker}-${name}`);
    await fs.writeFile(storagePath, contents);
    return (await pool.query('INSERT INTO resumes(user_id,original_name,storage_path,file_size,mime_type) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [userId, name, storagePath, contents.length, mimeType])).rows[0].id;
  }
  const pdfId = await addResume(owner, 'resume.pdf', 'application/pdf', Buffer.from('%PDF-1.4 owner resume'));
  const docxId = await addResume(owner, 'resume.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', await makeDocx(['Jane Doe', 'Node.js developer']));
  const otherId = await addResume(other, 'other.pdf', 'application/pdf', Buffer.from('%PDF-1.4 other resume'));
  for (const open of [true, false]) {
    jobs.push((await pool.query(`INSERT INTO jobs(title,company,location,category,employment_type,description,requirements,is_open)
      VALUES ('Junior Backend Developer','Aurora Fintech','Toronto','Engineering','Full-time','Build payment APIs.','Node.js',$1) RETURNING id`, [open])).rows[0].id);
  }
  const [openJob, closedJob] = jobs;
  await pool.query(
    'INSERT INTO profiles(user_id,first_name,last_name,phone,location,headline,skills) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [owner, 'Jane', 'Doe', '555-0100', 'Montreal, QC', 'Junior Backend Developer', JSON.stringify(['Node.js', 'PostgreSQL'])]
  );

  // A fake AI service records what it receives and returns whatever the current test sets.
  const calls = [];
  let next = async () => ({ feedback: { ...validFeedback, jobMatch: null }, model: 'fake-model' });
  const resumeFeedback = { analyze: async input => { calls.push(input); return next(input); } };
  server = createApp(pool, { resumeFeedback }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = id => jwt.sign({ userId: id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
  async function request(method, url, { body, as = owner } = {}) {
    const response = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', ...(as ? { Authorization: `Bearer ${token(as)}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  }
  const saved = async () => Number((await pool.query('SELECT COUNT(*) AS count FROM resume_feedback WHERE user_id=$1', [owner])).rows[0].count);

  await t.test('acceptance: only the resume owner can request or read feedback', async () => {
    assert.equal((await request('POST', `/api/resumes/${pdfId}/feedback`, { body: {}, as: null })).status, 401);
    assert.equal((await request('GET', `/api/resumes/${pdfId}/feedback`, { as: null })).status, 401);
    assert.equal((await request('POST', `/api/resumes/${otherId}/feedback`, { body: {} })).status, 404);
    assert.equal((await request('POST', `/api/resumes/${pdfId}/feedback`, { body: {}, as: other })).status, 404);
    assert.equal((await request('GET', `/api/resumes/${pdfId}/feedback`, { as: other })).status, 404);
    assert.equal(calls.length, 0, 'the AI service is never called for someone else\'s resume');
  });

  await t.test('invalid resume IDs, job IDs and bodies are rejected before calling the AI', async () => {
    for (const id of ['abc', '0', '-1', '1.5']) assert.equal((await request('POST', `/api/resumes/${id}/feedback`, { body: {} })).status, 400, id);
    for (const jobId of ['abc', 0, -1, 1.5, true, [], {}]) assert.equal((await request('POST', `/api/resumes/${pdfId}/feedback`, { body: { jobId } })).status, 400, JSON.stringify(jobId));
    assert.equal((await request('POST', `/api/resumes/${pdfId}/feedback`, { body: { jobId: closedJob } })).status, 404);
    assert.equal((await request('POST', `/api/resumes/${pdfId}/feedback`, { body: { jobId: 2147483647 } })).status, 404);
    assert.equal(calls.length, 0);
    assert.equal(await saved(), 0);
  });

  await t.test('acceptance: a job seeker gets general feedback on an uploaded PDF resume and it is saved', async () => {
    const result = await request('POST', `/api/resumes/${pdfId}/feedback`, { body: {} });
    assert.equal(result.status, 201);
    assert.equal(result.body.feedback.overallScore, 78);
    assert.deepEqual(result.body.feedback.strengths, validFeedback.strengths);
    assert.equal(result.body.feedback.jobMatch, null);
    assert.equal(result.body.resumeId, pdfId);
    assert.equal(result.body.jobId, null);
    assert.equal(result.body.model, 'fake-model');
    assert.ok(result.body.createdAt);
    assert.equal(calls[0].mimeType, 'application/pdf');
    assert.equal(await fs.readFile(calls[0].filePath, 'utf8'), '%PDF-1.4 owner resume');
    assert.equal(calls[0].job, null);
    assert.equal(await saved(), 1);
  });

  await t.test('acceptance: feedback can target an open job posting', async () => {
    next = async () => ({ feedback: validFeedback, model: 'fake-model' });
    const result = await request('POST', `/api/resumes/${docxId}/feedback`, { body: { jobId: String(openJob) } });
    assert.equal(result.status, 201);
    assert.equal(result.body.jobId, openJob);
    assert.equal(result.body.jobTitle, 'Junior Backend Developer');
    assert.equal(result.body.feedback.jobMatch.score, 64);
    const sent = calls.at(-1);
    assert.equal(sent.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.deepEqual(sent.job, { title: 'Junior Backend Developer', company: 'Aurora Fintech', description: 'Build payment APIs.', requirements: 'Node.js' });
  });

  await t.test('acceptance: the latest saved feedback is shown again later', async () => {
    const latest = await request('GET', `/api/resumes/${docxId}/feedback`);
    assert.equal(latest.status, 200);
    assert.equal(latest.body.feedback.jobMatch.score, 64);
    assert.equal(latest.body.jobTitle, 'Junior Backend Developer');
    const pdfLatest = await request('GET', `/api/resumes/${pdfId}/feedback`);
    assert.equal(pdfLatest.body.feedback.overallScore, 78);
    const none = await addResume(owner, 'new.pdf', 'application/pdf', Buffer.from('%PDF-1.4 new'));
    assert.equal((await request('GET', `/api/resumes/${none}/feedback`)).status, 404);
  });

  await t.test('acceptance: job matching uses the owned resume and saved profile skills', async () => {
    next = async () => ({ feedback: validFeedback, model: 'fake-model' });
    const unauthenticated = await request('POST', `/api/jobs/${openJob}/match`, { body: { resumeId: pdfId }, as: null });
    assert.equal(unauthenticated.status, 401);
    assert.equal((await request('POST', `/api/jobs/${openJob}/match`, { body: { resumeId: otherId } })).status, 404);
    const result = await request('POST', `/api/jobs/${openJob}/match`, { body: { resumeId: pdfId } });
    assert.equal(result.status, 201);
    assert.equal(result.body.jobId, openJob);
    assert.equal(result.body.feedback.jobMatch.score, 64);
    assert.equal(calls.at(-1).profile.headline, 'Junior Backend Developer');
    assert.deepEqual(calls.at(-1).profile.skills, ['Node.js', 'PostgreSQL']);
    const latest = await request('GET', `/api/jobs/${openJob}/match`);
    assert.equal(latest.status, 200);
    assert.equal(latest.body.resumeId, pdfId);
  });

  await t.test('AI failures return clear errors and save nothing', async () => {
    const before = await saved();
    for (const [code, status] of [['refused', 422], ['incomplete', 502], ['invalid_output', 502], ['busy', 503], ['unavailable', 503], ['not_configured', 503], ['unreadable', 422]]) {
      next = async () => { throw new FeedbackError(code, `test ${code}`); };
      const result = await request('POST', `/api/resumes/${pdfId}/feedback`, { body: {} });
      assert.equal(result.status, status, code);
      assert.ok(result.body.message && !result.body.message.includes('test '), 'internal error text is not exposed');
    }
    next = async () => { throw new Error('unexpected bug'); };
    assert.equal((await request('POST', `/api/resumes/${pdfId}/feedback`, { body: {} })).status, 500);
    assert.equal(await saved(), before);
  });

  await t.test('deleting the user removes their saved feedback', async () => {
    const extra = (await pool.query('INSERT INTO users(email,password_hash) VALUES ($1,$2) RETURNING id', [`extra-${marker}@example.com`, 'test-only'])).rows[0].id;
    const resumeId = await addResume(extra, 'extra.pdf', 'application/pdf', Buffer.from('%PDF-1.4 extra'));
    next = async () => ({ feedback: { ...validFeedback, jobMatch: null }, model: 'fake-model' });
    assert.equal((await request('POST', `/api/resumes/${resumeId}/feedback`, { body: {}, as: extra })).status, 201);
    await pool.query('DELETE FROM users WHERE id=$1', [extra]);
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM resume_feedback WHERE resume_id=$1', [resumeId])).rows[0].count), 0);
  });
});
