const { createNotification } = require('../services/notifications');
const { randomUUID } = require('node:crypto');
const readId = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647 ? Number(value) : null;
function futureTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const calendar = new Date(value.slice(0,10) + 'T00:00:00Z');
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0,10) !== value.slice(0,10)) return null;
  const time = new Date(value);
  return Number.isFinite(time.getTime()) && time > new Date() ? time : null;
}
function registerSchedulingRoutes(app, pool, authenticateUser) {
  async function recruiter(req, res, next) {
    try {
      const { rows } = await pool.query('SELECT role FROM users WHERE id=$1', [req.user.id]);
      if (rows[0]?.role !== 'recruiter') return res.status(403).json({ message: 'Recruiter access required.' });
      next();
    } catch (error) { next(error); }
  }
  app.patch('/api/recruiter/jobs/:id/deadline', authenticateUser, recruiter, async (req, res, next) => {
    const id = readId(req.params.id);
    const deadline = req.body?.deadlineAt === null ? null : futureTime(req.body?.deadlineAt);
    if (!id || (deadline === null && req.body?.deadlineAt !== null)) return res.status(400).json({ message: 'Provide a future deadline with a timezone, or null to remove it.' });
    try {
      const result = await pool.query('UPDATE jobs SET deadline_at=$1 WHERE id=$2 AND recruiter_id=$3 RETURNING id, deadline_at AS "deadlineAt"', [deadline, id, req.user.id]);
      if (!result.rowCount) return res.status(404).json({ message: 'Job posting not found.' });
      res.json({ job: result.rows[0] });
    } catch (error) { next(error); }
  });
  app.post('/api/jobs/:id/reminder', authenticateUser, async (req, res, next) => {
    const id = readId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid job ID.' });
    try {
      const job = await pool.query('SELECT id FROM jobs WHERE id=$1 AND is_open=TRUE AND deadline_at > $2', [id, new Date()]);
      if (!job.rowCount) return res.status(404).json({ message: 'This job has no upcoming deadline.' });
      await pool.query('INSERT INTO deadline_subscriptions(user_id,job_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.user.id, id]);
      res.json({ message: 'Reminder saved. Check notifications within 24 hours before the deadline.' });
    } catch (error) { next(error); }
  });
  app.delete('/api/jobs/:id/reminder', authenticateUser, async (req, res, next) => {
    const id = readId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid job ID.' });
    try {
      await pool.query('DELETE FROM deadline_subscriptions WHERE user_id=$1 AND job_id=$2', [req.user.id, id]);
      res.json({ message: 'Reminder removed.' });
    } catch (error) { next(error); }
  });
  app.post('/api/recruiter/applications/:id/interview', authenticateUser, recruiter, async (req, res, next) => {
    const id = readId(req.params.id), scheduledAt = futureTime(req.body?.scheduledAt);
    const location = req.body?.location;
    if (!id || !scheduledAt || typeof location !== 'string' || !location.trim() || location.trim().length > 500) return res.status(400).json({ message: 'Provide a future interview time with timezone and a location or meeting link (up to 500 characters).' });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const owned = await client.query(`SELECT a.* FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.id=$1 AND j.recruiter_id=$2 FOR UPDATE`, [id, req.user.id]);
      if (!owned.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Application not found.' }); }
      const previous = await client.query('SELECT scheduled_at, location FROM interviews WHERE application_id=$1', [id]);
      const same = owned.rows[0].status === 'Interview' && previous.rowCount && new Date(previous.rows[0].scheduled_at).getTime() === scheduledAt.getTime() && previous.rows[0].location === location.trim();
      if (!same) {
        await client.query(`INSERT INTO interviews(application_id,scheduled_at,location) VALUES($1,$2,$3)
          ON CONFLICT(application_id) DO UPDATE SET scheduled_at=EXCLUDED.scheduled_at, location=EXCLUDED.location, updated_at=CURRENT_TIMESTAMP`, [id, scheduledAt, location.trim()]);
        await client.query("UPDATE applications SET status='Interview', updated_at=CURRENT_TIMESTAMP WHERE id=$1", [id]);
        const application = owned.rows[0];
        await createNotification(client, { userId: application.user_id, type: 'interview_invitation', title: previous.rowCount ? 'Interview rescheduled' : 'Interview invitation',
          message: `${application.job_title} at ${application.company}: ${scheduledAt.toISOString()} (UTC). Location: ${location.trim()}`,
          applicationId: id, jobId: application.job_id, actorUserId: req.user.id,
          link: '/frontend/applications.html', dedupeKey: `interview:${id}:${randomUUID()}` });
      }
      await client.query('COMMIT');
      res.json({ message: same ? 'Interview already scheduled.' : 'Interview invitation sent.', interview: { scheduledAt, location: location.trim() } });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally { if (client) client.release(); }
  });
  app.get('/api/interviews/me', authenticateUser, async (req, res, next) => {
    try {
      const result = await pool.query(`SELECT i.application_id AS "applicationId", i.scheduled_at AS "scheduledAt", i.location, a.job_title AS "jobTitle", a.company
        FROM interviews i JOIN applications a ON a.id=i.application_id WHERE a.user_id=$1 AND a.status='Interview' ORDER BY i.scheduled_at`, [req.user.id]);
      res.json({ interviews: result.rows });
    } catch (error) { next(error); }
  });
}
module.exports = { registerSchedulingRoutes, futureTime };
