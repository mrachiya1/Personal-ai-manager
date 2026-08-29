import type { MetricCard } from "@/lib/dashboard";

/**
 * Six cards, one row, one shape.
 *
 * The company badges under each figure are the point: a studio number and an
 * agency number added together tell you the total and hide which one is
 * carrying it. Companies with nothing to contribute are left off rather than
 * shown as zero, so the badges stay scannable.
 */
export default function MetricGrid({
  cards,
  money,
}: {
  cards: (MetricCard & { manual?: boolean })[];
  money: (n: number, currency?: string) => string;
}) {
  return (
    <section className="metric-grid">
      {cards.map((card) => (
        <article
          className={`card metric-card${card.tone ? ` ${card.tone}` : ""}${card.manual ? " manual" : ""}`}
          key={card.key}
        >
          <span className="mx-label">
            {card.label}
            {card.manual && (
              <span className="manual-flag" title="Set from chat — not a calculation">
                manual
              </span>
            )}
          </span>
          <div className="mx-value">{card.display}</div>
          {card.splits.length > 0 && (
            <div className="mx-splits">
              {card.splits.slice(0, 3).map((s) => (
                <span className="mx-split" key={s.companyId}>
                  <span className="ms-name">{s.name}</span>
                  <span className="ms-val">
                    {card.splitFormat === "money" ? money(s.value, card.splitCurrency) : s.value}
                  </span>
                </span>
              ))}
            </div>
          )}
          {card.foot && <footer className="mx-foot">{card.foot}</footer>}
        </article>
      ))}
    </section>
  );
}
