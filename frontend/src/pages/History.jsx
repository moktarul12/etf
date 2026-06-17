import { useState, useEffect } from 'react';
import { getHistory } from '../api';
import { ShoppingCart, DollarSign, TrendingUp, TrendingDown, Calendar } from 'lucide-react';

const fmtInr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n, d = 2) => n != null ? Number(n).toFixed(d) : '0';

export default function History() {
  const [trades, setTrades] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getHistory({ type: filter === 'ALL' ? undefined : filter, limit: 200 })
      .then(setTrades)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filter]);

  const totalBuy = trades.filter(t => t.trade_type === 'BUY').reduce((s, t) => s + t.total_value, 0);
  const totalSell = trades.filter(t => t.trade_type === 'SELL').reduce((s, t) => s + t.total_value, 0);
  const totalProfit = trades.filter(t => t.trade_type === 'SELL').reduce((s, t) => s + (t.profit || 0), 0);

  return (
    <div className="page">
      <h1 className="page-title mb-6">Trade History</h1>

      <div className="grid-3 mb-6">
        <div className="stat-card">
          <p className="stat-label">Total Bought</p>
          <p className="stat-value">{fmtInr(totalBuy)}</p>
          <p className="stat-sub">{trades.filter(t => t.trade_type === 'BUY').length} trades</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Total Sold</p>
          <p className="stat-value">{fmtInr(totalSell)}</p>
          <p className="stat-sub">{trades.filter(t => t.trade_type === 'SELL').length} trades</p>
        </div>
        <div className={`stat-card ${totalProfit >= 0 ? 'stat-card-green' : 'stat-card-red'}`}>
          <p className="stat-label">Net Realized P&amp;L</p>
          <p className={`stat-value ${totalProfit >= 0 ? 'profit' : 'loss'}`}>
            {totalProfit >= 0 ? '+' : ''}{fmtInr(totalProfit)}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4 items-center">
        {['ALL', 'BUY', 'SELL'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-outline'}`}
          >
            {f === 'ALL' ? 'All Trades' : f === 'BUY' ? '🟢 Buys' : '🟠 Sells'}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading history...</div>
        ) : trades.length === 0 ? (
          <div className="empty-state">
            <Calendar />
            <p>No trades yet</p>
          </div>
        ) : (
          <table>
            <thead><tr>
              <th>Type</th><th>ETF Code</th><th>Underlying</th>
              <th className="right">Qty</th><th className="right">Price</th>
              <th className="right">Total</th><th className="right">P&amp;L</th>
              <th className="center">Mode</th><th>Date &amp; Time</th>
            </tr></thead>
            <tbody>
              {trades.map((t) => {
                const isBuy = t.trade_type === 'BUY';
                const isPos = t.profit >= 0;
                return (
                  <tr key={t.id}>
                    <td>
                      <span className={`badge ${isBuy ? 'badge-buy' : 'badge-sell'}`}>
                        {isBuy ? <ShoppingCart size={10} /> : <DollarSign size={10} />}
                        {t.trade_type}
                      </span>
                    </td>
                    <td className="font-mono font-semibold" style={{ fontSize: 12 }}>{t.nse_code}</td>
                    <td style={{ fontSize: 12, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.underlying}</td>
                    <td className="right">{t.quantity}</td>
                    <td className="right" style={{ color: '#475569' }}>{fmtInr(t.price)}</td>
                    <td className="right font-semibold">{fmtInr(t.total_value)}</td>
                    <td className="right">
                      {!isBuy ? (
                        <span className={`flex justify-end items-center gap-1 ${isPos ? 'profit' : 'loss'}`}>
                          {isPos ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                          {isPos ? '+' : ''}{fmtInr(t.profit)}
                          <span style={{ fontSize: 11 }}>({isPos ? '+' : ''}{fmt(t.profit_pct)}%)</span>
                        </span>
                      ) : <span style={{ color: '#e2e8f0' }}>—</span>}
                    </td>
                    <td className="center">
                      <span className={`badge ${t.mode === 'AUTO' ? 'badge-auto' : 'badge-manual'}`}>{t.mode}</span>
                    </td>
                    <td style={{ fontSize: 11, whiteSpace: 'nowrap', color: '#64748b' }}>
                      {new Date(t.traded_at).toLocaleString('en-IN')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
