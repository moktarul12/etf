// Price service - fetches CMP and 20DMA from Yahoo Finance (NSE)
// NSE code format: NSE:BANKBEES -> BANKBEES.NS on Yahoo Finance

const https = require('https');

// In-memory price cache to avoid hammering Yahoo Finance
const priceCache = new Map(); // key: ticker, value: { cmp, dma20, diff, pct_change, ts }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function nseToYahoo(nseCode) {
  // Strip "NSE:" prefix, append ".NS"
  return nseCode.replace(/^NSE:/, '') + '.NS';
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ETFDukan/1.0)',
        'Accept': 'application/json',
      },
      timeout: 7000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

async function fetchPriceFromYahoo(ticker) {
  // Yahoo Finance v8 chart API - 2 months daily to compute 20DMA.
  // Try query1, fall back to query2 (datacenter IPs sometimes get blocked on one host).
  const path = `/v8/finance/chart/${ticker}?interval=1d&range=2mo`;
  let data;
  try {
    data = await fetchJson(`https://query1.finance.yahoo.com${path}`);
  } catch (e) {
    data = await fetchJson(`https://query2.finance.yahoo.com${path}`);
  }

  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${ticker}`);

  const closes = result.indicators?.quote?.[0]?.close;
  if (!closes || closes.length < 2) throw new Error(`Insufficient closes for ${ticker}`);

  // Filter out nulls
  const validCloses = closes.filter(c => c !== null && c !== undefined);
  if (validCloses.length < 2) throw new Error(`No valid closes for ${ticker}`);

  const cmp = validCloses[validCloses.length - 1];

  // 20DMA = average of last 20 valid closing prices (excluding today)
  const forDMA = validCloses.slice(-21, -1); // up to 20 days before today
  const dma20 = forDMA.length > 0
    ? forDMA.reduce((s, v) => s + v, 0) / forDMA.length
    : cmp;

  const diff = parseFloat((cmp - dma20).toFixed(2));
  const pct_change = parseFloat(((diff / dma20) * 100).toFixed(4));

  return { cmp: parseFloat(cmp.toFixed(2)), dma20: parseFloat(dma20.toFixed(2)), diff, pct_change };
}

async function getPriceForCode(nseCode) {
  const ticker = nseToYahoo(nseCode);
  const cached = priceCache.get(ticker);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached;
  }
  try {
    const price = await fetchPriceFromYahoo(ticker);
    priceCache.set(ticker, { ...price, ts: Date.now(), ticker });
    return price;
  } catch (err) {
    // Return cached stale data if available, else null
    if (cached) return { ...cached, stale: true };
    return null;
  }
}

async function getPricesForCodes(nseCodes) {
  // Batch with a concurrency limit to balance speed vs. rate limiting.
  const BATCH = 25;
  const results = {};

  for (let i = 0; i < nseCodes.length; i += BATCH) {
    const batch = nseCodes.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (code) => {
        const price = await getPriceForCode(code);
        results[code] = price;
      })
    );
    // Small delay between batches
    if (i + BATCH < nseCodes.length) {
      await new Promise(r => setTimeout(r, 50));
    }
  }

  return results;
}

module.exports = { getPriceForCode, getPricesForCodes, nseToYahoo };
