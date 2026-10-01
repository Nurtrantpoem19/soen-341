const { createPool } = require('../db');
const { migrate } = require('../db/migrate');
(async () => {
  const pool = createPool();
  try { await migrate(pool); console.log('Database migrations applied.'); }
  finally { await pool.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
