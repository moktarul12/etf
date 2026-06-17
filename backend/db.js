const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'etf-dukan.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
    id INTEGER PRIMARY KEY CHECK (id = 1),
    balance REAL DEFAULT 0,
    invested REAL DEFAULT 0,
    realized_profit REAL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS portfolio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER DEFAULT 0,
    max_per_etf REAL DEFAULT 10000,
    buy_trigger_pct REAL DEFAULT -2.0,
    sell_target_pct REAL DEFAULT 6.0,
    stop_loss_pct REAL DEFAULT -3.0,
    sell_before_hour INTEGER DEFAULT 14,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Seed wallet if not exists
const wallet = db.prepare('SELECT id FROM wallet WHERE id = 1').get();
if (!wallet) {
  db.prepare('INSERT INTO wallet (id, balance) VALUES (1, 100000)').run();
}

// Seed auto_settings if not exists
const settings = db.prepare('SELECT id FROM auto_settings WHERE id = 1').get();
if (!settings) {
  db.prepare('INSERT INTO auto_settings (id) VALUES (1)').run();
}

module.exports = db;
