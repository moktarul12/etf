import { useState, useEffect } from 'react';
import { getWallet, addMoney, resetWallet } from '../api';
import { Wallet as WalletIcon, PlusCircle, RotateCcw, AlertCircle } from 'lucide-react';

const fmtInr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const QUICK_AMOUNTS = [10000, 25000, 50000, 100000, 500000];

export default function Wallet() {
  const [wallet, setWallet] = useState(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    try { setWallet(await getWallet()); } catch (e) { setError(e.message); }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (amt) => {
    const val = parseFloat(amt || amount);
    if (!val || val <= 0) { setError('Enter a valid amount'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const w = await addMoney(val);
      setWallet(w);
      setAmount('');
      setSuccess(`₹${val.toLocaleString('en-IN')} added successfully!`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleReset = async () => {
    if (!confirm('Reset wallet to ₹1,00,000 and clear all holdings?')) return;
    setLoading(true);
    try {
      const w = await resetWallet();
      setWallet(w);
      setSuccess('Wallet reset to ₹1,00,000');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  if (!wallet) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading wallet...</div>;

  const totalValue = wallet.balance + wallet.invested;

  return (
    <div className="page-sm">
      <h1 className="page-title mb-6">Demo Wallet</h1>

      {error && <div className="alert alert-error"><AlertCircle size={15} /> {error}</div>}
      {success && <div className="alert alert-success">✓ {success}</div>}

      {/* Gradient balance card */}
      <div className="card-gradient mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.2)', borderRadius: 12 }}>
            <WalletIcon size={22} color="#fff" />
          </div>
          <div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>Total Portfolio Value</p>
            <p style={{ fontSize: 28, fontWeight: 700 }}>{fmtInr(totalValue)}</p>
          </div>
        </div>
        <div className="grid-3">
          {[
            { label: 'Available Cash', val: wallet.balance, color: null },
            { label: 'In Holdings', val: wallet.invested, color: null },
            { label: 'Realized P&L', val: wallet.realized_profit, color: wallet.realized_profit >= 0 ? '#86efac' : '#fca5a5' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>{label}</p>
              <p style={{ fontWeight: 700, fontSize: 16, color: color || '#fff' }}>
                {val >= 0 && label === 'Realized P&L' && val > 0 ? '+' : ''}{fmtInr(val)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Add Money */}
      <div className="card card-p mb-4">
        <h2 className="flex items-center gap-2 font-semibold mb-4" style={{ fontSize: 15 }}>
          <PlusCircle size={18} color="#16a34a" /> Add Demo Money
        </h2>
        <div className="quick-btns">
          {QUICK_AMOUNTS.map(a => (
            <button key={a} className="quick-btn" onClick={() => handleAdd(a)} disabled={loading}>
              +₹{(a / 1000).toFixed(0)}K
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <input
            type="number"
            className="input flex-1"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="Enter custom amount"
          />
          <button className="btn btn-success" onClick={() => handleAdd()} disabled={loading || !amount}>
            {loading ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>

      {/* Reset */}
      <div className="card card-p">
        <div className="flex justify-between items-center">
          <div>
            <p className="font-semibold" style={{ fontSize: 14 }}>Reset Wallet</p>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Clear all holdings and reset to ₹1,00,000</p>
          </div>
          <button className="btn btn-ghost" onClick={handleReset} disabled={loading}>
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>
    </div>
  );
}
