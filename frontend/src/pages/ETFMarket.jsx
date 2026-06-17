import { useState, useEffect, useCallback } from 'react';
import { getETFs, getETFPrices, buyETF, sellETF, getPortfolio, getWallet } from '../api';
import { RefreshCw, TrendingUp, TrendingDown, ShoppingCart, DollarSign, Search, AlertCircle } from 'lucide-react';

const fmtInr = (n) => n != null ? '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const fmt = (n, d = 2) => n != null ? Number(n).toFixed(d) : '—';


export default function ETFMarket() {
  const [etfs, setEtfs] = useState([]);
  const [prices, setPrices] = useState({});
  const [portfolio, setPortfolio] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [tradeModal, setTradeModal] = useState(null); // { etf, type, price }
  const [qty, setQty] = useState(1);
  const [tradePrice, setTradePrice] = useState('');
  const [doing, setDoing] = useState(false);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);

  const loadStatic = useCallback(async () => {
    setLoading(true);
    try {
      const [etfList, ptf, wlt] = await Promise.all([getETFs(), getPortfolio(), getWallet()]);
      setEtfs(etfList);
      setPortfolio(ptf);
      setWallet(wlt);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  const refreshPrices = useCallback(async () => {
    setPriceLoading(true);
    setError('');
    try {
      const data = await getETFPrices();
      setPrices(data);
      setLastRefresh(new Date());
    } catch (e) { setError('Price fetch failed: ' + e.message); }
    setPriceLoading(false);
  }, []);

  useEffect(() => { loadStatic(); }, [loadStatic]);

  const openBuy = (etf) => {
    const p = prices[etf.nse_code];
    const price = p?.cmp || 0;
    setTradeModal({ etf, type: 'BUY' });
    setQty(1);
    setTradePrice(price.toFixed(2));
    setError('');
  };

  const openSell = (etf) => {
    const p = prices[etf.nse_code];
    const price = p?.cmp || 0;
    setTradeModal({ etf, type: 'SELL' });
    setQty(1);
    setTradePrice(price.toFixed(2));
    setError('');
  };

  const executeTrade = async () => {
    if (!tradeModal) return;
    setDoing(true);
    setError('');
    try {
      const payload = { nse_code: tradeModal.etf.nse_code, quantity: parseInt(qty), price: parseFloat(tradePrice) };
      if (tradeModal.type === 'BUY') await buyETF(payload);
      else await sellETF(payload);
      const [ptf, wlt] = await Promise.all([getPortfolio(), getWallet()]);
      setPortfolio(ptf);
      setWallet(wlt);
      setTradeModal(null);
    } catch (e) { setError(e.message); }
    setDoing(false);
  };

  const heldMap = Object.fromEntries(portfolio.map(p => [p.nse_code, p]));

  const filtered = etfs.filter(e =>
    e.enabled &&
    (e.nse_code.toLowerCase().includes(search.toLowerCase()) ||
      e.underlying.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="page">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="page-title">ETF Market</h1>
          <p className="page-sub">
            {lastRefresh ? `Prices updated: ${lastRefresh.toLocaleTimeString()}` : 'Click Refresh to load live prices'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {wallet && (
            <div style={{ textAlign: 'right' }}>
              <p className="text-xs" style={{ color: '#64748b' }}>Available Cash</p>
              <p className="font-bold text-lg" style={{ color: '#15803d' }}>{fmtInr(wallet.balance)}</p>
            </div>
          )}
          <button className="btn btn-primary" onClick={refreshPrices} disabled={priceLoading}>
            <RefreshCw size={14} className={priceLoading ? 'spin' : ''} />
            {priceLoading ? 'Fetching...' : 'Refresh Prices'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Search */}
      <div className="input-with-icon mb-4">
        <Search className="input-icon" size={15} />
        <input
          className="input"
          style={{ paddingLeft: 36 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search ETF code or underlying..."
        />
      </div>

      {/* Table */}
      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ETF NSE Code</th>
                <th>Underlying Asset</th>
                <th className="right">CMP</th>
                <th className="right">20 DMA</th>
                <th className="right">CMP – 20DMA</th>
                <th className="right">% vs 20DMA</th>
                <th className="center">Holding</th>
                <th className="center">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="text-center" style={{ padding: '40px', color: '#94a3b8' }}>Loading ETF list...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center" style={{ padding: '40px', color: '#94a3b8' }}>No ETFs found</td></tr>
              )}
              {filtered.map((etf) => {
                const p = prices[etf.nse_code];
                const holding = heldMap[etf.nse_code];
                const pct = p?.pct_change;
                const isPos = pct != null && pct >= 0;
                const isNeg = pct != null && pct < 0;
                const isBuySignal = pct != null && pct < -1;

                return (
                  <tr key={etf.id} className={isBuySignal ? 'highlight-buy' : ''}>
                    <td>
                      <div className="flex items-center gap-2">
                        {isBuySignal && <span className="badge-dot badge-dot-green" title="Buy signal" />}
                        <span className="font-mono font-semibold" style={{ fontSize: 12 }}>{etf.nse_code}</span>
                      </div>
                    </td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{etf.underlying}</td>
                    <td className="right font-semibold">{p ? fmtInr(p.cmp) : <span style={{ color: '#e2e8f0' }}>—</span>}</td>
                    <td className="right" style={{ color: '#475569' }}>{p ? fmtInr(p.dma20) : <span style={{ color: '#e2e8f0' }}>—</span>}</td>
                    <td className={`right font-semibold ${isPos ? 'profit' : isNeg ? 'loss' : 'neutral-val'}`}>
                      {p ? (isPos ? '+' : '') + fmtInr(p.diff) : '—'}
                    </td>
                    <td className="right">
                      {p ? (
                        <span className={`flex items-center justify-end gap-1 font-semibold ${isPos ? 'profit' : isNeg ? 'loss' : 'neutral-val'}`}>
                          {isPos ? <TrendingUp size={13} /> : isNeg ? <TrendingDown size={13} /> : null}
                          {(isPos ? '+' : '') + fmt(pct)}%
                        </span>
                      ) : <span style={{ color: '#e2e8f0' }}>—</span>}
                    </td>
                    <td className="center">
                      {holding ? (
                        <div style={{ fontSize: 12 }}>
                          <p className="font-semibold" style={{ color: '#2563eb' }}>{holding.quantity} units</p>
                          <p style={{ color: '#64748b' }}>@ {fmtInr(holding.buy_price)}</p>
                        </div>
                      ) : <span style={{ color: '#e2e8f0', fontSize: 12 }}>—</span>}
                    </td>
                    <td className="center">
                      <div className="flex justify-center gap-2">
                        <button className="btn btn-success btn-sm" onClick={() => openBuy(etf)}>
                          <ShoppingCart size={12} /> Buy
                        </button>
                        {holding && (
                          <button className="btn btn-warning btn-sm" onClick={() => openSell(etf)}>
                            <DollarSign size={12} /> Sell
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, textAlign: 'center' }}>
        🟢 Green rows = CMP below 20DMA by &gt;1% (Mahesh buy signal). Prices via Yahoo Finance (20DMA = last 20 closes).
      </p>

      {/* Trade Modal */}
      {tradeModal && (
        <div className="modal-overlay">
          <div className="modal">
            <p className="modal-title">
              {tradeModal.type === 'BUY' ? '🟢 Buy' : '🟠 Sell'} {tradeModal.etf.nse_code}
            </p>
            <p className="modal-sub">{tradeModal.etf.underlying}</p>

            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

            <div className="form-group">
              <label className="label">Price (₹)</label>
              <input type="number" step="0.01" className="input" value={tradePrice} onChange={e => setTradePrice(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Quantity</label>
              <input type="number" min="1" className="input" value={qty} onChange={e => setQty(e.target.value)} />
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: '#475569' }}>
                Total: <strong style={{ color: '#0f172a' }}>{fmtInr(parseFloat(tradePrice || 0) * parseInt(qty || 1))}</strong>
              </p>
              {wallet && <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Cash available: {fmtInr(wallet.balance)}</p>}
            </div>

            <div className="flex gap-3">
              <button className="btn btn-outline flex-1" onClick={() => { setTradeModal(null); setError(''); }}>Cancel</button>
              <button
                className={`btn flex-1 ${tradeModal.type === 'BUY' ? 'btn-success' : 'btn-warning'}`}
                onClick={executeTrade}
                disabled={doing}
              >
                {doing ? 'Processing...' : `Confirm ${tradeModal.type}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
