const STATUSES = ['Applied', 'Under Review', 'Interview', 'Offered', 'Rejected'];

function periodStart(value, bucket) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  if (bucket === 'month') date.setUTCDate(1);
  if (bucket === 'week') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

function summarizeApplications(rows, bucket) {
  const byStatus = Object.fromEntries(STATUSES.map(status => [status, 0]));
  const periods = new Map();
  for (const row of rows) {
    byStatus[row.status] += 1;
    const period = periodStart(row.applied_at, bucket);
    periods.set(period, (periods.get(period) || 0) + 1);
  }
  return {
    total: rows.length,
    byStatus,
    bucket,
    overTime: [...periods].sort(([a], [b]) => a.localeCompare(b)).map(([period, count]) => ({ period, count }))
  };
}

function registerApplicationAnalytics(app, pool, authenticateUser) {
  app.get('/api/applications/me/analytics', authenticateUser, async (req, res, next) => {
    const bucket = req.query.bucket === undefined ? 'month' : req.query.bucket;
    if (!['week', 'month'].includes(bucket)) {
      return res.status(400).json({ message: 'bucket must be week or month.' });
    }
    try {
      // Read only the two fields needed for a consistent summary, scoped to the JWT user.
      const result = await pool.query('SELECT status, applied_at FROM applications WHERE user_id=$1', [req.user.id]);
      res.json({ analytics: summarizeApplications(result.rows, bucket) });
    } catch (error) { next(error); }
  });
}

module.exports = { registerApplicationAnalytics, summarizeApplications };
