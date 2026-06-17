const BASE = '/api';

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ETF
export const getETFs = () => req('/etf');
export const getETFPrices = () => req('/etf/prices');
export const addETF = (data) => req('/etf', { method: 'POST', body: data });
export const deleteETF = (id) => req(`/etf/${id}`, { method: 'DELETE' });
export const toggleETF = (id) => req(`/etf/${id}/toggle`, { method: 'PATCH' });
export const updateETFSettings = (id, data) => req(`/etf/${id}/settings`, { method: 'PATCH', body: data });

// Wallet
export const getWallet = () => req('/wallet');
export const addMoney = (amount) => req('/wallet/add', { method: 'POST', body: { amount } });
export const resetWallet = () => req('/wallet/reset', { method: 'POST' });

// Portfolio
export const getPortfolio = () => req('/portfolio');
export const buyETF = (data) => req('/trade/buy', { method: 'POST', body: data });
export const sellETF = (data) => req('/trade/sell', { method: 'POST', body: data });

// History
export const getHistory = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return req('/history' + (qs ? '?' + qs : ''));
};

// Auto settings
export const getAutoSettings = () => req('/auto-settings');
export const saveAutoSettings = (data) => req('/auto-settings', { method: 'PUT', body: data });
export const runAutoTrade = () => req('/auto-trade/run', { method: 'POST' });
