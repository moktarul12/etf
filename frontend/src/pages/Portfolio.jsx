import { useState, useEffect } from 'react';
import { getPortfolio, getWallet, getETFPrices, sellETF } from '../api';
import { TrendingUp, TrendingDown, DollarSign, RefreshCw, Package } from 'lucide-react';

const fmtInr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n, d = 2) => n != null ? Number(n).toFixed(d) : '—';

export default function Portfolio() {
  const [portfolio, setPortfolio] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [priceLoading, setPriceLoading] = useState(false);
  const [sellModal, setSellModal] = useState(null);
  const [qty, setQty] = useState(1);
  const [doing, setDoing] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [ptf, wlt] = await Promise.all([getPortfolio(), getWallet()]);
      setPortfolio(ptf);
      setWallet(wlt);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const refreshPrices = async () => {
    setPriceLoading(true);
    try { setPrices(await getETFPrices()); }
    catch (e) { setError('Price fetch failed: ' + e.message); }
    setPriceLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openSell = (h) => {
    setSellModal(h);
    setQty(h.quantity);
    setError('');
  };

  const executeSell = async () => {
    if (!sellModal) return;
    setDoing(true); setError('');
    const p = prices[sellModal.nse_code];
    const price = p?.cmp || sellModal.buy_price;
    try {
      await sellETF({ nse_code: sellModal.nse_code, quantity: parseInt(qty), price });
      await load();
      setSellModal(null);
    } catch (e) { setError(e.message); }
    setDoing(false);
  };

  const totalInvested = portfolio.reduce((s, h) => s + h.total_investment, 0);
  const totalCurrent = portfolio.reduce((s, h) => {
    const p = prices[h.nse_code];
    return s + (p ? p.cmp * h.quantity : h.total_investment);
  }, 0);
  const unrealized = totalCurrent - totalInvested;

  return (
    <div className="page">
      <div className="flex justify-between items-center mb-6">
        <h1 className="page-title">Portfolio</h1>
        <button className="btn btn-outline" onClick={refreshPrices} disabled={priceLoading}>
          <RefreshCw size={14} className={priceLoading ? 'spin' : ''} /> Refresh Prices
        </button>
      </div>

      {portfolio.length > 0 && (
        <div className="grid-3 mb-6">
          <div className="stat-card">
            <p className="stat-label">Total Invested</p>
            <p className="stat-value">{fmtInr(totalInvested)}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Current Value</p>
            <p className="stat-value">{fmtInr(totalCurrent)}</p>
          </div>
          <div className={`stat-card ${unrealized >= 0 ? 'stat-card-green' : 'stat-card-red'}`}>
            <p className="stat-label">Unrealized P&amp;L</p>
            <p className={`stat-value flex items-center gap-1 ${unrealized >= 0 ? 'profit' : 'loss'}`}>
              {unrealized >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              {unrealized >= 0 ? '+' : ''}{fmtInr(unrealized)}
            </p>
          </div>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>Loading portfolio...</div>
      ) : portfolio.length === 0 ? (
        <div className="empty-state">
          <Package />
          <p>No holdings yet</p>
          <p className="sub">Go to ETF Market and start buying</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>ETF Code</th><th>Underlying</th>
              <th className="right">Qty</th><th className="right">Avg Buy</th>
              <th className="right">CMP</th><th className="right">P&amp;L</th>
              <th className="right">P&amp;L %</th><th className="center">Action</th>
            </tr></thead>
            <tbody>
              {portfolio.map((h) => {
                const p = prices[h.nse_code];
                const cmp = p?.cmp;
                const currentVal = cmp ? cmp * h.quantity : null;
                const pnl = currentVal != null ? currentVal - h.total_investment : null;
                const pnlPct = pnl != null ? (pnl / h.total_investment) * 100 : null;
                const isPos = pnl != null && pnl >= 0;
                return (
                  <tr key={h.id}>
                    <td className="font-mono font-semibold" style={{ fontSize: 12 }}>{h.nse_code}</td>
                    <td style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.underlying}</td>
                    <td className="right font-semibold">{h.quantity}</td>
                    <td className="right" style={{ color: '#475569' }}>{fmtInr(h.buy_price)}</td>
                    <td className="right font-semibold">{cmp ? fmtInr(cmp) : <span style={{ color: '#e2e8f0' }}>—</span>}</td>
                    <td className={`right ${pnl == null ? 'neutral-val' : isPos ? 'profit' : 'loss'}`}>
                      {pnl != null ? (isPos ? '+' : '') + fmtInr(pnl) : '—'}
                    </td>
                    <td className={`right ${pnlPct == null ? 'neutral-val' : isPos ? 'profit' : 'loss'}`}>
                      {pnlPct != null ? (isPos ? '+' : '') + fmt(pnlPct) + '%' : '—'}
                    </td>
                    <td className="center">
                      <button className="btn btn-warning btn-sm mx-auto" onClick={() => openSell(h)}>
                        <DollarSign size={12} /> Sell
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sellModal && (
        <div className="modal-overlay">
          <div className="modal">
            <p className="modal-title">🟠 Sell {sellModal.nse_code}</p>
            <p className="modal-sub">{sellModal.underlying}</p>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-group">
              <label className="label">Quantity (max: {sellModal.quantity})</label>
              <input type="number" min="1" max={sellModal.quantity} className="input" value={qty} onChange={e => setQty(e.target.value)} />
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13 }}>
              Sell Price (CMP): <strong>{prices[sellModal.nse_code] ? fmtInr(prices[sellModal.nse_code].cmp) : fmtInr(sellModal.buy_price) + ' (avg buy)'}</strong>
            </div>
            <div className="flex gap-3">
              <button className="btn btn-outline flex-1" onClick={() => { setSellModal(null); setError(''); }}>Cancel</button>
              <button className="btn btn-warning flex-1" onClick={executeSell} disabled={doing}>
                {doing ? 'Selling...' : 'Confirm Sell'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
