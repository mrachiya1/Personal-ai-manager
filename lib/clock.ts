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
