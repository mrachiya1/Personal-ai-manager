// Per-user, per-day corrections the Assistant is allowed to make to the Today
// dashboard.
//
// Why a separate store rather than writing through to Notion: the four things
// the chat can change here — the greeting, the day's time blocks, a metric
// card's headline figure, the focus the day is re-synthesised around — are
// *presentation state*, not records. There is no Notion property for "the
// greeting should say Ayubowan because I'm working nights this week". Writing
// them into a Notion database would corrupt the data layer to fix a display
// layer problem.
//
// Two rules keep this honest, and they are the reason the file is structured
// this way rather than as a free-form blob:
//
//   1. Everything here is scoped to a single date. An override set on Tuesday
//      does not silently colour Thursday's dashboard. On a new day the day's
//      real calculations come back on their own.
//   2. Every override records who asked for it and why, and the dashboard
//      marks an overridden value as manual. CLAUDE.md's rule is that anything
//      on a dashboard traces to a calculation or a record; a number the chat
//      typed in is neither, so it has to say so on screen rather than pass
//      itself off as derived.

import { currentUserKey } from "@/auth";
import { getJSON, setJSON, store } from "@/lib/store";
import { localDateISO } from "@/lib/timezone";

export interface GreetingOverride {
  /** The full greeting line as it should read. */
  line: string;
  /** Why it was changed — shown on hover and sent back to the model. */
  reason: string;
  setAt: string;
}

export interface ScheduleBlockOverride {
  title: string;
  /** "HH:MM" in the user's local time. Stored as wall-clock, not an instant,
   *  because "move standup to 9" means 9 on their clock whatever the server's. */
  start: string;
  end: string;
  note?: string;
  /** Set when the block replaces a scheduled task rather than adding one. */
  taskId?: string;
}

export interface ScheduleOverride {
  blocks: ScheduleBlockOverride[];
  reason: string;
  setAt: string;
}

export interface MetricOverride {
  /** Rendered verbatim on the card, so the caller controls formatting. */
  display: string;
  note?: string;
  setAt: string;
}

export interface FocusOverride {
  focus: string;
  setAt: string;
}

export interface UiOverrides {
  dateISO: string;
  greeting?: GreetingOverride;
  schedule?: ScheduleOverride;
  /** Keyed by MetricCard.key — "predictable", "tasks", "capacity", … */
  metrics?: Record<string, MetricOverride>;
  focus?: FocusOverride;
}

const EMPTY: UiOverrides = { dateISO: "" };

function keyFor(userKey: string) {
  return `ui-overrides:${userKey}`;
}

/**
 * Today's overrides for the signed-in user.
 *
 * A stored blob from a previous day is returned as empty rather than deleted:
 * the write path replaces it wholesale on the next change, and a read should
 * never mutate.
 */
export async function getUiOverrides(dateISO: string = localDateISO()): Promise<UiOverrides> {
  const userKey = await currentUserKey();
  const stored = await getJSON<UiOverrides>(keyFor(userKey), EMPTY);
  if (stored.dateISO !== dateISO) return { dateISO };
  return stored;
}

async function mutate(
  dateISO: string,
  fn: (current: UiOverrides) => UiOverrides
): Promise<UiOverrides> {
  const userKey = await currentUserKey();
  const stored = await getJSON<UiOverrides>(keyFor(userKey), EMPTY);
  const base: UiOverrides = stored.dateISO === dateISO ? stored : { dateISO };
  const next = fn(base);
  next.dateISO = dateISO;
  await setJSON(keyFor(userKey), next);
  return next;
}

export async function setGreetingOverride(line: string, reason: string, dateISO = localDateISO()) {
  return mutate(dateISO, (c) => ({ ...c, greeting: { line, reason, setAt: new Date().toISOString() } }));
}

export async function setScheduleOverride(
  blocks: ScheduleBlockOverride[],
  reason: string,
  dateISO = localDateISO()
) {
  return mutate(dateISO, (c) => ({ ...c, schedule: { blocks, reason, setAt: new Date().toISOString() } }));
}

export async function setMetricOverride(
  key: string,
  display: string,
  note: string | undefined,
  dateISO = localDateISO()
) {
  return mutate(dateISO, (c) => ({
    ...c,
    metrics: { ...(c.metrics || {}), [key]: { display, note, setAt: new Date().toISOString() } },
  }));
}

export async function setFocusOverride(focus: string, dateISO = localDateISO()) {
  return mutate(dateISO, (c) => ({ ...c, focus: { focus, setAt: new Date().toISOString() } }));
}

/**
 * Drops one override, or all of them.
 *
 * The chat needs this as much as it needs the setters: "no, put the real
 * number back" has to be a single move, not a request to type the computed
 * value in by hand — which would leave a manual marker on a figure that is
 * once again derived.
 */
export async function clearUiOverride(
  what: "greeting" | "schedule" | "focus" | "metrics" | "all",
  metricKey?: string,
  dateISO = localDateISO()
) {
  if (what === "all") {
    const userKey = await currentUserKey();
    await store().del(keyFor(userKey));
    return { dateISO } as UiOverrides;
  }
  return mutate(dateISO, (c) => {
    const next = { ...c };
    if (what === "metrics") {
      if (metricKey) {
        const metrics = { ...(next.metrics || {}) };
        delete metrics[metricKey];
        next.metrics = metrics;
      } else delete next.metrics;
    } else delete next[what];
    return next;
  });
}

/** True when anything on today's dashboard is showing a manual value. */
export function hasOverrides(o: UiOverrides): boolean {
  return Boolean(o.greeting || o.schedule || o.focus || (o.metrics && Object.keys(o.metrics).length));
}
