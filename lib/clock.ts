// Pure time formatting, with no settings/fs dependency.
//
// Split out from lib/timezone.ts because that file reads the settings store,
// which touches `fs` — importing it from a "use client" component drags Node
// built-ins into the browser bundle and the build fails with a bare
// "Can't resolve 'fs'". Client components take the offset as a prop and call
// these; server code calls the wrappers in lib/timezone.ts.

/** Clock time for an instant, shifted into a fixed UTC offset. */
export function formatTimeAt(iso: string | Date, offsetHours: number): string {
  const t = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(t.getTime())) return "—";
  return new Date(t.getTime() + offsetHours * 3600_000).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

/** Minutes since local midnight for an instant. */
export function minutesAt(iso: string | Date, offsetHours: number): number {
  const t = typeof iso === "string" ? new Date(iso) : iso;
  const shifted = new Date(t.getTime() + offsetHours * 3600_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** Date and time for an instant, in a fixed UTC offset. */
export function formatDateTimeAt(iso: string | Date, offsetHours: number): string {
  const t = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(t.getTime())) return "—";
  return new Date(t.getTime() + offsetHours * 3600_000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

/**
 * `<input type="datetime-local">` value → ISO instant.
 *
 * `new Date("2026-08-27T23:30")` is parsed in the *browser's* timezone, which
 * is not necessarily the one the workspace runs on. Someone logging sleep from
 * a laptop still set to another country would have every entry silently
 * shifted. The wall-clock time entered is treated as the workspace's own, so
 * what you type is what the rest of the app shows back.
 */
export function localInputToISO(value: string, offsetHours: number): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return undefined;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - offsetHours * 3600_000).toISOString();
}

/** The inverse — an ISO instant as a datetime-local input value. */
export function isoToLocalInput(iso: string | undefined, offsetHours: number): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return new Date(t.getTime() + offsetHours * 3600_000).toISOString().slice(0, 16);
}
