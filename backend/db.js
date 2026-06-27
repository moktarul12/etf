const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Use persistent volume on Render, fallback to local directory for development
const dbPath = process.env.NODE_ENV === 'production'
  ? '/var/data/etf-dukan.db'
  : path.join(__dirname, 'etf-dukan.db');

// Create directory if it doesn't exist (for production)
if (process.env.NODE_ENV === 'production') {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
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
    buy_trigger_pct REAL DEFAULT -2.0,
    sell_target_pct REAL DEFAULT 6.0,
    stop_loss_pct REAL DEFAULT -3.0,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

function ensureUserData(userId) {
  const w = db.prepare('SELECT id FROM wallet WHERE user_id = ?').get(userId);
  if (!w) db.prepare('INSERT INTO wallet (user_id, balance) VALUES (?, 100000)').run(userId);
  const s = db.prepare('SELECT id FROM auto_settings WHERE user_id = ?').get(userId);
  if (!s) db.prepare('INSERT INTO auto_settings (user_id) VALUES (?)').run(userId);
}

module.exports = { db, ensureUserData };
