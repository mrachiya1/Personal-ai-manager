"use client";

import { useId, useState } from "react";
import type { EntitySlice } from "@/lib/projectsAnalytics";

/**
 * Part-to-whole across the entities you run.
 *
 * A donut can only ever be read at a glance, so the numbers live in the
 * legend beside it rather than being implied by arc length — the ring answers
 * "roughly what share", the legend answers "how many". Capped at six
 * segments with the tail folded into "Other", because past that the slices
 * stop being distinguishable no matter what colours you pick.
 *
 * Colours come from the validated chart palette, not the UI accents: the
 * accent hues are tuned for text and fail the categorical checks as fills.
 * See qa/palette.mjs.
 */

const MAX_SLICES = 6;

export default function Donut({
  slices,
  total,
  unitSingular = "project",
  unitPlural = "projects",
}: {
  slices: EntitySlice[];
  total: number;
  unitSingular?: string;
  unitPlural?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const gradientId = useId();

  const shown =
    slices.length > MAX_SLICES
      ? [
          ...slices.slice(0, MAX_SLICES - 1),
          {
            key: "other",
            label: "Other",
            value: slices.slice(MAX_SLICES - 1).reduce((s, x) => s + x.value, 0),
          },
        ]
      : slices;

  if (!total || shown.length === 0) {
    return <div className="donut-empty">No projects yet</div>;
  }

  const R = 42;
  const CIRC = 2 * Math.PI * R;
  // A 2px gap between segments, expressed in path length. Adjacent fills need
  // a surface-coloured gap so two similar hues never touch.
  const GAP = 2.2;

  let offset = 0;
  const arcs = shown.map((slice, i) => {
    const share = slice.value / total;
    const len = Math.max(0, share * CIRC - GAP);
    const arc = { ...slice, share, len, offset, index: i };
    offset += share * CIRC;
    return arc;
  });

  const active = arcs.find((a) => a.key === hovered);

  return (
    <div className="donut-wrap">
      <div className="donut-figure">
        <svg viewBox="0 0 100 100" className="donut-svg" role="img" aria-label={`${total} ${total === 1 ? unitSingular : unitPlural} across ${shown.length} entities`}>
          <title id={gradientId}>Project distribution</title>
          <circle cx="50" cy="50" r={R} className="donut-track" />
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx="50"
              cy="50"
              r={R}
              className={`donut-arc s${arc.index}${hovered && hovered !== arc.key ? " dim" : ""}`}
              strokeDasharray={`${arc.len} ${CIRC - arc.len}`}
              strokeDashoffset={-arc.offset}
              role="presentation"
            />
          ))}
          {/* Transparent arcs twice the width of the visible ones, so the hit
              target is bigger than the mark. An 11px ring is a hard thing to
              land a pointer on, and impossible to reach with a keyboard
              without something focusable to reach. */}
          {arcs.map((arc) => (
            <circle
              key={`hit-${arc.key}`}
              cx="50"
              cy="50"
              r={R}
              className="donut-hit"
              strokeDasharray={`${arc.len} ${CIRC - arc.len}`}
              strokeDashoffset={-arc.offset}
              onMouseEnter={() => setHovered(arc.key)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(arc.key)}
              onBlur={() => setHovered(null)}
              tabIndex={0}
              role="img"
              aria-label={`${arc.label}: ${arc.value} of ${total}, ${Math.round(arc.share * 100)}%`}
            />
          ))}
        </svg>
        <div className="donut-centre">
          <span className="dc-value">{active ? active.value : total}</span>
          <span className="dc-label">
            {active ? `${Math.round(active.share * 100)}% ${active.label}` : total === 1 ? unitSingular : unitPlural}
          </span>
        </div>
      </div>

      {/* The legend is not optional: identity must never rest on colour alone,
          and a donut cannot be read to a number without it. */}
      <ul className="donut-legend">
        {arcs.map((arc) => (
          <li
            key={arc.key}
            className={hovered && hovered !== arc.key ? "dim" : undefined}
            onMouseEnter={() => setHovered(arc.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className={`dl-swatch s${arc.index}`} aria-hidden />
            <span className="dl-name">{arc.label}</span>
            <span className="dl-value">{arc.value}</span>
            <span className="dl-share">{Math.round(arc.share * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
