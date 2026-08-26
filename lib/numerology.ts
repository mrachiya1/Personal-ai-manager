// Pure, local numerology calculations — no external API needed for these.
// Standard Pythagorean-style digit reduction, keeping master numbers
// (11, 22, 33) unreduced, which is the common convention.

const MASTER_NUMBERS = new Set([11, 22, 33]);

export function reduceToDigit(n: number, keepMasters = true): number {
  let value = Math.abs(n);
  while (value > 9 && !(keepMasters && MASTER_NUMBERS.has(value))) {
    value = String(value)
      .split("")
      .reduce((sum, d) => sum + Number(d), 0);
  }
  return value;
}

/** Life Path Number from a birth date (YYYY-MM-DD). */
export function lifePathNumber(birthDateISO: string): number | null {
  const d = parseISO(birthDateISO);
  if (!d) return null;
  const day = reduceToDigit(d.day);
  const month = reduceToDigit(d.month);
  const year = reduceToDigit(d.year);
  return reduceToDigit(day + month + year);
}

/** Personal Year Number for a given calendar year. */
export function personalYearNumber(birthDateISO: string, forYear: number): number | null {
  const d = parseISO(birthDateISO);
  if (!d) return null;
  return reduceToDigit(d.day + d.month + forYear);
}

/** Personal Day Number for a given target date. */
export function personalDayNumber(birthDateISO: string, targetDateISO: string): number | null {
  const t = parseISO(targetDateISO);
  if (!t) return null;
  const py = personalYearNumber(birthDateISO, t.year);
  if (py === null) return null;
  const personalMonth = reduceToDigit(py + t.month);
  return reduceToDigit(personalMonth + t.day);
}

export interface DateFeatures {
  isoDate: string;
  day: number;
  month: number;
  year: number;
  weekday: number; // 0 = Sunday
  weekdayName: string;
  dayOfMonthEven: boolean;
  dayOfMonthOdd: boolean;
}

export function dateFeatures(targetDateISO: string): DateFeatures {
  const d = new Date(`${targetDateISO}T00:00:00`);
  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return {
    isoDate: targetDateISO,
    day: d.getDate(),
    month: d.getMonth() + 1,
    year: d.getFullYear(),
    weekday: d.getDay(),
    weekdayName: weekdayNames[d.getDay()],
    dayOfMonthEven: d.getDate() % 2 === 0,
    dayOfMonthOdd: d.getDate() % 2 === 1,
  };
}

function parseISO(iso: string): { day: number; month: number; year: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}
