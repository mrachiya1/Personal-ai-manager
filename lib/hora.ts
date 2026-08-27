// Planetary horas — the hour-by-hour texture of the day.
//
// Rahu Kalam tells you when NOT to act; the hora tells you what the next
// ninety minutes are actually good for, which is the more useful half for
// planning a working day. Classical method: split sunrise-to-sunset into
// twelve day horas and sunset-to-next-sunrise into twelve night horas, then
// walk the Chaldean sequence starting from the weekday's own lord.
//
// The sequence is Sun, Venus, Mercury, Moon, Saturn, Jupiter, Mars, repeating.
// Twenty-four horas later you land three steps on, which is exactly why
// Sunday is followed by Monday — a nice self-check that the order is right.
//
// Keyless, like lib/panchang.ts: the only input is sunrise/sunset.

import { fetchSunTimes } from "./panchang";
import { localDateISO } from "./timezone";

export type Planet = "Sun" | "Venus" | "Mercury" | "Moon" | "Saturn" | "Jupiter" | "Mars";

const HORA_CYCLE: Planet[] = ["Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter", "Mars"];

/** Weekday lord, 0 = Sunday. The day's first hora after sunrise. */
const DAY_LORD: Planet[] = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];

export interface HoraProfile {
  /** One word for what this hora is made of. */
  quality: string;
  /** The kind of work it carries. */
  favors: string;
  /** How much weight to give it when picking a deep-work block, 0-1. */
  focusScore: number;
  /** True for the hours better spent recovering than pushing. */
  restful: boolean;
}

export const HORA_PROFILE: Record<Planet, HoraProfile> = {
  Sun: {
    quality: "Authority",
    favors: "decisions, approvals, anything that needs your name on it",
    focusScore: 0.75,
    restful: false,
  },
  Venus: {
    quality: "Craft",
    favors: "design, look development, colour, branding — the work that has to be beautiful",
    focusScore: 0.95,
    restful: false,
  },
  Mercury: {
    quality: "Precision",
    favors: "code, scripting, quoting, contracts, anything with a spec to get exactly right",
    focusScore: 1,
    restful: false,
  },
  Moon: {
    quality: "Flow",
    favors: "client conversations, concepting, and the soft end of creative work",
    focusScore: 0.6,
    restful: true,
  },
  Saturn: {
    quality: "Grind",
    favors: "render queues, archiving, admin, the unglamorous structural work",
    focusScore: 0.45,
    restful: true,
  },
  Jupiter: {
    quality: "Expansion",
    favors: "pitching, pricing up, teaching, and money conversations",
    focusScore: 0.9,
    restful: false,
  },
  Mars: {
    quality: "Push",
    favors: "shipping, cutting scope, hard technical problems, deadline sprints",
    focusScore: 0.8,
    restful: false,
  },
};

export interface Hora {
  planet: Planet;
  start: string; // ISO
  end: string; // ISO
  /** False for the twelve horas between sunset and the next sunrise. */
  daytime: boolean;
}

export interface HoraDay {
  date: string;
  sunrise: string;
  sunset: string;
  nextSunrise: string;
  horas: Hora[];
}

function slice(from: Date, to: Date, count: number, firstIndex: number, daytime: boolean): Hora[] {
  const step = (to.getTime() - from.getTime()) / count;
  return Array.from({ length: count }, (_, i) => ({
    planet: HORA_CYCLE[(firstIndex + i) % 7],
    start: new Date(from.getTime() + i * step).toISOString(),
    end: new Date(from.getTime() + (i + 1) * step).toISOString(),
    daytime,
  }));
}

export async function getHoraDay(dateISO: string = localDateISO()): Promise<HoraDay | null> {
  const tomorrow = new Date(`${dateISO}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowISO = tomorrow.toISOString().slice(0, 10);

  const [today, next] = await Promise.all([fetchSunTimes(dateISO), fetchSunTimes(tomorrowISO)]);
  if (!today || !next) return null;

  const sunrise = new Date(today.sunrise);
  const sunset = new Date(today.sunset);
  const nextSunrise = new Date(next.sunrise);

  // Anchor the weekday to the calendar date at UTC noon, so a server running
  // in another timezone can't slip a day and shift every hora by one planet.
  const weekday = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
  const first = HORA_CYCLE.indexOf(DAY_LORD[weekday]);

  const day = slice(sunrise, sunset, 12, first, true);
  const night = slice(sunset, nextSunrise, 12, first + 12, false);

  return {
    date: dateISO,
    sunrise: sunrise.toISOString(),
    sunset: sunset.toISOString(),
    nextSunrise: nextSunrise.toISOString(),
    horas: [...day, ...night],
  };
}

export function horaAt(day: HoraDay | null, at: Date): Hora | null {
  if (!day) return null;
  const t = at.getTime();
  return day.horas.find((h) => t >= new Date(h.start).getTime() && t < new Date(h.end).getTime()) ?? null;
}
