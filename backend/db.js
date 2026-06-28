const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// DB location priority:
//   1. DB_PATH env var (set this to a persistent disk path, e.g. /var/data/etf-dukan.db)
//   2. production: process.cwd() (NOTE: ephemeral on free tier — wiped each deploy)
//   3. development: alongside this file
const dbPath = process.env.DB_PATH
  ? process.env.DB_PATH
  : (process.env.NODE_ENV === 'production'
      ? path.join(process.cwd(), 'etf-dukan.db')
      : path.join(__dirname, 'etf-dukan.db'));

// Create directory if it doesn't exist
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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

// ─── MIGRATIONS ───────────────────────────────────────────────────────────────
// Add columns used by the auto-trade engine if they don't already exist.
const portfolioCols = db.prepare("PRAGMA table_info(portfolio)").all().map(c => c.name);
if (!portfolioCols.includes('first_buy_price')) {
  db.exec("ALTER TABLE portfolio ADD COLUMN first_buy_price REAL");
}
if (!portfolioCols.includes('repurchase_level')) {
  db.exec("ALTER TABLE portfolio ADD COLUMN repurchase_level INTEGER DEFAULT 0");
}
// Backfill first_buy_price for existing rows so the loss ladder has a reference.
db.exec("UPDATE portfolio SET first_buy_price = buy_price WHERE first_buy_price IS NULL");

const autoSettingsCols = db.prepare("PRAGMA table_info(auto_settings)").all().map(c => c.name);
if (!autoSettingsCols.includes('daily_budget')) {
  db.exec("ALTER TABLE auto_settings ADD COLUMN daily_budget REAL DEFAULT 2000");
}

function ensureUserData(userId) {
  const w = db.prepare('SELECT id FROM wallet WHERE user_id = ?').get(userId);
  if (!w) db.prepare('INSERT INTO wallet (user_id, balance) VALUES (?, 100000)').run(userId);
  const s = db.prepare('SELECT id FROM auto_settings WHERE user_id = ?').get(userId);
  if (!s) db.prepare('INSERT INTO auto_settings (user_id) VALUES (?)').run(userId);
}

// Ensure the user row (and their wallet/auto_settings) exist for a JWT identity.
// This recovers gracefully if the DB was reset (e.g. ephemeral storage on a
// redeploy) while a user still holds a valid token.
function ensureUser(claims) {
  if (!claims?.id) return;
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(claims.id);
  if (!existing) {
    try {
      db.prepare('INSERT INTO users (id, google_id, email, name, avatar) VALUES (?, ?, ?, ?, ?)')
        .run(
          claims.id,
          `restored-${claims.id}`,
          claims.email || `user${claims.id}@example.com`,
          claims.name || null,
          claims.avatar || null
        );
    } catch (e) {
      // A row with the same email/google_id may exist under a different id;
      // ignore and let ensureUserData attempt what it can.
    }
  }
  ensureUserData(claims.id);
}

module.exports = { db, ensureUserData, ensureUser };
