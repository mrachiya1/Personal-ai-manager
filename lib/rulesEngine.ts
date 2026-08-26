import type { CoreRule } from "./types";
import { dateFeatures, personalDayNumber, type DateFeatures } from "./numerology";

export interface RuleVars {
  day_of_month: number;
  month: number;
  year: number;
  weekday: number;
  personal_day_number: number | null;
}

export interface TriggeredRule extends CoreRule {
  triggered: boolean;
}

/**
 * Evaluates a rule's `Condition` text (e.g. "day_of_month % 2 == 0") against
 * today's variables. This is a single-user, local tool — the condition
 * strings only ever come from your own Notion Core Rules database, which
 * you control — so a constrained `Function` evaluator (only these five
 * variables in scope, nothing else) is an acceptable trade-off here. Don't
 * reuse this pattern anywhere that evaluates untrusted input.
 */
function evalCondition(condition: string, vars: RuleVars): boolean {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      "day_of_month",
      "month",
      "year",
      "weekday",
      "personal_day_number",
      `"use strict"; return (${condition});`
    );
    return Boolean(fn(vars.day_of_month, vars.month, vars.year, vars.weekday, vars.personal_day_number));
  } catch {
    return false;
  }
}

export function buildRuleVars(targetDateISO: string, birthDateISO?: string): RuleVars {
  const features: DateFeatures = dateFeatures(targetDateISO);
  return {
    day_of_month: features.day,
    month: features.month,
    year: features.year,
    weekday: features.weekday,
    personal_day_number: birthDateISO ? personalDayNumber(birthDateISO, targetDateISO) : null,
  };
}

export function evaluateRules(rules: CoreRule[], vars: RuleVars): TriggeredRule[] {
  return rules
    .filter((r) => r.active && r.condition)
    .map((r) => ({ ...r, triggered: evalCondition(r.condition, vars) }));
}

export function timingLabel(triggered: TriggeredRule[]): { label: string; tone: "good" | "warning" | "neutral" } {
  const cautionWords = ["bad", "avoid", "not", "caution", "wait"];
  const cautionHit = triggered.find(
    (r) => r.triggered && cautionWords.some((w) => r.rule.toLowerCase().includes(w) || r.guidance.toLowerCase().includes(w))
  );
  if (cautionHit) return { label: "Proceed with caution", tone: "warning" };
  if (triggered.some((r) => r.triggered)) return { label: "Favorable day", tone: "good" };
  return { label: "Neutral day", tone: "neutral" };
}
