const { createClient } = require('@libsql/client');
const path = require('path');
require('dotenv').config();

const url = process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, 'carnivore.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

console.log('Connecting database to:', url.startsWith('libsql://') ? 'Turso Cloud' : 'Local SQLite file');

const client = createClient({
  url,
  authToken,
});

async function initDb() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT,
      google_id TEXT UNIQUE,
      avatar_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS user_journals (
      user_id TEXT PRIMARY KEY,
      journal_data TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS friends (
      id TEXT PRIMARY KEY,
      user_id_1 TEXT NOT NULL,
      user_id_2 TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'declined')),
      requester_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id_1) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id_2) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS accountability_partnerships (
      id TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL,
      partner_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'declined')),
      partner_shares_back INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(requester_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(partner_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  console.log('Database tables initialized successfully.');
}

// Helper: Query a single row
async function get(sql, args = []) {
  const rs = await client.execute({ sql, args: Array.isArray(args) ? args : [args] });
  return rs.rows.length > 0 ? rs.rows[0] : undefined;
}

// Helper: Query multiple rows
async function all(sql, args = []) {
  const rs = await client.execute({ sql, args: Array.isArray(args) ? args : [args] });
  return rs.rows;
}

// Helper: Run insert, update, or delete
async function run(sql, args = []) {
  return await client.execute({ sql, args: Array.isArray(args) ? args : [args] });
}

module.exports = {
  client,
  initDb,
  get,
  all,
  run,
};
