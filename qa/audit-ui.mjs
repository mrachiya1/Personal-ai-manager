// A site-wide audit that measures the rendered page rather than reading the
// stylesheet.
//
// Three classes of defect, all of them found by computing what the browser
// actually painted:
//
//   1. CLIPPED OVERLAYS. The bug that made every status dropdown near a
//      section's edge unusable was an ancestor with overflow:hidden. This
//      finds every popover trigger whose ancestors would clip its panel, on
//      every route, before anyone clicks one.
//   2. CONTRAST, against the real background. A token pair list checks the
//      pairs someone remembered to list. This walks every text node and
//      composites its actual painted background, so a colour that drifted
//      out of the system shows up as a number rather than as an opinion.
//   3. SURFACE DRIFT. The same kind of container should be the same colour on
//      every page. This collects what each route actually used, so "the
//      colours don't match" becomes a list of which ones.
//
// Plus the usual: horizontal scrollbars, tap targets, and sub-10px type.

import { chromium } from "playwright";

const BASE = process.env.QA_BASE || "http://localhost:5414";
const ROUTES = (process.env.QA_ROUTES || "/,/projects,/clients,/companies,/payments,/finance,/team,/render-queue,/ideas,/learning,/daily-logs,/rules,/sleep,/astro-lab,/advisor,/settings,/finance/slips,/login").split(",");

const AUDIT = `(() => {
  const out = { clipped: [], contrast: [], surfaces: {}, overflow: [], tap: [], tiny: [] };

  const parse = (c) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(c || "");
    if (!m) return null;
    const p = m[1].split(",").map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = (c) =>
    [c.r, c.g, c.b]
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  /**
   * The colour actually painted behind an element, compositing every layer.
   *
   * Returns null when a gradient or image is in the stack: those cannot be
   * reduced to one colour, and guessing produces a confident wrong number.
   * The first version of this audit reported a 1.09:1 failure on the
   * workspace mark, which is white on a near-black gradient — it had read the
   * page behind the gradient. A false finding costs more than a missed one,
   * because someone acts on it.
   */
  function paintedBg(el) {
    let stack = [];
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) stack.push(c);
      if (c && c.a === 1) break;
      n = n.parentElement;
    }
    const root = parse(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    let acc = stack.length && stack[stack.length - 1].a === 1 ? stack.pop() : root;
    for (let i = stack.length - 1; i >= 0; i--) acc = over(stack[i], acc);
    return acc;
  }

  const seen = (arr, key, cap = 6) => {
    if (arr.some((x) => x.key === key)) return true;
    return arr.length >= cap;
  };

  /* ---- 1. overlay triggers whose ancestors would clip a panel ----
     Only meaningful for a panel that renders inside the trigger. Ours portal
     to <body>, so the ancestor heuristic reports .app-frame — which is doing
     real work rounding the window frame and clips nothing that matters. The
     audit therefore OPENS one and looks at where it landed, below, instead of
     inferring risk from the ancestor chain. */

  /* ---- 2. contrast of real text on its real background ---- */
  for (const el of document.querySelectorAll("body *")) {
    if (el.children.length && ![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
    const text = (el.textContent || "").trim();
    if (!text || text.length > 90) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) < 0.35) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight) || 400;
    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = paintedBg(el);
    if (!bg) continue;
    const c = ratio(over(fg, bg), bg);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const min = large ? 3 : 4.5;
    if (c < min - 0.02) {
      const key = (el.className || "").toString().split(" ").slice(0, 2).join(".") + "|" + text.slice(0, 24);
      if (!seen(out.contrast, key, 10))
        out.contrast.push({
          key, ratio: Math.round(c * 100) / 100, min, size,
          text: text.slice(0, 40), color: cs.color,
          on: "rgb(" + Math.round(bg.r) + ", " + Math.round(bg.g) + ", " + Math.round(bg.b) + ")",
        });
    }
    if (size < 10 && text.length > 1) {
      const key = (el.className || "").toString().split(" ")[0] + "|" + size;
      if (!seen(out.tiny, key, 6)) out.tiny.push({ key, size, text: text.slice(0, 30) });
    }
  }

  /* ---- 3. what surfaces this route actually painted ---- */
  /*
    Compare like with like, and compare the right property.

    The first ".badge" on a page is whatever status that page leads with, so
    sampling it measures the data rather than the design — ".badge.paid" is
    the same object everywhere. And for anything with a translucent fill the
    composite background legitimately differs by the card underneath it; the
    INK is what has to match. So badges and chips are compared on colour, and
    opaque surfaces on background.
  */
  for (const sel of [".card", "button.btn-primary", "input[type=text], input:not([type])"]) {
    const el = document.querySelector(sel);
    if (!el) continue;
    // The painted surface, not the element's own background: a text field is
    // often a transparent <input> inside a styled wrapper, and the colour a
    // person sees is the wrapper's.
    const bg = paintedBg(el);
    const shown = bg ? "rgb(" + Math.round(bg.r) + ", " + Math.round(bg.g) + ", " + Math.round(bg.b) + ")" : "gradient";
    out.surfaces[sel] = shown + " / " + getComputedStyle(el).color;
  }
  // Ink-only comparison for the tinted objects.
  for (const sel of [".badge.paid", ".badge.overdue", ".count-chip", ".prio"]) {
    const el = document.querySelector(sel);
    if (el) out.surfaces["ink " + sel] = getComputedStyle(el).color;
  }

  /* ---- 4. horizontal scroll ---- */
  out.pageOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  for (const el of document.querySelectorAll("*")) {
    const ox = getComputedStyle(el).overflowX;
    if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 2) {
      const key = el.tagName.toLowerCase() + "." + (el.className || "").toString().split(" ")[0];
      if (!seen(out.overflow, key)) out.overflow.push({ key, by: el.scrollWidth - el.clientWidth });
    }
  }

  /* ---- 5. tap targets ---- */
  for (const el of document.querySelectorAll("button, a, [role=button], input[type=checkbox]")) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    // The ::after hit-box trick means the painted size can be smaller than the
    // real target, so measure the pseudo-element's inset too.
    const after = getComputedStyle(el, "::after");
    const grow = after.content !== "none" && after.position === "absolute"
      ? Math.abs(parseFloat(after.top) || 0) + Math.abs(parseFloat(after.bottom) || 0)
      : 0;
    const h = r.height + grow * 2;
    const w = r.width + grow * 2;
    if (h < 24 || w < 24) {
      const key = el.tagName.toLowerCase() + "." + (el.className || "").toString().split(" ")[0];
      if (!seen(out.tap, key)) out.tap.push({ key, w: Math.round(w), h: Math.round(h), label: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24) });
    }
  }

  return out;
})()`;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const findings = { clipped: 0, contrast: 0, overflow: 0, tap: 0, tiny: 0 };
const surfaceIndex = {};

for (const theme of ["dark", "light"]) {
  console.log(`\n================ ${theme.toUpperCase()} ================`);
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, colorScheme: theme });
  const p = await ctx.newPage();
  for (const route of ROUTES) {
    const res = await p.goto(BASE + route, { waitUntil: "networkidle" }).catch(() => null);
    if (!res || res.status() >= 400) {
      console.log(`${route}  — status ${res ? res.status() : "no response"}`);
      continue;
    }
    // A redirect means we are measuring a different page than the one named,
    // and reporting it as covered is worse than reporting nothing. /login
    // redirects to / on this server because AUTH_SECRET is deliberately unset
    // here; qa/auth.sh is where that page is audited.
    const landed = new URL(p.url()).pathname;
    if (landed !== route) {
      console.log(`${route}  — skipped, redirected to ${landed}`);
      continue;
    }
    await p.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await p.waitForTimeout(300);
    const r = await p.evaluate(AUDIT);

    // Open the last picker on the page and check the panel escaped every
    // clipping ancestor and landed inside the viewport. This is the check
    // that would have caught the dropdown that opened into nothing.
    const picker = p.locator(".ed-cell.is-picker").last();
    if (await picker.count()) {
      await picker.scrollIntoViewIfNeeded().catch(() => {});
      await picker.click({ timeout: 3000 }).catch(() => {});
      await p.waitForTimeout(250);
      const panel = p.locator(".ed-pop").first();
      if (await panel.count()) {
        const info = await panel.evaluate((el) => {
          const b2 = el.getBoundingClientRect();
          let n = el.parentElement, clipped = null;
          while (n && n !== document.body) {
            const o = getComputedStyle(n).overflow;
            if (o.includes("hidden") || o.includes("clip")) { clipped = n.tagName.toLowerCase() + "." + (n.className || "").toString().split(" ")[0]; break; }
            n = n.parentElement;
          }
          return {
            parent: el.parentElement?.tagName,
            clipped,
            inView: b2.top >= -1 && b2.left >= -1 && b2.bottom <= innerHeight + 1 && b2.right <= innerWidth + 1,
            box: [Math.round(b2.x), Math.round(b2.y), Math.round(b2.width), Math.round(b2.height)],
          };
        });
        if (info.parent !== "BODY" || info.clipped || !info.inView) {
          findings.clipped += 1;
          r.clipped.push({ key: `OPENED PANEL: parent=${info.parent} clippedBy=${info.clipped || "none"} inView=${info.inView} ${info.box.join(",")}` });
        }
      } else {
        findings.clipped += 1;
        r.clipped.push({ key: "a picker was clicked and no panel appeared" });
      }
      await p.keyboard.press("Escape").catch(() => {});
      await p.waitForTimeout(120);
    }

    const bits = [];
    if (r.pageOverflow > 0) bits.push(`page overflows by ${r.pageOverflow}px`);
    if (r.overflow.length) { findings.overflow += r.overflow.length; bits.push(`x-scroll: ${r.overflow.map((o) => `${o.key}+${o.by}`).join(", ")}`); }
    if (r.clipped.length) { findings.clipped += r.clipped.length; bits.push(`overlay clipped by: ${r.clipped.map((c) => c.key).join(", ")}`); }
    if (r.contrast.length) { findings.contrast += r.contrast.length; }
    if (r.tap.length) findings.tap += r.tap.length;
    if (r.tiny.length) findings.tiny += r.tiny.length;

    console.log(`${route}${bits.length ? "  — " + bits.join(" · ") : ""}`);
    for (const c of r.contrast) console.log(`    contrast ${c.ratio}:1 (min ${c.min}) ${c.size}px  "${c.text}"  ${c.color} on ${c.on}  [${c.key.split("|")[0]}]`);
    for (const t of r.tap) console.log(`    tap ${t.w}x${t.h}  ${t.key}  "${t.label}"`);
    for (const t of r.tiny) console.log(`    ${t.size}px type  "${t.text}"`);

    for (const [k, v] of Object.entries(r.surfaces)) {
      const key = `${theme} ${k}`;
      (surfaceIndex[key] ||= {})[v] = [...((surfaceIndex[key] || {})[v] || []), route];
    }
  }
  await ctx.close();
}

console.log("\n================ SURFACE CONSISTENCY ================");
for (const [key, values] of Object.entries(surfaceIndex)) {
  const variants = Object.entries(values);
  if (variants.length > 1) {
    console.log(`MISMATCH  ${key} — ${variants.length} different values:`);
    for (const [v, routes] of variants) console.log(`    ${v}   ${routes.slice(0, 5).join(" ")}${routes.length > 5 ? " …" : ""}`);
  }
}

console.log("\n================ TOTALS ================");
console.log(findings);
await b.close();
process.exit(findings.clipped + findings.overflow + findings.contrast ? 1 : 0);
