import { useState, useEffect } from 'react';
import { getAutoSettings, saveAutoSettings, runAutoTrade, forceAutoTrade } from '../api';
import { Zap, Play, Pause, Settings, CheckCircle, AlertTriangle, RefreshCw, Flame } from 'lucide-react';

export default function AutoTrade() {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [forcing, setForcing] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    getAutoSettings().then(s => { setSettings(s); setForm({ ...s }); }).catch(e => setError(e.message));
  }, []);

  const handleSave = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const saved = await saveAutoSettings(form);
      setSettings(saved);
      setSuccess('Settings saved!');
      setTimeout(() => setSuccess(''), 2500);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const handleToggle = async () => {
    const newEnabled = !settings.enabled;
    const updated = await saveAutoSettings({ ...settings, enabled: newEnabled });
    setSettings(updated);
    setForm({ ...updated });
  };

  const handleRunNow = async () => {
    setRunning(true); setRunResult(null); setError('');
    try {
      const res = await runAutoTrade();
      setRunResult(res);
    } catch (e) { setError(e.message); }
    setRunning(false);
  };

  const handleForceTrade = async () => {
    setForcing(true); setRunResult(null); setError('');
    try {
      const res = await forceAutoTrade();
      setRunResult(res);
    } catch (e) { setError(e.message); }
    setForcing(false);
  };

  if (!settings || !form) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading settings...</div>;

  const field = (label, key, opts = {}) => (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        step={opts.step || '0.1'}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
        className="input"
      />
      {opts.hint && <p className="hint">{opts.hint}</p>}
    </div>
  );

  return (
    <div className="page-sm">
      <div className="flex justify-between items-center mb-6">
        <h1 className="page-title">Auto Trade</h1>
        <button
          onClick={handleToggle}
          className={`btn ${settings.enabled ? 'btn-danger' : 'btn-success'}`}
        >
          {settings.enabled ? <Pause size={15} /> : <Play size={15} />}
          {settings.enabled ? 'Disable Auto Trade' : 'Enable Auto Trade'}
        </button>
      </div>

      {/* Status banner */}
      <div className={`alert ${settings.enabled ? 'alert-success' : ''}`}
        style={!settings.enabled ? { background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569' } : {}}>
        <Zap size={16} style={{ color: settings.enabled ? '#16a34a' : '#94a3b8' }} />
        <div>
          <p className="font-semibold">Auto Trade is {settings.enabled ? 'ENABLED' : 'DISABLED'}</p>
          <p style={{ fontSize: 12, marginTop: 2 }}>
            {settings.enabled
              ? 'Engine runs every 30 minutes during market hours (9:15 AM – 3:30 PM IST).'
              : 'Enable to automatically buy ETFs on 20DMA dips and sell at targets.'}
          </p>
        </div>
      </div>

      {/* Strategy info */}
      <div className="info-box mb-6">
        <p className="info-box-title">📊 Mahesh Kaushik 20DMA Strategy</p>
        <div className="strategy-grid">
          <div className="strategy-item"><strong>🟢 Daily Buy</strong>Once per day, spend the daily budget on the deepest 20DMA dip (lowest % vs 20DMA) not already held — buys as many shares as the budget allows</div>
          <div className="strategy-item"><strong>🔵 Repurchase</strong>Average down on a holding at each -10%, -20%, -30%… below its original buy price (each step once)</div>
          <div className="strategy-item"><strong>🟠 Sell Signal</strong>Sell immediately when profit ≥ target % (any time, no restriction)</div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">✓ {success}</div>}

      {/* Settings form */}
      <div className="card card-p mb-4">
        <h2 className="flex items-center gap-2 font-semibold mb-4" style={{ fontSize: 14 }}>
          <Settings size={15} /> Trade Settings
        </h2>
        <div className="form-row">
          {field('Daily Buy Budget (₹)', 'daily_budget', { step: '500', hint: 'Amount spent per purchase (default ₹2000) — qty = budget ÷ price' })}
          {field('Buy Trigger (% below 20DMA)', 'buy_trigger_pct', { hint: 'e.g. -2 = buy when CMP is 2% below 20DMA' })}
          {field('Sell Target Profit (%)', 'sell_target_pct', { hint: 'Sell immediately when profit reaches this % — any time of day' })}
        </div>
        <button className="btn btn-primary w-full" style={{ marginTop: 16 }} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Manual run */}
      <div className="card card-p">
        <div className="flex justify-between items-center" style={{ marginBottom: runResult ? 12 : 0 }}>
          <div>
            <p className="font-semibold" style={{ fontSize: 14 }}>Manual Run</p>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Run Now respects trigger thresholds. Force Trade bypasses them and buys the deepest dip.</p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-purple" onClick={handleRunNow} disabled={running || forcing}>
              <RefreshCw size={14} className={running ? 'spin' : ''} />
              {running ? 'Running...' : 'Run Now'}
            </button>
            <button className="btn btn-warning" onClick={handleForceTrade} disabled={running || forcing}>
              <Flame size={14} />
              {forcing ? 'Forcing...' : 'Force Trade'}
            </button>
          </div>
        </div>

        {runResult && (
          <div className="run-result">
            <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
              Run complete — {runResult.actions?.length || 0} action(s) taken
            </p>
            {runResult.actions?.length === 0 && (
              <p style={{ fontSize: 12, color: '#94a3b8' }}>No signals triggered. Market conditions not met.</p>
            )}
            {runResult.actions?.map((a, i) => (
              <div key={i} className={`run-item ${a.type === 'BUY' ? 'run-item-buy' : 'run-item-sell'}`}>
                <strong>{a.type}</strong> {a.code} @ ₹{a.price?.toFixed(2)} — {a.reason}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
