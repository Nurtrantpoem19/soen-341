const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { migrate } = require('../db/migrate');
const db = require('../db/sprint3');

// PostgreSQL-specific queries (JSON aggregation, date_trunc) need the
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
  assert.equal((await pool.query("SELECT * FROM schema_migrations WHERE name='006_application_query_indexes.sql'")).rowCount, 1);
  const indexes = await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND indexname IN ('applications_job_status_date_idx','applications_user_status_idx','applications_user_date_idx')");
  assert.equal(indexes.rowCount, 3);
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

test('applicant filters use existing jobs and stay scoped to the owner', options, async t => {
  const { pool, candidate, recruiter, other, job, apply } = await fixture(t);
  await apply();
  assert.equal((await db.listRecruiterApplications(pool, other, job)).length, 0);
  assert.equal((await db.listRecruiterApplications(pool, recruiter, job, { status: 'Applied', from: '2026-11-01', to: '2026-11-02' }))[0].user_id, candidate);
  assert.equal((await db.listRecruiterApplications(pool, recruiter, job, { status: 'Rejected' })).length, 0);
  assert.equal((await db.listRecruiterApplications(pool, recruiter, job, { from: '2026-11-02', to: '2026-11-03' })).length, 0);
});

test('existing notification service works with the complete migration set', options, async t => {
  const { createNotification } = require('../services/notifications');
  const { pool, candidate, job } = await fixture(t);
  const input = { userId: candidate, type: 'deadline_reminder', title: 'Reminder', message: 'Deadline approaching', jobId: job, dedupeKey: 'deadline-1' };
  const n = await createNotification(pool, input);
  assert.equal(n.userId, candidate);
  assert.equal(await createNotification(pool, input), null);
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
  assert.deepEqual(await db.recruiterSummary(pool, recruiter), { active: 1, archived: 0, applications: 1, awaitingReview: 1 });
  assert.deepEqual(await db.recruiterSummary(pool, other), { active: 0, archived: 0, applications: 0, awaitingReview: 0 });
  await pool.query('UPDATE jobs SET is_open=FALSE WHERE id=$1', [job]);
  assert.equal((await db.recruiterSummary(pool, recruiter)).archived, 1);
});
