// Database helpers, not HTTP endpoints. Actor IDs must come from authenticated
// server context. The HTTP layer must additionally enforce the recruiter role.
const STATUSES = ['Applied', 'Under Review', 'Interview', 'Offered', 'Rejected'];
const EVENTS = ['application_update', 'interview_invitation', 'deadline_reminder', 'new_application'];
function id(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) throw new TypeError('Invalid ID');
  return value;
}
function page(limit = 50, offset = 0) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) throw new TypeError('Invalid pagination');
  return [limit, offset];
}
function date(value) {
  if (!(value instanceof Date) && (typeof value !== 'string' || !value.trim())) throw new TypeError('Invalid date');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new TypeError('Invalid date');
  return parsed;
}
async function createNotification(db, input) {
  id(input.userId);
  if (!EVENTS.includes(input.eventType) || typeof input.message !== 'string' || !input.message.trim() || input.message.trim().length > 1000) throw new TypeError('Invalid notification');
  const key = input.deduplicationKey ?? null;
  if (key !== null && (typeof key !== 'string' || !key.length || key.length > 200)) throw new TypeError('Invalid deduplication key');
  const result = await db.query(`INSERT INTO notifications
    (user_id,event_type,message,application_id,job_id,scheduled_for,deduplication_key)
    VALUES ($1,$2,$3,$4,$5,COALESCE($6,CURRENT_TIMESTAMP),$7)
    ON CONFLICT (user_id,deduplication_key) DO NOTHING RETURNING *`,
  [input.userId, input.eventType, input.message.trim(), input.applicationId == null ? null : id(input.applicationId), input.jobId == null ? null : id(input.jobId), input.scheduledFor == null ? null : date(input.scheduledFor), key]);
  return result.rows[0] ?? null;
}
async function listNotifications(db, userId, { unreadOnly = false, limit = 50, offset = 0 } = {}) {
  if (typeof unreadOnly !== 'boolean') throw new TypeError('Invalid unread filter');
  const result = await db.query(`SELECT * FROM notifications WHERE user_id=$1
    AND scheduled_for <= CURRENT_TIMESTAMP AND ($2::boolean = FALSE OR read_at IS NULL)
    ORDER BY scheduled_for DESC,id DESC LIMIT $3 OFFSET $4`, [id(userId), unreadOnly, ...page(limit, offset)]);
  return result.rows;
}
async function unreadCount(db, userId) {
  const result = await db.query(`SELECT COUNT(*)::int AS count FROM notifications
    WHERE user_id=$1 AND read_at IS NULL AND scheduled_for <= CURRENT_TIMESTAMP`, [id(userId)]);
  return result.rows[0].count;
}
async function setNotificationRead(db, userId, notificationId, read = true) {
  if (typeof read !== 'boolean') throw new TypeError('Invalid read state');
  const result = await db.query(`UPDATE notifications SET read_at=CASE WHEN $3::boolean THEN CURRENT_TIMESTAMP ELSE NULL END
    WHERE id=$1 AND user_id=$2 AND scheduled_for <= CURRENT_TIMESTAMP RETURNING *`, [id(notificationId), id(userId), read]);
  return result.rows[0] ?? null;
}
async function setPostingState(db, recruiterId, jobId, state) {
  if (!['draft', 'active', 'archived'].includes(state)) throw new TypeError('Invalid posting state');
  const result = await db.query(`UPDATE jobs SET is_open=$3,is_draft=$4,
    archived_at=CASE WHEN $5::boolean THEN COALESCE(archived_at,CURRENT_TIMESTAMP) ELSE NULL END
    WHERE id=$1 AND recruiter_id=$2 RETURNING *`, [id(jobId), id(recruiterId), state === 'active', state === 'draft', state === 'archived']);
  return result.rows[0] ?? null;
}
async function listRecruiterApplications(db, recruiterId, jobId, { status = null, from = null, to = null, limit = 50, offset = 0 } = {}) {
  if (status !== null && !STATUSES.includes(status)) throw new TypeError('Invalid status');
  const start = from === null ? null : date(from), end = to === null ? null : date(to);
  if (start && end && start >= end) throw new TypeError('Invalid date range');
  const result = await db.query(`SELECT a.* FROM applications a JOIN jobs j ON j.id=a.job_id
    WHERE j.id=$1 AND j.recruiter_id=$2 AND ($3::text IS NULL OR a.status=$3)
    AND ($4::timestamptz IS NULL OR a.applied_at >= $4)
    AND ($5::timestamptz IS NULL OR a.applied_at < $5)
    ORDER BY a.applied_at DESC,a.id DESC LIMIT $6 OFFSET $7`,
  [id(jobId), id(recruiterId), status, start, end, ...page(limit, offset)]);
  return result.rows;
}
async function candidateAnalytics(db, userId, { from, to, bucket = 'month' }) {
  id(userId);
  if (!['day', 'week', 'month'].includes(bucket)) throw new TypeError('Invalid bucket');
  const start = date(from), end = date(to);
  if (start >= end) throw new TypeError('Invalid date range');
  // One statement ensures the counts and trend share a consistent snapshot.
  const result = await db.query(`WITH selected AS (
    SELECT status,applied_at FROM applications WHERE user_id=$1 AND applied_at >= $2 AND applied_at < $3
  ), counts AS (SELECT status,COUNT(*)::int AS count FROM selected GROUP BY status),
  trend AS (SELECT date_trunc($4,applied_at AT TIME ZONE 'UTC') AS period,COUNT(*)::int AS count
    FROM selected GROUP BY period ORDER BY period)
  SELECT (SELECT COUNT(*)::int FROM selected) AS total,
    COALESCE((SELECT jsonb_object_agg(status,count) FROM counts),'{}'::jsonb) AS "byStatus",
    COALESCE((SELECT jsonb_agg(jsonb_build_object('period',period,'count',count) ORDER BY period) FROM trend),'[]'::jsonb) AS "overTime"`,
  [userId, start, end, bucket]);
  const row = result.rows[0];
  row.byStatus = Object.fromEntries(STATUSES.map(status => [status, row.byStatus[status] || 0]));
  return row;
}
async function recruiterSummary(db, recruiterId) {
  const result = await db.query(`WITH owned AS (SELECT * FROM jobs WHERE recruiter_id=$1),
    received AS (SELECT a.* FROM applications a JOIN owned j ON j.id=a.job_id)
    SELECT (SELECT COUNT(*)::int FROM owned WHERE is_open=TRUE) AS active,
      (SELECT COUNT(*)::int FROM owned WHERE is_draft=TRUE) AS draft,
      (SELECT COUNT(*)::int FROM owned WHERE is_open=FALSE AND is_draft=FALSE) AS archived,
      (SELECT COUNT(*)::int FROM received) AS applications,
      (SELECT COUNT(*)::int FROM received WHERE status IN ('Applied','Under Review')) AS "awaitingReview"`, [id(recruiterId)]);
  return result.rows[0];
}
async function applicationHistory(db, userId, { limit = 50, offset = 0 } = {}) {
  const result = await db.query(`SELECT * FROM applications WHERE user_id=$1
    ORDER BY applied_at DESC,id DESC LIMIT $2 OFFSET $3`, [id(userId), ...page(limit, offset)]);
  return result.rows;
}
module.exports = { createNotification, listNotifications, unreadCount, setNotificationRead,
  setPostingState, listRecruiterApplications, candidateAnalytics, recruiterSummary, applicationHistory };
