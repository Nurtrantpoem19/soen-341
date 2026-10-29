// Job search and job listing endpoints (Sprint 2). These routes are public and read-only.
const summaryColumns = 'id, title, company, location, category, employment_type AS "employmentType", salary, description, posted_at AS "postedAt"';
const detailColumns = `${summaryColumns}, requirements`;
const employmentTypes = ['Full-time', 'Part-time', 'Internship', 'Contract'];
const filters = { q: 100, location: 100, category: 100, type: 20 };
// Returns the trimmed search filters, or null when a value is not a single string within its length limit.
function readFilters(query) {
  const values = {};
  for (const [name, limit] of Object.entries(filters)) {
    const value = query[name];
    if (value === undefined) { values[name] = ''; continue; }
    if (typeof value !== 'string' || value.trim().length > limit) return null;
    values[name] = value.trim();
  }
  if (values.type && !employmentTypes.includes(values.type)) return null;
  return values;
}
// Case-insensitive substring match. strpos treats the search text literally, so "100%" or "C_" need no escaping.
const contains = (column, param) => `strpos(lower(${column}), lower(${param})) > 0`;
function registerJobRoutes(app, pool) {
  app.get('/api/jobs', async (req, res, next) => {
    const values = readFilters(req.query);
    if (!values) return res.status(400).json({ message: 'Search filters must be text of at most 100 characters, and type must be a valid employment type.' });
    const conditions = ['is_open = TRUE'];
    const params = [];
    if (values.q) {
      params.push(values.q);
      const param = `$${params.length}`;
      conditions.push(`(${['title', 'company', 'description'].map(column => contains(column, param)).join(' OR ')})`);
    }
    if (values.location) { params.push(values.location); conditions.push(contains('location', `$${params.length}`)); }
    if (values.category) { params.push(values.category); conditions.push(`category = $${params.length}`); }
    if (values.type) { params.push(values.type); conditions.push(`employment_type = $${params.length}`); }
    try {
      const result = await pool.query(`SELECT ${summaryColumns} FROM jobs WHERE ${conditions.join(' AND ')} ORDER BY posted_at DESC, id DESC LIMIT 100`, params);
      res.json({ jobs: result.rows });
    } catch (error) { next(error); }
  });
  app.get('/api/jobs/categories', async (req, res, next) => {
    try {
      const result = await pool.query('SELECT DISTINCT category FROM jobs WHERE is_open = TRUE ORDER BY category');
      res.json({ categories: result.rows.map(row => row.category), employmentTypes });
    } catch (error) { next(error); }
  });
  app.get('/api/jobs/:id', async (req, res, next) => {
    const id = Number(req.params.id);
    if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(id) || id < 1 || id > 2147483647) return res.status(400).json({ message: 'Invalid job ID.' });
    try {
      const result = await pool.query(`SELECT ${detailColumns} FROM jobs WHERE id = $1 AND is_open = TRUE`, [id]);
      if (!result.rowCount) return res.status(404).json({ message: 'Job not found.' });
      res.json({ job: result.rows[0] });
    } catch (error) { next(error); }
  });
}
module.exports = { registerJobRoutes };
