// Auto buy/sell engine based on Mahesh Kaushik's 20DMA strategy
// Buy Rule:  CMP drops below 20DMA by buy_trigger_pct% → buy
// Sell Rule: profit >= sell_target_pct% → sell any time (stop loss disabled)

const { db } = require('./db');

function runAutoTrade(priceMap, userId) {
  const settings = db.prepare('SELECT * FROM auto_settings WHERE user_id = ?').get(userId);
  if (!settings || !settings.enabled) return [];

  const wallet = db.prepare('SELECT * FROM wallet WHERE user_id = ?').get(userId);
  const portfolio = db.prepare('SELECT * FROM portfolio WHERE user_id = ?').all(userId);
  const etfs = db.prepare('SELECT * FROM etf_list WHERE enabled = 1').all();
  const now = new Date();
  const hour = now.getHours();

  const logs = [];

  // --- SELL CHECK ---
  // Sell any time profit target is reached (no time restriction)
  for (const holding of portfolio) {
    const price = priceMap[holding.nse_code];
    if (!price) continue;

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

  // --- BUY CHECK ---
  // Check which ETFs are not currently held
  const heldCodes = new Set(portfolio.map(p => p.nse_code));
  const currentWallet = db.prepare('SELECT * FROM wallet WHERE user_id = ?').get(userId);

  for (const etf of etfs) {
    if (heldCodes.has(etf.nse_code)) continue;

    const price = priceMap[etf.nse_code];
    if (!price || !price.cmp || !price.dma20) continue;

    const { cmp, dma20 } = price;
    const pctFromDMA = ((cmp - dma20) / dma20) * 100;

    // Buy only when CMP is below 20DMA by trigger %
    if (pctFromDMA <= settings.buy_trigger_pct) {
      const maxInvest = settings.max_per_etf;
      if (currentWallet.balance < maxInvest * 0.5) continue; // need at least half

      const investAmount = Math.min(maxInvest, currentWallet.balance * 0.3);
      const quantity = Math.max(1, Math.floor(investAmount / cmp));
      const totalCost = quantity * cmp;

      if (totalCost > currentWallet.balance) continue;

      db.prepare(`
        INSERT INTO portfolio (user_id, nse_code, underlying, quantity, buy_price, total_investment)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, etf.nse_code, etf.underlying, quantity, cmp, totalCost);
      db.prepare(`
        INSERT INTO trade_history (user_id, nse_code, underlying, trade_type, quantity, price, total_value, mode, reason)
        VALUES (?, ?, ?, 'BUY', ?, ?, ?, 'AUTO', ?)
      `).run(userId, etf.nse_code, etf.underlying, quantity, cmp, totalCost, `20DMA dip: ${pctFromDMA.toFixed(2)}%`);
      db.prepare(`
        UPDATE wallet SET balance = balance - ?, invested = invested + ?, updated_at = datetime('now') WHERE user_id = ?
      `).run(totalCost, totalCost, userId);

      heldCodes.add(etf.nse_code);
      logs.push({ type: 'BUY', code: etf.nse_code, price: cmp, quantity, totalCost, reason: `20DMA dip: ${pctFromDMA.toFixed(2)}%` });
    }
  }

  return logs;
}

module.exports = { runAutoTrade };
