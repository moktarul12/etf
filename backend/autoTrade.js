// Auto buy/sell engine based on Mahesh Kaushik's 20DMA strategy
//
// Three jobs run on every scheduled tick (every 30 min during market hours):
//   1. SELL        : profit >= sell_target_pct% → sell any time (stop loss disabled)
//   2. REPURCHASE  : for each holding, measure loss vs the ORIGINAL first buy price.
//                    Fire one averaging-down buy at each -10%, -20%, -30%... step,
//                    each step exactly once (tracked by portfolio.repurchase_level).
//   3. DAILY BUY   : spend a configurable daily budget (default ₹2000) on ONE
//                    new stock per day (IST) — the deepest 20DMA dip (lowest %
//                    vs 20DMA) among enabled ETFs not already held, buying as
//                    many shares as fit in the budget.

const { db } = require('./db');

const REPURCHASE_STEP_PCT = 10; // loss ladder increment: -10%, -20%, -30%, ...
const DEFAULT_DAILY_BUDGET = 2000; // ₹ per purchase when not configured

// ─── TIME HELPERS (NSE trades in IST = UTC+5:30) ─────────────────────────────
function nowIST() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000);
}

// NSE regular session: Mon–Fri, 09:15–15:30 IST.
function isMarketOpen() {
  const ist = nowIST();
  const day = ist.getUTCDay(); // 0 Sun .. 6 Sat (on the shifted clock)
  if (day === 0 || day === 6) return false;
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return minutes >= (9 * 60 + 15) && minutes <= (15 * 60 + 30);
}

// Start of the current IST calendar day, expressed as a SQLite UTC datetime
// string ('YYYY-MM-DD HH:MM:SS') so it can be compared against traded_at.
function startOfISTDayUtc() {
  const ist = nowIST();
  const startUtcMs = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 0, 0, 0)
    - 5.5 * 60 * 60 * 1000;
  return new Date(startUtcMs).toISOString().slice(0, 19).replace('T', ' ');
}

// ─── JOB 1: SELL AT PROFIT TARGET ────────────────────────────────────────────
function runSell(priceMap, userId, settings) {
  const logs = [];
  const portfolio = db.prepare('SELECT * FROM portfolio WHERE user_id = ?').all(userId);

  for (const holding of portfolio) {
    const price = priceMap[holding.nse_code];
    if (!price || !price.cmp) continue;

    const cmp = price.cmp;
    const profitPct = ((cmp - holding.buy_price) / holding.buy_price) * 100;

    if (profitPct >= settings.sell_target_pct) {
      const totalValue = holding.quantity * cmp;
      const profit = totalValue - holding.total_investment;
      const reason = `Target achieved: +${profitPct.toFixed(2)}%`;

      db.prepare(`DELETE FROM portfolio WHERE id = ? AND user_id = ?`).run(holding.id, userId);
      db.prepare(`
        INSERT INTO trade_history (user_id, nse_code, underlying, trade_type, quantity, price, total_value, profit, profit_pct, mode, reason)
        VALUES (?, ?, ?, 'SELL', ?, ?, ?, ?, ?, 'AUTO', ?)
      `).run(userId, holding.nse_code, holding.underlying, holding.quantity, cmp, totalValue, profit, profitPct, reason);
      db.prepare(`
        UPDATE wallet SET balance = balance + ?, invested = invested - ?, realized_profit = realized_profit + ?, updated_at = datetime('now') WHERE user_id = ?
      `).run(totalValue, holding.total_investment, profit, userId);

      logs.push({ type: 'SELL', code: holding.nse_code, price: cmp, profit, profitPct, reason });
    }
  }
  return logs;
}

// ─── JOB 2: REPURCHASE (AVERAGE DOWN) ON LOSS LADDER ─────────────────────────
// Loss is measured against the original first buy price. Each -10% step fires
// exactly one repurchase, advancing repurchase_level by one per tick.
function runRepurchase(priceMap, userId, settings) {
  const logs = [];
  const portfolio = db.prepare('SELECT * FROM portfolio WHERE user_id = ?').all(userId);

  for (const holding of portfolio) {
    const price = priceMap[holding.nse_code];
    if (!price || !price.cmp) continue;

    const cmp = price.cmp;
    const ref = holding.first_buy_price || holding.buy_price;
    const lossPct = ((cmp - ref) / ref) * 100; // negative when at a loss
    if (lossPct >= 0) continue;

    const reachedLevel = Math.floor(-lossPct / REPURCHASE_STEP_PCT); // -10%→1, -20%→2
    const currentLevel = holding.repurchase_level || 0;
    if (reachedLevel <= currentLevel) continue;

    const wallet = db.prepare('SELECT * FROM wallet WHERE user_id = ?').get(userId);
    const budget = Math.min(settings.daily_budget || DEFAULT_DAILY_BUDGET, wallet.balance);
    const quantity = Math.floor(budget / cmp);
    if (quantity < 1) continue;
    const totalCost = quantity * cmp;
    if (totalCost > wallet.balance) continue;

    // Fire one step toward the reached level (catches up one step per tick).
    const newLevel = currentLevel + 1;
    const newQty = holding.quantity + quantity;
    const newInvestment = holding.total_investment + totalCost;
    const newAvg = newInvestment / newQty;
    const reason = `Repurchase L${newLevel} (-${newLevel * REPURCHASE_STEP_PCT}% from entry ${ref.toFixed(2)})`;

    db.prepare(`
      UPDATE portfolio SET quantity = ?, buy_price = ?, total_investment = ?, repurchase_level = ? WHERE id = ? AND user_id = ?
    `).run(newQty, newAvg, newInvestment, newLevel, holding.id, userId);
    db.prepare(`
      INSERT INTO trade_history (user_id, nse_code, underlying, trade_type, quantity, price, total_value, mode, reason)
      VALUES (?, ?, ?, 'BUY', ?, ?, ?, 'AUTO', ?)
    `).run(userId, holding.nse_code, holding.underlying, quantity, cmp, totalCost, reason);
    db.prepare(`
      UPDATE wallet SET balance = balance - ?, invested = invested + ?, updated_at = datetime('now') WHERE user_id = ?
    `).run(totalCost, totalCost, userId);

    logs.push({ type: 'BUY', code: holding.nse_code, price: cmp, quantity, totalCost, reason });
  }
  return logs;
}

// ─── JOB 3: DAILY BUY — ONE NEW STOCK PER DAY (DEEPEST 20DMA DIP) ─────────────
function runDailyBuy(priceMap, userId, settings, { force = false } = {}) {
  const logs = [];

  // Cap: only one daily-accumulation buy per IST calendar day.
  // In force mode, skip the daily cap so the demo can trigger trades on demand.
  if (!force) {
    const alreadyBought = db.prepare(`
      SELECT COUNT(*) AS c FROM trade_history
      WHERE user_id = ? AND trade_type = 'BUY' AND mode = 'AUTO'
        AND reason LIKE 'Daily%' AND traded_at >= ?
    `).get(userId, startOfISTDayUtc()).c;
    if (alreadyBought > 0) return logs;
  }

  const portfolio = db.prepare('SELECT nse_code FROM portfolio WHERE user_id = ?').all(userId);
  const heldCodes = new Set(portfolio.map(p => p.nse_code));
  const etfs = db.prepare('SELECT * FROM etf_list WHERE enabled = 1').all();

  // Eligible: not already held, valid prices.
  // In force mode, ignore the buy_trigger_pct threshold — just pick the deepest dip.
  const candidates = [];
  for (const etf of etfs) {
    if (heldCodes.has(etf.nse_code)) continue; // skip held → naturally moves to next
    const price = priceMap[etf.nse_code];
    if (!price || !price.cmp || !price.dma20) continue;
    const pctFromDMA = ((price.cmp - price.dma20) / price.dma20) * 100;
    if (force || pctFromDMA <= settings.buy_trigger_pct) {
      candidates.push({ etf, cmp: price.cmp, pctFromDMA });
    }
  }
  if (!candidates.length) return logs;

  // Pick the deepest dip (lowest % vs 20DMA).
  candidates.sort((a, b) => a.pctFromDMA - b.pctFromDMA);

  const wallet = db.prepare('SELECT * FROM wallet WHERE user_id = ?').get(userId);
  const budget = Math.min(settings.daily_budget || DEFAULT_DAILY_BUDGET, wallet.balance);
  for (const { etf, cmp, pctFromDMA } of candidates) {
    const quantity = Math.floor(budget / cmp); // as many shares as the budget allows
    if (quantity < 1) continue; // can't afford a share of this dip → try next cheaper dip
    const totalCost = quantity * cmp;
    if (totalCost > wallet.balance) continue;

    const reason = force
      ? `Force buy — deepest dip: ${pctFromDMA.toFixed(2)}% vs 20DMA`
      : `Daily 20DMA dip: ${pctFromDMA.toFixed(2)}%`;
    db.prepare(`
      INSERT INTO portfolio (user_id, nse_code, underlying, quantity, buy_price, total_investment, first_buy_price, repurchase_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(userId, etf.nse_code, etf.underlying, quantity, cmp, totalCost, cmp);
    db.prepare(`
      INSERT INTO trade_history (user_id, nse_code, underlying, trade_type, quantity, price, total_value, mode, reason)
      VALUES (?, ?, ?, 'BUY', ?, ?, ?, 'AUTO', ?)
    `).run(userId, etf.nse_code, etf.underlying, quantity, cmp, totalCost, reason);
    db.prepare(`
      UPDATE wallet SET balance = balance - ?, invested = invested + ?, updated_at = datetime('now') WHERE user_id = ?
    `).run(totalCost, totalCost, userId);

    logs.push({ type: 'BUY', code: etf.nse_code, price: cmp, quantity, totalCost, reason });
    break; // one stock per day total
  }
  return logs;
}

// ─── ORCHESTRATOR ────────────────────────────────────────────────────────────
function runAutoTrade(priceMap, userId, { force = false } = {}) {
  const settings = db.prepare('SELECT * FROM auto_settings WHERE user_id = ?').get(userId);
  if (!settings) return [];
  if (!force && !settings.enabled) return [];

  return [
    ...runSell(priceMap, userId, settings),
    ...runRepurchase(priceMap, userId, settings),
    ...runDailyBuy(priceMap, userId, settings, { force }),
  ];
}

module.exports = { runAutoTrade, isMarketOpen };
