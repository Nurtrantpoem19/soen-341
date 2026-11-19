const { createNotification } = require('./notifications');

// In-app reminders are evaluated on notification polling, including after a server restart.
async function createDueReminders(pool, userId, now = new Date()) {
  const result = await pool.query(`SELECT j.id, j.title, j.company, j.deadline_at
    FROM deadline_subscriptions s JOIN jobs j ON j.id=s.job_id
    WHERE s.user_id=$1 AND j.is_open=TRUE AND j.deadline_at > $2 AND j.deadline_at <= $3`,
  [userId, now, new Date(now.getTime() + 24 * 60 * 60 * 1000)]);
  for (const job of result.rows) {
    const applied = await pool.query('SELECT id FROM applications WHERE user_id=$1 AND job_id=$2', [userId, job.id]);
    if (applied.rowCount) continue;
    const deadline = new Date(job.deadline_at).toISOString();
    await createNotification(pool, {
      userId, type: 'deadline_reminder', title: 'Application deadline approaching',
      message: `${job.title} at ${job.company} closes at ${deadline} (UTC).`,
      link: `/frontend/job.html?id=${job.id}`, jobId: job.id,
      dedupeKey: `deadline:${job.id}:${deadline}`
    });
  }
}
module.exports = { createDueReminders };
