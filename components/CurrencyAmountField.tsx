"use client";

import { useEffect, useState } from "react";

/** Amount + currency (LKR/USD) pair with a live "≈ Rs X" hint when USD is picked. */
export function CurrencyAmountField({
  amount,
  currency,
  onAmountChange,
  onCurrencyChange,
  label = "Amount",
}: {
  amount: string;
  currency: string;
  onAmountChange: (v: string) => void;
  onCurrencyChange: (v: string) => void;
  label?: string;
}) {
  const [rate, setRate] = useState<number | null>(null);
  const [rateError, setRateError] = useState(false);

  useEffect(() => {
    if (currency !== "USD" || rate || rateError) return;
    fetch("/api/exchange-rate")
      .then((r) => r.json())
      .then((d) => {
        if (d.usdToLkr) setRate(d.usdToLkr);
        else setRateError(true);
      })
      .catch(() => setRateError(true));
  }, [currency, rate, rateError]);

  const converted = currency === "USD" && rate && amount ? Number(amount) * rate : null;

  return (
    <div className="form-row">
      <div className="form-field">
        <label>{label}</label>
        <input type="number" step="0.01" value={amount} onChange={(e) => onAmountChange(e.target.value)} />
        {converted !== null && (
          <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 4 }}>
            ≈ Rs {converted.toLocaleString(undefined, { maximumFractionDigits: 0 })} at today&rsquo;s rate
          </div>
        )}
        {currency === "USD" && rateError && (
          <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 4 }}>Couldn&rsquo;t fetch today&rsquo;s rate.</div>
        )}
      </div>
      <div className="form-field">
        <label>Currency</label>
        <select value={currency} onChange={(e) => onCurrencyChange(e.target.value)}>
          <option value="LKR">LKR</option>
          <option value="USD">USD</option>
        </select>
      </div>
    </div>
  );
}
