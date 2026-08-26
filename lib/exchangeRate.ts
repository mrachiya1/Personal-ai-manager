// Free, keyless exchange-rate lookup (same "no API key needed" pattern as
// api.sunrise-sunset.org for Panchang) — used to show a live LKR estimate
// when you log an expense/income in USD. Cached in-memory for an hour so we
// don't hammer the API on every keystroke.

let cache: { rate: number; fetchedAt: number } | null = null;
const CACHE_MS = 60 * 60 * 1000; // 1 hour

export async function getUsdToLkrRate(): Promise<number> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.rate;
  }
  const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
  if (!res.ok) throw new Error(`Exchange rate API ${res.status}`);
  const data = await res.json();
  const rate = data?.rates?.LKR;
  if (!rate) throw new Error("LKR rate not found in exchange rate response");
  cache = { rate, fetchedAt: Date.now() };
  return rate;
}
