const express = require('express');
const cors = require('cors');
const db = require('./db');
const ETF_CODES = require('./etfCodes');
const { getPricesForCodes, getPriceForCode } = require('./priceService');
const { runAutoTrade } = require('./autoTrade');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Seed ETF list from etfCodes.js on startup (upsert)
const upsertETF = db.prepare(`
  INSERT INTO etf_list (nse_code, underlying) VALUES (?, ?)
  ON CONFLICT(nse_code) DO UPDATE SET underlying = excluded.underlying
`);
const seedAll = db.transaction(() => {
  for (const etf of ETF_CODES) {
    upsertETF.run(etf.nse_code, etf.underlying);
  }
});
seedAll();

// ─── ETF LIST ROUTES ─────────────────────────────────────────────────────────

// GET all ETFs from DB (static codes + underlying only)
app.get('/api/etf', (req, res) => {
  const etfs = db.prepare('SELECT * FROM etf_list ORDER BY nse_code ASC').all();
  res.json(etfs);
});

// GET live prices for all enabled ETFs (fetched from Yahoo Finance)
app.get('/api/etf/prices', async (req, res) => {
  try {
    const etfs = db.prepare('SELECT nse_code FROM etf_list WHERE enabled = 1').all();
    const codes = etfs.map(e => e.nse_code);
    const prices = await getPricesForCodes(codes);
    res.json(prices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET live price for a single ETF
app.get('/api/etf/:code/price', async (req, res) => {
  try {
    const code = decodeURIComponent(req.params.code);
    const price = await getPriceForCode(code);
    if (!price) return res.status(404).json({ error: 'Price not found' });
    res.json({ code, ...price });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add a new ETF code to DB
app.post('/api/etf', (req, res) => {
  const { nse_code, underlying } = req.body;
  if (!nse_code || !underlying) return res.status(400).json({ error: 'nse_code and underlying required' });
  try {
    db.prepare(`INSERT INTO etf_list (nse_code, underlying) VALUES (?, ?)`).run(nse_code.toUpperCase(), underlying);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'NSE code already exists' });
  }
});

// DELETE an ETF code from DB
app.delete('/api/etf/:id', (req, res) => {
  db.prepare('DELETE FROM etf_list WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// PATCH toggle ETF enabled/disabled
app.patch('/api/etf/:id/toggle', (req, res) => {
  db.prepare('UPDATE etf_list SET enabled = CASE WHEN enabled=1 THEN 0 ELSE 1 END WHERE id = ?').run(req.params.id);
  const etf = db.prepare('SELECT * FROM etf_list WHERE id = ?').get(req.params.id);
  res.json(etf);
});

// PATCH update per-ETF trade settings
app.patch('/api/etf/:id/settings', (req, res) => {
  const { buy_trigger_pct, sell_target_pct, stop_loss_pct } = req.body;
  db.prepare(`
    UPDATE etf_list SET buy_trigger_pct=?, sell_target_pct=?, stop_loss_pct=?, updated_at=datetime('now') WHERE id=?
  `).run(buy_trigger_pct, sell_target_pct, stop_loss_pct, req.params.id);
  res.json({ success: true });
});

// ─── WALLET ROUTES ────────────────────────────────────────────────────────────

// GET wallet balance
app.get('/api/wallet', (req, res) => {
  const wallet = db.prepare('SELECT * FROM wallet WHERE id = 1').get();
  res.json(wallet);
});

// POST add demo money
app.post('/api/wallet/add', (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  db.prepare(`UPDATE wallet SET balance = balance + ?, updated_at = datetime('now') WHERE id = 1`).run(amount);
  const wallet = db.prepare('SELECT * FROM wallet WHERE id = 1').get();
  res.json(wallet);
});

// POST reset wallet
app.post('/api/wallet/reset', (req, res) => {
  db.prepare(`UPDATE wallet SET balance = 100000, invested = 0, realized_profit = 0, updated_at = datetime('now') WHERE id = 1`).run();
  db.prepare('DELETE FROM portfolio').run();
  const wallet = db.prepare('SELECT * FROM wallet WHERE id = 1').get();
  res.json(wallet);
});

// ─── PORTFOLIO ROUTES ─────────────────────────────────────────────────────────

app.get('/api/portfolio', (req, res) => {
  const holdings = db.prepare('SELECT * FROM portfolio ORDER BY created_at DESC').all();
  res.json(holdings);
});

// POST manual buy
app.post('/api/trade/buy', (req, res) => {
  const { nse_code, quantity, price } = req.body;
  if (!nse_code || !quantity || !price) return res.status(400).json({ error: 'Missing fields' });

  const wallet = db.prepare('SELECT * FROM wallet WHERE id = 1').get();
  const totalCost = quantity * price;
  if (wallet.balance < totalCost) return res.status(400).json({ error: 'Insufficient balance' });

  const etf = db.prepare('SELECT * FROM etf_list WHERE nse_code = ?').get(nse_code);
  const underlying = etf?.underlying || nse_code;

  // Check existing holding - avg it
  const existing = db.prepare('SELECT * FROM portfolio WHERE nse_code = ?').get(nse_code);
  if (existing) {
    const newQty = existing.quantity + quantity;
    const newAvgPrice = (existing.total_investment + totalCost) / newQty;
    db.prepare('UPDATE portfolio SET quantity=?, buy_price=?, total_investment=? WHERE nse_code=?')
      .run(newQty, newAvgPrice, existing.total_investment + totalCost, nse_code);
  } else {
    db.prepare('INSERT INTO portfolio (nse_code, underlying, quantity, buy_price, total_investment) VALUES (?,?,?,?,?)')
      .run(nse_code, underlying, quantity, price, totalCost);
  }

  db.prepare(`INSERT INTO trade_history (nse_code, underlying, trade_type, quantity, price, total_value, mode) VALUES (?,?,'BUY',?,?,?,'MANUAL')`)
    .run(nse_code, underlying, quantity, price, totalCost);
  db.prepare(`UPDATE wallet SET balance = balance - ?, invested = invested + ?, updated_at = datetime('now') WHERE id = 1`)
    .run(totalCost, totalCost);

  res.json({ success: true });
});

// POST manual sell
app.post('/api/trade/sell', (req, res) => {
  const { nse_code, quantity, price } = req.body;
  const holding = db.prepare('SELECT * FROM portfolio WHERE nse_code = ?').get(nse_code);
  if (!holding) return res.status(400).json({ error: 'No holding found' });
  if (holding.quantity < quantity) return res.status(400).json({ error: 'Insufficient quantity' });

  const totalValue = quantity * price;
  const costBasis = (holding.total_investment / holding.quantity) * quantity;
  const profit = totalValue - costBasis;
  const profitPct = (profit / costBasis) * 100;

  if (holding.quantity === quantity) {
    db.prepare('DELETE FROM portfolio WHERE nse_code = ?').run(nse_code);
  } else {
    db.prepare('UPDATE portfolio SET quantity=?, total_investment=? WHERE nse_code=?')
      .run(holding.quantity - quantity, holding.total_investment - costBasis, nse_code);
  }

  db.prepare(`INSERT INTO trade_history (nse_code, underlying, trade_type, quantity, price, total_value, profit, profit_pct, mode) VALUES (?,?,'SELL',?,?,?,?,?,'MANUAL')`)
    .run(nse_code, holding.underlying, quantity, price, totalValue, profit, profitPct);
  db.prepare(`UPDATE wallet SET balance = balance + ?, invested = invested - ?, realized_profit = realized_profit + ?, updated_at = datetime('now') WHERE id = 1`)
    .run(totalValue, costBasis, profit);

  res.json({ success: true, profit, profitPct });
});

// ─── HISTORY ROUTES ───────────────────────────────────────────────────────────

app.get('/api/history', (req, res) => {
  const { limit = 100, type } = req.query;
  let query = 'SELECT * FROM trade_history';
  const params = [];
  if (type) { query += ' WHERE trade_type = ?'; params.push(type); }
  query += ' ORDER BY traded_at DESC LIMIT ?';
  params.push(parseInt(limit));
  res.json(db.prepare(query).all(...params));
});

// ─── AUTO TRADE SETTINGS ──────────────────────────────────────────────────────

app.get('/api/auto-settings', (req, res) => {
  res.json(db.prepare('SELECT * FROM auto_settings WHERE id = 1').get());
});

app.put('/api/auto-settings', (req, res) => {
  const { enabled, max_per_etf, buy_trigger_pct, sell_target_pct, stop_loss_pct, sell_before_hour } = req.body;
  db.prepare(`
    UPDATE auto_settings SET enabled=?, max_per_etf=?, buy_trigger_pct=?, sell_target_pct=?, stop_loss_pct=?, sell_before_hour=?, updated_at=datetime('now')
    WHERE id=1
  `).run(enabled ? 1 : 0, max_per_etf, buy_trigger_pct, sell_target_pct, stop_loss_pct, sell_before_hour);
  res.json(db.prepare('SELECT * FROM auto_settings WHERE id = 1').get());
});

// POST manually trigger auto-trade run (for testing)
app.post('/api/auto-trade/run', async (req, res) => {
  try {
    const etfs = db.prepare('SELECT nse_code FROM etf_list WHERE enabled = 1').all();
    const codes = etfs.map(e => e.nse_code);
    const prices = await getPricesForCodes(codes);
    const logs = runAutoTrade(prices);
    res.json({ success: true, actions: logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AUTO TRADE SCHEDULER (every 5 min during market hours) ──────────────────

let lastAutoRunPrices = {};

async function scheduledAutoRun() {
  const settings = db.prepare('SELECT * FROM auto_settings WHERE id = 1').get();
  if (!settings.enabled) return;

  const now = new Date();
  const hour = now.getHours();
  const min = now.getMinutes();
  // Run only between 9:15 AM and 3:30 PM IST (approximate)
  if (hour < 9 || hour > 15 || (hour === 9 && min < 15) || (hour === 15 && min > 30)) return;

  try {
    const etfs = db.prepare('SELECT nse_code FROM etf_list WHERE enabled = 1').all();
    const codes = etfs.map(e => e.nse_code);
    const prices = await getPricesForCodes(codes);
    lastAutoRunPrices = prices;
    const logs = runAutoTrade(prices);
    if (logs.length > 0) {
      console.log('[AutoTrade]', new Date().toISOString(), logs);
    }
  } catch (err) {
    console.error('[AutoTrade Error]', err.message);
  }
}

setInterval(scheduledAutoRun, 5 * 60 * 1000); // every 5 min

app.listen(PORT, () => {
  console.log(`ETF Dukan backend running on http://localhost:${PORT}`);
});
