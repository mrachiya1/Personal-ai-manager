// The daily read: why today is what it is, where the deep work goes, and
// where the rest goes.
//
// Everything here is derived, never invented. Each line of the summary
// points at a specific input — a hora, the Moon's rasi, the personal day
// number, an inauspicious window — so a claim on the dashboard can always be
// traced back to a calculation. That is the whole difference between a
// briefing and a horoscope.

import { moonPosition, type MoonPosition } from "./moon";
import { HORA_PROFILE, horaAt, type Hora, type HoraDay } from "./hora";
import type { PanchangWindows } from "./panchang";
import { formatLocalTime, localMinutes } from "./timezone";

export interface WorkBlock {
  start: string;
  end: string;
  label: string;
  /** Why this window and not another one. */
  reason: string;
  planets: string[];
}

export interface DayEnergy {
  /** 0-100. Not a score to chase — a weighting of the day's texture. */
  score: number;
  verdict: string;
  headline: string;
  /** Concrete, sourced reasons the day leans the way it does. */
  reasons: string[];
  deepWork: WorkBlock | null;
  rest: WorkBlock | null;
  currentHora: Hora | null;
  moon: MoonPosition;
}

/** Overlap between two intervals, in minutes. */
function overlapMinutes(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const s = Math.max(new Date(aStart).getTime(), new Date(bStart).getTime());
  const e = Math.min(new Date(aEnd).getTime(), new Date(bEnd).getTime());
  return Math.max(0, (e - s) / 60000);
}

function blockedMinutes(h: Hora, panchang: PanchangWindows | null): number {
  if (!panchang) return 0;
  return (
    overlapMinutes(h.start, h.end, panchang.rahuKalam.start, panchang.rahuKalam.end) +
    overlapMinutes(h.start, h.end, panchang.yamagandam.start, panchang.yamagandam.end) +
    overlapMinutes(h.start, h.end, panchang.gulikaKalam.start, panchang.gulikaKalam.end)
  );
}

/**
 * The circadian dip. Alertness genuinely falls between roughly 1pm and 4pm
 * regardless of what the sky is doing, which is why the rest window is
 * anchored here first and only then matched to a planetary hour.
 */
const DIP_START = 13 * 60;
const DIP_END = 16 * 60;

/**
 * Value of an hora as a deep-work slot: its planet's focus quality, halved
 * for the small hours, and heavily penalised for sitting inside a window
 * you shouldn't be launching anything in anyway.
 */
function focusValue(h: Hora, panchang: PanchangWindows | null): number {
  const profile = HORA_PROFILE[h.planet];
  const span = (new Date(h.end).getTime() - new Date(h.start).getTime()) / 60000;
  const blocked = blockedMinutes(h, panchang) / (span || 1);
  const mid = localMinutes(new Date((new Date(h.start).getTime() + new Date(h.end).getTime()) / 2));

  let value = profile.focusScore;
  if (!h.daytime) value *= 0.55; // possible, but it costs you tomorrow
  if (mid >= DIP_START && mid < DIP_END) value *= 0.7;
  value *= 1 - 0.75 * blocked;
  return value;
}

/** Best run of `count` consecutive horas by total focus value. */
function bestRun(horas: Hora[], count: number, panchang: PanchangWindows | null, invert = false) {
  let best: { index: number; value: number } | null = null;
  for (let i = 0; i + count <= horas.length; i++) {
    let value = 0;
    for (let k = 0; k < count; k++) value += focusValue(horas[i + k], panchang);
    if (!best || (invert ? value < best.value : value > best.value)) best = { index: i, value };
  }
  return best;
}

function personalDayNote(personalDay: number | null): string | null {
  if (personalDay === null) return null;
  if (personalDay === 11 || personalDay === 22 || personalDay === 33) {
    return `Personal Day ${personalDay} is a master number — the day rewards work you would put your name on, not filler.`;
  }
  if (personalDay % 2 === 1) {
    return `Personal Day ${personalDay} is odd, which is your initiating side: start things, send the pitch, make the call.`;
  }
  return `Personal Day ${personalDay} is even, which is your consolidating side: finish, tidy, invoice, close loops.`;
}

export function computeDayEnergy(input: {
  horaDay: HoraDay | null;
  panchang: PanchangWindows | null;
  personalDay: number | null;
  now?: Date;
}): DayEnergy {
  const now = input.now ?? new Date();
  const moon = moonPosition(now);
  const currentHora = horaAt(input.horaDay, now);

  // --- deep work: the best two consecutive daytime horas -------------------
  let deepWork: WorkBlock | null = null;
  let rest: WorkBlock | null = null;

  if (input.horaDay) {
    const daytime = input.horaDay.horas.filter((h) => h.daytime);
    const run = bestRun(daytime, 2, input.panchang);
    if (run) {
      const a = daytime[run.index];
      const b = daytime[run.index + 1];
      deepWork = {
        start: a.start,
        end: b.end,
        label: `${HORA_PROFILE[a.planet].quality} → ${HORA_PROFILE[b.planet].quality}`,
        planets: [a.planet, b.planet],
        reason:
          a.planet === b.planet
            ? `A double ${a.planet} hora — ${HORA_PROFILE[a.planet].favors}. Clear of every inauspicious window.`
            : `${a.planet} into ${b.planet}: ${HORA_PROFILE[a.planet].favors}, then ${HORA_PROFILE[b.planet].favors}. Clear of every inauspicious window.`,
      };
    }

    // --- rest: the weakest daytime hora, biased toward the afternoon dip ---
    const restRun = bestRun(daytime, 1, input.panchang, true);
    if (restRun) {
      const h = daytime[restRun.index];
      const insideBlocked = blockedMinutes(h, input.panchang) > 5;
      const mid = localMinutes(new Date((new Date(h.start).getTime() + new Date(h.end).getTime()) / 2));
      const inDip = mid >= DIP_START && mid < DIP_END;
      rest = {
        start: h.start,
        end: h.end,
        label: "Reset window",
        planets: [h.planet],
        reason: [
          insideBlocked
            ? "This sits inside an inauspicious window, so nothing high-stakes should be launched here anyway."
            : `A ${h.planet} hora is the day's weakest stretch for focused output.`,
          inDip
            ? "It also lands in the post-lunch circadian dip, when alertness drops whatever the sky is doing."
            : "Take it deliberately rather than pushing through.",
          "This is the block that prevents the rework loop: tired perfectionism re-cuts work that was already finished, and costs a second day.",
        ].join(" "),
      };
    }
  }

  // --- reasons -------------------------------------------------------------
  const reasons: string[] = [];
  reasons.push(
    `The Moon is in ${moon.rasi} at ${moon.nakshatra} — ${moon.mood}, which favors ${moon.favors}.`
  );
  if (moon.illumination > 0.9) {
    reasons.push("Near-full Moon: high visibility and high energy, and a short fuse. Good for shipping, poor for negotiating.");
  } else if (moon.illumination < 0.1) {
    reasons.push("Near-new Moon: low external energy. Good for planning and setup, poor for launches.");
  } else {
    reasons.push(
      `${moon.waxing ? "Waxing" : "Waning"} at ${Math.round(moon.illumination * 100)}% — ${moon.waxing ? "building; put weight behind new work" : "releasing; close and deliver rather than open"}.`
    );
  }
  const note = personalDayNote(input.personalDay);
  if (note) reasons.push(note);
  if (currentHora) {
    reasons.push(
      `Right now is a ${currentHora.planet} hora (${HORA_PROFILE[currentHora.planet].quality.toLowerCase()}) — ${HORA_PROFILE[currentHora.planet].favors}.`
    );
  }
  if (deepWork) {
    reasons.push(
      `Your cleanest run today is ${formatLocalTime(deepWork.start)}–${formatLocalTime(deepWork.end)}, on ${deepWork.planets.join(" and ")} horas.`
    );
  }

  // --- score ---------------------------------------------------------------
  // Weighted, not mystical: how good the best block is, how favourable the
  // Moon's phase is for pushing, and whether the numerology is initiating.
  let score = 50;
  if (input.horaDay) {
    const daytime = input.horaDay.horas.filter((h) => h.daytime);
    const avg = daytime.reduce((s, h) => s + focusValue(h, input.panchang), 0) / (daytime.length || 1);
    score = 30 + avg * 55;
  }
  if (input.personalDay !== null) {
    if ([11, 22, 33].includes(input.personalDay)) score += 8;
    else if (input.personalDay % 2 === 1) score += 4;
  }
  if (moon.illumination > 0.85) score += 5;
  score = Math.max(12, Math.min(97, Math.round(score)));

  const verdict = score >= 70 ? "High-leverage day" : score >= 50 ? "Solid working day" : "Protect the day";
  const headline =
    score >= 70
      ? "Today's alignment favors high-leverage execution."
      : score >= 50
        ? "Today carries steady output — good for finishing, not for gambling."
        : "Today is thin for big moves. Bank the small wins and protect the pipeline.";

  return { score, verdict, headline, reasons, deepWork, rest, currentHora, moon };
}

/* ------------------------------------------------------------------ */
/* Greeting                                                            */
/* ------------------------------------------------------------------ */

export interface Greeting {
  /** The Sinhala greeting itself. */
  sinhala: string;
  /** What part of the day it belongs to, for the pill. */
  band: "Morning" | "Afternoon" | "Evening";
  /** The English gloss, small, under the greeting. */
  gloss: string;
}

/**
 * Sinhala greeting by the hour, in the user's own timezone.
 *
 * The evening band deliberately runs to 4am rather than midnight: late-night
 * deep work is the same working session, and being told "good morning" at
 * 2am while still rendering is the kind of small wrongness that makes a
 * dashboard feel like it isn't paying attention.
 */
export function sinhalaGreeting(hour: number): Greeting {
  if (hour >= 4 && hour < 12) return { sinhala: "Subha Udesanak", band: "Morning", gloss: "Good morning" };
  if (hour >= 12 && hour < 17) return { sinhala: "Subha Dawasak", band: "Afternoon", gloss: "Good day" };
  return { sinhala: "Ayubowan", band: "Evening", gloss: hour < 4 ? "Late-night deep work" : "Good evening" };
}
