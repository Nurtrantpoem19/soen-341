const { Pool } = require('pg');
function createPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.');
  return new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
}
module.exports = { createPool };
