const { createClient } = require('@libsql/client');
const path = require('path');

// DB connection:
//   Production: TURSO_URL + TURSO_AUTH_TOKEN (free hosted SQLite — survives redeploys)
//   Local dev : file:./etf-dukan.db alongside this file
const tursoUrl = process.env.TURSO_URL || 'libsql://etf-dukan-moktarul.aws-ap-south-1.turso.io';
const tursoToken = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODI2Njg2ODAsImlkIjoiMDE5ZjBmNTUtMjAwMS03MTFiLThkMjEtMjlmNDE3ZTZhMTFjIiwicmlkIjoiMGI5NTFmMTEtOThhOS00NmI2LTgwNmUtZGZlYzMwZDc1OGE4In0.SBbaLyKk9WPuRi6mUbugUdtrfWDhUbSlimC0Kr6oQzlzfO6yx8_cMD9aRTe9Jvn6C-T5YPpHOOHu59ZLSr1nAg';

const dbUrl = tursoUrl
  ? tursoUrl
  : `file:${process.env.DB_PATH || path.join(__dirname, 'etf-dukan.db')}`;

const client = createClient({ url: dbUrl, authToken: tursoToken });

// Async wrapper that mimics better-sqlite3's prepared-statement API.
// All .get()/.all()/.run() return promises — callers must await.
const db = {
  async exec(sql) {
    const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of stmts) {
      await client.execute(stmt);
    }
  },
  prepare(sql) {
    return {
      async get(...args) {
        const r = await client.execute({ sql, args });
        return r.rows[0];
      },
      async all(...args) {
        const r = await client.execute({ sql, args });
        return r.rows;
      },
      async run(...args) {
        const r = await client.execute({ sql, args });
        return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid };
      },
    };
  },
  async pragma(name) {
    const r = await client.execute(`PRAGMA ${name}`);
    return r.rows;
  },
};

// ─── SCHEMA + MIGRATIONS (call once on startup) ──────────────────────────────
async function initDb() {
  try { await db.pragma('journal_mode = WAL'); } catch {}
  try { await db.pragma('foreign_keys = ON'); } catch {}

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      avatar TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS etf_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nse_code TEXT UNIQUE NOT NULL,
      underlying TEXT NOT NULL,
      cmp REAL DEFAULT 0,
      dma20 REAL DEFAULT 0,
      diff REAL DEFAULT 0,
      pct_change REAL DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      buy_trigger_pct REAL DEFAULT -2.0,
      sell_target_pct REAL DEFAULT 6.0,
      stop_loss_pct REAL DEFAULT -3.0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wallet (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
      balance REAL DEFAULT 100000,
      invested REAL DEFAULT 0,
      realized_profit REAL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS portfolio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      nse_code TEXT NOT NULL,
      underlying TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      buy_price REAL NOT NULL,
      total_investment REAL NOT NULL,
      buy_date TEXT DEFAULT (date('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trade_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      nse_code TEXT NOT NULL,
      underlying TEXT,
      trade_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      total_value REAL NOT NULL,
      profit REAL DEFAULT 0,
      profit_pct REAL DEFAULT 0,
      mode TEXT DEFAULT 'MANUAL',
      reason TEXT,
      traded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auto_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
      enabled INTEGER DEFAULT 0,
      max_per_etf REAL DEFAULT 10000,
      daily_budget REAL DEFAULT 2000,
      buy_trigger_pct REAL DEFAULT -2.0,
      sell_target_pct REAL DEFAULT 6.0,
      stop_loss_pct REAL DEFAULT -3.0,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ─── MIGRATIONS ─────────────────────────────────────────────────────────────
  // Add columns used by the auto-trade engine if they don't already exist.
  const portfolioCols = (await db.prepare("PRAGMA table_info(portfolio)").all()).map(c => c.name);
  if (!portfolioCols.includes('first_buy_price')) {
    await db.exec("ALTER TABLE portfolio ADD COLUMN first_buy_price REAL");
  }
  if (!portfolioCols.includes('repurchase_level')) {
    await db.exec("ALTER TABLE portfolio ADD COLUMN repurchase_level INTEGER DEFAULT 0");
  }
  // Backfill first_buy_price for existing rows so the loss ladder has a reference.
  await db.exec("UPDATE portfolio SET first_buy_price = buy_price WHERE first_buy_price IS NULL");

  const autoSettingsCols = (await db.prepare("PRAGMA table_info(auto_settings)").all()).map(c => c.name);
  if (!autoSettingsCols.includes('daily_budget')) {
    await db.exec("ALTER TABLE auto_settings ADD COLUMN daily_budget REAL DEFAULT 2000");
  }
}

async function ensureUserData(userId) {
  const w = await db.prepare('SELECT id FROM wallet WHERE user_id = ?').get(userId);
  if (!w) await db.prepare('INSERT INTO wallet (user_id, balance) VALUES (?, 100000)').run(userId);
  const s = await db.prepare('SELECT id FROM auto_settings WHERE user_id = ?').get(userId);
  if (!s) await db.prepare('INSERT INTO auto_settings (user_id) VALUES (?)').run(userId);
}

// Ensure the user row (and their wallet/auto_settings) exist for a JWT identity.
// This recovers gracefully if the DB was reset while a user still holds a valid token.
async function ensureUser(claims) {
  if (!claims?.id) return;
  const existing = await db.prepare('SELECT id FROM users WHERE id = ?').get(claims.id);
  if (!existing) {
    // Check if a row with the same email already exists (e.g. from a previous OAuth login)
    const existingByEmail = claims.email
      ? await db.prepare('SELECT id FROM users WHERE email = ?').get(claims.email)
      : null;
    if (existingByEmail) {
      claims.id = existingByEmail.id;
    } else {
      try {
        await db.prepare('INSERT INTO users (id, google_id, email, name, avatar) VALUES (?, ?, ?, ?, ?)')
          .run(
            claims.id,
            `restored-${claims.id}`,
            claims.email || `user${claims.id}@example.com`,
            claims.name || null,
            claims.avatar || null
          );
      } catch (e) {
        const existingByGid = await db.prepare('SELECT id FROM users WHERE google_id = ?').get(`restored-${claims.id}`);
        if (existingByGid) claims.id = existingByGid.id;
      }
    }
  }
  await ensureUserData(claims.id);
}

module.exports = { db, initDb, ensureUserData, ensureUser };
