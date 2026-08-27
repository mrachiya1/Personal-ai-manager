"use client";

import { useEffect, useState } from "react";
import { formatTimeAt } from "@/lib/clock";

/**
 * The clock in the header.
 *
 * Starts from a time the server rendered, so the first paint matches the HTML
 * and React doesn't throw a hydration mismatch, then takes over on the client
 * and ticks. It reads the workspace's configured offset rather than the
 * browser's own timezone — the operator's working day is set in Settings, and
 * a laptop that thinks it is in another country should not move the clock.
 */
export default function LiveClock({ initial, tzOffset }: { initial: string; tzOffset: number }) {
  const [now, setNow] = useState<string>(initial);

  useEffect(() => {
    const tick = () => setNow(formatTimeAt(new Date(), tzOffset));
    tick();
    // Aligned to the next whole minute, then every minute — a per-second
    // interval would re-render the header sixty times as often for a display
    // that only shows minutes.
    const delay = 60_000 - (Date.now() % 60_000);
    let interval: ReturnType<typeof setInterval>;
    const timeout = setTimeout(() => {
      tick();
      interval = setInterval(tick, 60_000);
    }, delay);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [tzOffset]);

  return (
    <time className="live-clock" suppressHydrationWarning>
      {now}
    </time>
  );
}
