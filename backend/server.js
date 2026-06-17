require('dotenv').config();
const express = require('express');
const cors = require('cors');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const { db, ensureUserData } = require('./db');
const ETF_CODES = require('./etfCodes');
const { getPricesForCodes, getPriceForCode } = require('./priceService');
const { runAutoTrade } = require('./autoTrade');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(passport.initialize());

// ─── GOOGLE OAUTH STRATEGY ────────────────────────────────────────────────────
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: `http://localhost:${PORT}/auth/google/callback`,
}, (accessToken, refreshToken, profile, done) => {
  console.log('[Google OAuth] Profile received:', profile?.id, profile?.displayName);
  try {
    const email = profile.emails?.[0]?.value;
    const name = profile.displayName;
    const avatar = profile.photos?.[0]?.value;
    const google_id = profile.id;

    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(google_id);
    if (!user) {
      db.prepare('INSERT INTO users (google_id, email, name, avatar) VALUES (?, ?, ?, ?)').run(google_id, email, name, avatar);
      user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(google_id);
    } else {
      db.prepare('UPDATE users SET name=?, avatar=? WHERE google_id=?').run(name, avatar, google_id);
    }
    ensureUserData(user.id);
    console.log('[Google OAuth] User created/updated:', user.id);
    done(null, user);
  } catch (err) {
    console.error('[Google OAuth] Error:', err);
    done(err);
  }
}));

// ─── JWT AUTH MIDDLEWARE ──────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

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

// ─── GOOGLE OAUTH ROUTES ──────────────────────────────────────────────────────

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

app.get('/auth/google/callback',
  (req, res, next) => {
    console.log('[Google OAuth] Callback received, query:', req.query);
    passport.authenticate('google', { session: false, failureRedirect: `${FRONTEND_URL}/login?error=1` }, (err, user, info) => {
      if (err) {
        console.error('[Google OAuth] Passport error:', err);
        return res.redirect(`${FRONTEND_URL}/login?error=1`);
      }
      if (!user) {
        console.error('[Google OAuth] No user returned, info:', info);
        return res.redirect(`${FRONTEND_URL}/login?error=1`);
      }
      req.user = user;
      console.log('[Google OAuth] Authentication successful for user:', user.id);
      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
        JWT_SECRET,
        { expiresIn: '30d' }
      );
      const redirectUrl = `${FRONTEND_URL}/auth/callback?token=${token}`;
      console.log('[Google OAuth] Redirecting to:', redirectUrl);
      res.redirect(redirectUrl);
    })(req, res, next);
  }
);

app.get('/auth/me', authMiddleware, (req, res) => {
  res.json(req.user);
});

// ─── ETF LIST ROUTES (public — shared master list) ───────────────────────────

app.get('/api/etf', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM etf_list ORDER BY nse_code ASC').all());
});

app.get('/api/etf/prices', authMiddleware, async (req, res) => {
  try {
    const etfs = db.prepare('SELECT nse_code FROM etf_list WHERE enabled = 1').all();
    const prices = await getPricesForCodes(etfs.map(e => e.nse_code));
    res.json(prices);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/etf/:code/price', authMiddleware, async (req, res) => {
  try {
    const price = await getPriceForCode(decodeURIComponent(req.params.code));
    if (!price) return res.status(404).json({ error: 'Price not found' });
    res.json({ code: req.params.code, ...price });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/etf', authMiddleware, (req, res) => {
  const { nse_code, underlying } = req.body;
  if (!nse_code || !underlying) return res.status(400).json({ error: 'nse_code and underlying required' });
  try {
    db.prepare('INSERT INTO etf_list (nse_code, underlying) VALUES (?, ?)').run(nse_code.toUpperCase(), underlying);
    res.json({ success: true });
  } catch { res.status(400).json({ error: 'NSE code already exists' }); }
});

app.delete('/api/etf/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM etf_list WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.patch('/api/etf/:id/toggle', authMiddleware, (req, res) => {
  db.prepare('UPDATE etf_list SET enabled = CASE WHEN enabled=1 THEN 0 ELSE 1 END WHERE id = ?').run(req.params.id);
  res.json(db.prepare('SELECT * FROM etf_list WHERE id = ?').get(req.params.id));
});

// ─── WALLET ROUTES (per user) ─────────────────────────────────────────────────

app.get('/api/wallet', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM wallet WHERE user_id = ?').get(req.user.id));
});

app.post('/api/wallet/add', authMiddleware, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  db.prepare(`UPDATE wallet SET balance = balance + ?, updated_at = datetime('now') WHERE user_id = ?`).run(amount, req.user.id);
  res.json(db.prepare('SELECT * FROM wallet WHERE user_id = ?').get(req.user.id));
});

app.post('/api/wallet/reset', authMiddleware, (req, res) => {
  db.prepare(`UPDATE wallet SET balance = 100000, invested = 0, realized_profit = 0, updated_at = datetime('now') WHERE user_id = ?`).run(req.user.id);
  db.prepare('DELETE FROM portfolio WHERE user_id = ?').run(req.user.id);
  res.json(db.prepare('SELECT * FROM wallet WHERE user_id = ?').get(req.user.id));
});

// ─── PORTFOLIO ROUTES (per user) ──────────────────────────────────────────────

app.get('/api/portfolio', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM portfolio WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id));
});

app.post('/api/trade/buy', authMiddleware, (req, res) => {
  const { nse_code, quantity, price } = req.body;
  if (!nse_code || !quantity || !price) return res.status(400).json({ error: 'Missing fields' });
  const uid = req.user.id;

  const wallet = db.prepare('SELECT * FROM wallet WHERE user_id = ?').get(uid);
  const totalCost = quantity * price;
  if (wallet.balance < totalCost) return res.status(400).json({ error: 'Insufficient balance' });

  const etf = db.prepare('SELECT * FROM etf_list WHERE nse_code = ?').get(nse_code);
  const underlying = etf?.underlying || nse_code;

  const existing = db.prepare('SELECT * FROM portfolio WHERE user_id = ? AND nse_code = ?').get(uid, nse_code);
  if (existing) {
    const newQty = existing.quantity + quantity;
    const newAvgPrice = (existing.total_investment + totalCost) / newQty;
    db.prepare('UPDATE portfolio SET quantity=?, buy_price=?, total_investment=? WHERE user_id=? AND nse_code=?')
      .run(newQty, newAvgPrice, existing.total_investment + totalCost, uid, nse_code);
  } else {
    db.prepare('INSERT INTO portfolio (user_id, nse_code, underlying, quantity, buy_price, total_investment) VALUES (?,?,?,?,?,?)')
      .run(uid, nse_code, underlying, quantity, price, totalCost);
  }
  db.prepare(`INSERT INTO trade_history (user_id, nse_code, underlying, trade_type, quantity, price, total_value, mode) VALUES (?,?,?,'BUY',?,?,?,'MANUAL')`)
    .run(uid, nse_code, underlying, quantity, price, totalCost);
  db.prepare(`UPDATE wallet SET balance = balance - ?, invested = invested + ?, updated_at = datetime('now') WHERE user_id = ?`)
    .run(totalCost, totalCost, uid);
  res.json({ success: true });
});

app.post('/api/trade/sell', authMiddleware, (req, res) => {
  const { nse_code, quantity, price } = req.body;
  const uid = req.user.id;
  const holding = db.prepare('SELECT * FROM portfolio WHERE user_id = ? AND nse_code = ?').get(uid, nse_code);
  if (!holding) return res.status(400).json({ error: 'No holding found' });
  if (holding.quantity < quantity) return res.status(400).json({ error: 'Insufficient quantity' });

  const totalValue = quantity * price;
  const costBasis = (holding.total_investment / holding.quantity) * quantity;
  const profit = totalValue - costBasis;
  const profitPct = (profit / costBasis) * 100;

  if (holding.quantity === quantity) {
    db.prepare('DELETE FROM portfolio WHERE user_id = ? AND nse_code = ?').run(uid, nse_code);
  } else {
    db.prepare('UPDATE portfolio SET quantity=?, total_investment=? WHERE user_id=? AND nse_code=?')
      .run(holding.quantity - quantity, holding.total_investment - costBasis, uid, nse_code);
  }
  db.prepare(`INSERT INTO trade_history (user_id, nse_code, underlying, trade_type, quantity, price, total_value, profit, profit_pct, mode) VALUES (?,?,?,'SELL',?,?,?,?,?,'MANUAL')`)
    .run(uid, nse_code, holding.underlying, quantity, price, totalValue, profit, profitPct);
  db.prepare(`UPDATE wallet SET balance = balance + ?, invested = invested - ?, realized_profit = realized_profit + ?, updated_at = datetime('now') WHERE user_id = ?`)
    .run(totalValue, costBasis, profit, uid);
  res.json({ success: true, profit, profitPct });
});

// ─── HISTORY ROUTES (per user) ────────────────────────────────────────────────

app.get('/api/history', authMiddleware, (req, res) => {
  const { limit = 100, type } = req.query;
  const uid = req.user.id;
  let query = 'SELECT * FROM trade_history WHERE user_id = ?';
  const params = [uid];
  if (type) { query += ' AND trade_type = ?'; params.push(type); }
  query += ' ORDER BY traded_at DESC LIMIT ?';
  params.push(parseInt(limit));
  res.json(db.prepare(query).all(...params));
});

// ─── AUTO TRADE SETTINGS (per user) ──────────────────────────────────────────

app.get('/api/auto-settings', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM auto_settings WHERE user_id = ?').get(req.user.id));
});

app.put('/api/auto-settings', authMiddleware, (req, res) => {
  const { enabled, max_per_etf, buy_trigger_pct, sell_target_pct, stop_loss_pct } = req.body;
  db.prepare(`UPDATE auto_settings SET enabled=?, max_per_etf=?, buy_trigger_pct=?, sell_target_pct=?, stop_loss_pct=?, updated_at=datetime('now') WHERE user_id=?`)
    .run(enabled ? 1 : 0, max_per_etf, buy_trigger_pct, sell_target_pct, stop_loss_pct, req.user.id);
  res.json(db.prepare('SELECT * FROM auto_settings WHERE user_id = ?').get(req.user.id));
});

app.post('/api/auto-trade/run', authMiddleware, async (req, res) => {
  try {
    const etfs = db.prepare('SELECT nse_code FROM etf_list WHERE enabled = 1').all();
    const prices = await getPricesForCodes(etfs.map(e => e.nse_code));
    const logs = runAutoTrade(prices, req.user.id);
    res.json({ success: true, actions: logs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── AUTO TRADE SCHEDULER (per user, every 5 min during market hours) ─────────

async function scheduledAutoRun() {
  const now = new Date();
  const hour = now.getHours(), min = now.getMinutes();
  if (hour < 9 || hour > 15 || (hour === 9 && min < 15) || (hour === 15 && min > 30)) return;

  const activeUsers = db.prepare('SELECT user_id FROM auto_settings WHERE enabled = 1').all();
  if (!activeUsers.length) return;

  try {
    const etfs = db.prepare('SELECT nse_code FROM etf_list WHERE enabled = 1').all();
    const prices = await getPricesForCodes(etfs.map(e => e.nse_code));
    for (const { user_id } of activeUsers) {
      const logs = runAutoTrade(prices, user_id);
      if (logs.length > 0) console.log(`[AutoTrade] user=${user_id}`, new Date().toISOString(), logs);
    }
  } catch (err) { console.error('[AutoTrade Error]', err.message); }
}

setInterval(scheduledAutoRun, 5 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`ETF Dukan backend running on http://localhost:${PORT}`);
});
