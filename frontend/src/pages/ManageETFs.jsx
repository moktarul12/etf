import { useState, useEffect } from 'react';
import { getETFs, addETF, deleteETF, toggleETF } from '../api';
import { Plus, Trash2, ToggleLeft, ToggleRight, Search, Settings } from 'lucide-react';

export default function ManageETFs() {
  const [etfs, setEtfs] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newUnderlying, setNewUnderlying] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [doing, setDoing] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setEtfs(await getETFs()); } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newCode.trim() || !newUnderlying.trim()) { setError('Both fields required'); return; }
    setDoing(true); setError('');
    try {
      await addETF({ nse_code: newCode.trim().toUpperCase(), underlying: newUnderlying.trim() });
      setNewCode(''); setNewUnderlying('');
      setShowAdd(false);
      setSuccess('ETF added!');
      setTimeout(() => setSuccess(''), 2500);
      await load();
    } catch (e) { setError(e.message); }
    setDoing(false);
  };

  const handleDelete = async (id, code) => {
    if (!confirm(`Delete ${code}?`)) return;
    try { await deleteETF(id); setEtfs(e => e.filter(x => x.id !== id)); }
    catch (e) { setError(e.message); }
  };

  const handleToggle = async (id) => {
    try {
      const updated = await toggleETF(id);
      setEtfs(prev => prev.map(e => e.id === id ? updated : e));
    } catch (e) { setError(e.message); }
  };

  const filtered = etfs.filter(e =>
    e.nse_code.toLowerCase().includes(search.toLowerCase()) ||
    e.underlying.toLowerCase().includes(search.toLowerCase())
  );

  const enabled = etfs.filter(e => e.enabled).length;

  return (
    <div className="page">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="page-title">Manage ETFs</h1>
          <p className="page-sub">{etfs.length} total · {enabled} enabled for auto-trade</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowAdd(!showAdd); setError(''); }}>
          <Plus size={15} /> Add ETF
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">✓ {success}</div>}

      {showAdd && (
        <div className="card card-p mb-4" style={{ borderColor: '#bfdbfe' }}>
          <h3 className="font-semibold mb-3" style={{ fontSize: 14 }}>Add New ETF Code</h3>
          <div className="form-row mb-3">
            <div>
              <label className="label">NSE Code (e.g. NSE:BANKBEES)</label>
              <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="NSE:XXXXX" className="input font-mono" />
            </div>
            <div>
              <label className="label">Underlying Asset Name</label>
              <input value={newUnderlying} onChange={e => setNewUnderlying(e.target.value)} placeholder="e.g. Nifty Bank" className="input" />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={handleAdd} disabled={doing}>{doing ? 'Adding...' : 'Add ETF'}</button>
            <button className="btn btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="input-with-icon mb-4">
        <Search className="input-icon" size={15} />
        <input className="input" style={{ paddingLeft: 36 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search NSE code or underlying..." />
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>NSE Code</th><th>Underlying Asset</th>
            <th className="center">Auto-Trade</th><th className="center">Actions</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Loading...</td></tr>}
            {!loading && filtered.map(etf => (
              <tr key={etf.id}>
                <td className="font-mono font-semibold" style={{ fontSize: 12 }}>{etf.nse_code}</td>
                <td style={{ fontSize: 12 }}>{etf.underlying}</td>
                <td className="center">
                  <button className="toggle-icon" onClick={() => handleToggle(etf.id)} title={etf.enabled ? 'Disable' : 'Enable'}>
                    {etf.enabled
                      ? <ToggleRight size={24} color="#16a34a" />
                      : <ToggleLeft size={24} color="#94a3b8" />}
                  </button>
                </td>
                <td className="center">
                  <button onClick={() => handleDelete(etf.id, etf.nse_code)}
                    style={{ padding: '4px 8px', color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6 }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 10 }}>
        Toggle the switch to include/exclude ETFs from the auto-trade engine.
      </p>
    </div>
  );
}
