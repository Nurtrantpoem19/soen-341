const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { migrate } = require('../db/migrate');
const db = require('../db/sprint3');

// PostgreSQL-specific queries (locking, JSON aggregation, date_trunc) need the
// real engine. CI supplies TEST_DATABASE_URL. Every case has an isolated schema.
async function fixture(t) {
  const url = process.env.TEST_DATABASE_URL;
  const admin = new Pool({ connectionString: url });
  const schema = `s3_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  t.after(async () => {
    await pool.end();
    try { await admin.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await admin.end(); }
  });
  await migrate(pool);
  await migrate(pool);
  assert.equal((await pool.query('SELECT * FROM schema_migrations')).rowCount, 4);
  const people = (await pool.query(`INSERT INTO users(email,password_hash) VALUES
    ('candidate@test.com','test'),('recruiter@test.com','test'),('other@test.com','test') RETURNING id`)).rows.map(r => r.id);
  const [candidate, recruiter, other] = people;
  const job = (await pool.query(`INSERT INTO jobs(recruiter_id,title,company,location,category,employment_type,description)
    VALUES ($1,'Developer','Example','Montreal','Engineering','Full-time','Develop software') RETURNING id`, [recruiter])).rows[0].id;
  async function apply(user = candidate, when = '2026-11-01T12:00:00Z') {
    return (await pool.query(`INSERT INTO applications(user_id,job_id,job_title,company,applied_at)
      VALUES ($1,$2,'Developer','Example',$3) RETURNING id`, [user, job, when])).rows[0].id;
  }
  return { pool, candidate, recruiter, other, job, apply };
}
const options = { skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run real PostgreSQL tests' };

test('posting lifecycle and applicant filters are scoped to the owner', options, async t => {
  const { pool, candidate, recruiter, other, job, apply } = await fixture(t);
  await apply();
  assert.equal(await db.setPostingState(pool, other, job, 'archived'), null);
  assert.equal((await db.setPostingState(pool, recruiter, job, 'draft')).is_open, false);
  assert.equal((await db.setPostingState(pool, recruiter, job, 'active')).is_open, true);
  assert.ok((await db.setPostingState(pool, recruiter, job, 'archived')).archived_at);
  assert.equal((await db.setPostingState(pool, recruiter, job, 'active')).archived_at, null);
  await assert.rejects(pool.query('UPDATE jobs SET is_draft=TRUE,is_open=TRUE WHERE id=$1', [job]), { code: '23514' });
  assert.equal((await db.listRecruiterApplications(pool, other, job)).length, 0);
  assert.equal((await db.listRecruiterApplications(pool, recruiter, job, { status: 'Applied', from: '2026-11-01', to: '2026-11-02' }))[0].user_id, candidate);
  assert.equal((await db.listRecruiterApplications(pool, recruiter, job, { status: 'Rejected' })).length, 0);
});

test('notifications deduplicate, respect due times and protect read state', options, async t => {
  const { pool, candidate, other, job } = await fixture(t);
  const input = { userId: candidate, eventType: 'deadline_reminder', message: 'Deadline approaching', jobId: job, deduplicationKey: 'deadline-1' };
  const n = await db.createNotification(pool, input);
  assert.equal(await db.createNotification(pool, input), null);
  await db.createNotification(pool, { ...input, deduplicationKey: 'future', scheduledFor: '2099-01-01' });
  assert.equal((await db.listNotifications(pool, candidate)).length, 1);
  assert.equal(await db.unreadCount(pool, candidate), 1);
  assert.equal(await db.setNotificationRead(pool, other, n.id), null);
  assert.ok((await db.setNotificationRead(pool, candidate, n.id)).read_at);
  assert.equal(await db.unreadCount(pool, candidate), 0);
  await db.setNotificationRead(pool, candidate, n.id, false);
  assert.equal(await db.unreadCount(pool, candidate), 1);
  assert.deepEqual(await db.listNotifications(pool, other), []);
  await assert.rejects(db.createNotification(pool, { ...input, eventType: 'bad' }), TypeError);
  await assert.rejects(db.listNotifications(pool, candidate, { limit: 1000 }), TypeError);
  await pool.query('DELETE FROM users WHERE id=$1', [candidate]);
  assert.equal((await pool.query('SELECT * FROM notifications WHERE user_id=$1', [candidate])).rowCount, 0);
});

test('candidate analytics count only owned records within UTC date bounds', options, async t => {
  const { pool, candidate, other, apply } = await fixture(t);
  await apply(candidate, '2026-11-01T00:00:00Z'); await apply(other, '2026-11-02T00:00:00Z');
  const result = await db.candidateAnalytics(pool, candidate, { from: '2026-11-01', to: '2026-12-01', bucket: 'month' });
  assert.equal(result.total, 1); assert.equal(result.byStatus.Applied, 1); assert.equal(result.byStatus.Rejected, 0);
  assert.equal(result.overTime.length, 1); assert.equal(result.overTime[0].count, 1);
  const empty = await db.candidateAnalytics(pool, candidate, { from: '2026-10-01', to: '2026-11-01', bucket: 'week' });
  assert.equal(empty.total, 0); assert.deepEqual(empty.overTime, []);
  assert.equal((await db.applicationHistory(pool, candidate)).length, 1);
  await assert.rejects(db.candidateAnalytics(pool, candidate, { from: 'bad', to: '2026-12-01' }), TypeError);
});

test('recruiter dashboard counts only owned postings and applications', options, async t => {
  const { pool, recruiter, other, job, apply } = await fixture(t);
  await apply();
  assert.deepEqual(await db.recruiterSummary(pool, recruiter), { active: 1, draft: 0, archived: 0, applications: 1, awaitingReview: 1 });
  assert.deepEqual(await db.recruiterSummary(pool, other), { active: 0, draft: 0, archived: 0, applications: 0, awaitingReview: 0 });
  await db.setPostingState(pool, recruiter, job, 'archived');
  assert.equal((await db.recruiterSummary(pool, recruiter)).archived, 1);
});
