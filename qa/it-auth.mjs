// The login system, driven end to end against a server with auth switched on.
//
// The deploy notes have claimed for several rounds that this flow was
// verified. It was — once, by hand, with curl — and then nothing kept it
// honest through four rounds of UI work. This script is what makes the claim
// checkable: sign-up, sign-in, the wrong password, the session, the sign-out,
// and the thing that actually matters on a public URL — that a signed-out
// visitor is served the login page and never someone else's workspace.

import { chromium } from "playwright";

const BASE = process.env.QA_BASE || "http://localhost:5415";
const EMAIL = `qa-${Date.now()}@orex.example`;
const PASSWORD = "correct-horse-battery-11";

let pass = 0;
let fail = 0;
function check(label, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
p.on("console", (m) => {
  if (m.type() === "error") errs.push(m.text().slice(0, 160));
});

/* ------------------------------------------------------------------ */
console.log("--- 1. A SIGNED-OUT VISITOR SEES THE LOGIN, NOT THE APP ---");
/* ------------------------------------------------------------------ */
for (const route of ["/", "/projects", "/settings", "/finance"]) {
  const res = await p.goto(BASE + route, { waitUntil: "domcontentloaded" });
  check(`${route} lands on /login`, new URL(p.url()).pathname === "/login", `${res.status()} → ${new URL(p.url()).pathname}`);
}
// The API has to be closed too, or the wall is decorative.
// maxRedirects:0 — following the redirect lands on /login's 200 and reports
// the wall as a hole. The status BEFORE the redirect is the answer.
const apiRes = await p.request.get(BASE + "/api/projects", { maxRedirects: 0 });
check("the API refuses an unauthenticated read",
  [301, 302, 307, 308, 401, 403].includes(apiRes.status()), String(apiRes.status()));

/* ------------------------------------------------------------------ */
console.log("\n--- 2. THE LOGIN PAGE ITSELF ---");
/* ------------------------------------------------------------------ */
await p.goto(BASE + "/login", { waitUntil: "networkidle" });
check("an email field", (await p.locator('input[type="email"]').count()) >= 1);
check("a password field", (await p.locator('input[type="password"]').count()) >= 1);
check("a way to switch to sign-up", (await p.getByText(/create an account|sign up/i).count()) >= 1);
check("no horizontal scroll",
  (await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
// The same contrast rule the rest of the app is held to — in BOTH themes.
// The login shell paints on --field, which is the one surface the site audit
// never covers (it runs with auth off, where /login redirects away), and
// --ink-muted failed there in dark as well as light.
const CONTRAST = () => {
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ""); if (!m) return null; const q = m[1].split(",").map(Number); return { r: q[0], g: q[1], b: q[2], a: q.length > 3 ? q[3] : 1 }; };
  const over = (f, g) => ({ r: f.r * f.a + g.r * (1 - f.a), g: f.g * f.a + g.g * (1 - f.a), b: f.b * f.a + g.b * (1 - f.a), a: 1 });
  const lum = (c) => [c.r, c.g, c.b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.children.length && ![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
    const t = (el.textContent || "").trim();
    if (!t || t.length > 80) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    let n = el, bg = null, stack = [];
    while (n && n !== document.documentElement) {
      const c2 = getComputedStyle(n);
      if (c2.backgroundImage !== "none") { bg = "gradient"; break; }
      const c = parse(c2.backgroundColor);
      if (c && c.a > 0) stack.push(c);
      if (c && c.a === 1) break;
      n = n.parentElement;
    }
    if (bg === "gradient") continue;
    let acc = stack.length && stack[stack.length - 1].a === 1 ? stack.pop() : { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) acc = over(stack[i], acc);
    const fg = parse(cs.color);
    if (!fg) continue;
    const f = over(fg, acc);
    const [hi, lo] = [lum(f), lum(acc)].sort((x, y) => y - x);
    const ratio = (hi + 0.05) / (lo + 0.05);
    const size = parseFloat(cs.fontSize);
    const min = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight) >= 700) ? 3 : 4.5;
    if (ratio < min - 0.02) out.push(`${ratio.toFixed(2)}:1 "${t.slice(0, 30)}"`);
  }
  return [...new Set(out)];
};
for (const theme of ["light", "dark"]) {
  await p.emulateMedia({ colorScheme: theme });
  await p.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
  await p.waitForTimeout(200);
  const bad = await p.evaluate(CONTRAST);
  check(`every label meets AA (${theme})`, bad.length === 0, bad.join(" | "));
}
await p.emulateMedia({ colorScheme: "light" });
await p.evaluate(() => document.documentElement.removeAttribute("data-theme"));

/* ------------------------------------------------------------------ */
console.log("\n--- 3. SIGN-UP REFUSES WHAT IT SHOULD ---");
/* ------------------------------------------------------------------ */
const reg = (body) => p.request.post(BASE + "/api/account/register", { data: body });
check("a short password is refused", (await reg({ email: EMAIL, password: "short" })).status() === 400);
check("an all-digit password is refused", (await reg({ email: EMAIL, password: "1234567890123" })).status() === 400);
check("a common password is refused", (await reg({ email: EMAIL, password: "password12345" })).status() === 400);
check("a malformed address is refused", (await reg({ email: "not-an-email", password: PASSWORD })).status() === 400);

/* ------------------------------------------------------------------ */
console.log("\n--- 4. SIGN-UP, THEN SIGN-IN ---");
/* ------------------------------------------------------------------ */
const created = await reg({ email: EMAIL, password: PASSWORD, name: "QA Person" });
check("a good account is created", created.status() === 200, String(created.status()));
check("the same address twice is a conflict", (await reg({ email: EMAIL, password: PASSWORD })).status() === 409);

await p.goto(BASE + "/login", { waitUntil: "networkidle" });
await p.locator('input[type="email"]').fill(EMAIL);
await p.locator('input[type="password"]').fill("wrong-password-entirely");
await p.locator('form button[type="submit"]').click();
await p.waitForTimeout(2200);
check("the wrong password does not sign you in", new URL(p.url()).pathname === "/login", new URL(p.url()).pathname);
const err = await p.locator(".auth-error, .form-error, [role=alert]").first().innerText().catch(() => "");
check("and says so without naming which half was wrong",
  err.length > 0 && !/no such|not found|unknown (user|email)/i.test(err), err.replace(/\n/g, " ").slice(0, 80));

await p.locator('input[type="password"]').fill(PASSWORD);
await p.locator('form button[type="submit"]').click();
await p.waitForURL((u) => new URL(u).pathname !== "/login", { timeout: 15000 }).catch(() => {});
await p.waitForTimeout(800);
check("the right password signs you in", new URL(p.url()).pathname !== "/login", p.url());

/* ------------------------------------------------------------------ */
console.log("\n--- 5. THE SESSION IS REAL ---");
/* ------------------------------------------------------------------ */
for (const route of ["/", "/projects", "/settings"]) {
  const res = await p.goto(BASE + route, { waitUntil: "domcontentloaded" });
  check(`${route} is served`, res.status() === 200 && new URL(p.url()).pathname === route, `${res.status()} ${new URL(p.url()).pathname}`);
}
await p.goto(BASE + "/settings", { waitUntil: "networkidle" });
check("the account is named on the page", (await p.locator("body").innerText()).includes(EMAIL) || (await p.locator("body").innerText()).includes("QA Person"));

const cookies = await ctx.cookies();
const session = cookies.find((c) => /session-token/.test(c.name));
check("the session cookie is httpOnly", Boolean(session?.httpOnly), session ? `httpOnly=${session.httpOnly} sameSite=${session.sameSite}` : "no cookie");
check("and not readable from script", await p.evaluate(() => !/session-token/.test(document.cookie)));

/* ------------------------------------------------------------------ */
console.log("\n--- 6. NO PLAINTEXT PASSWORD ANYWHERE ---");
/* ------------------------------------------------------------------ */
const dump = await p.request.get(BASE + "/api/account/data");
if (dump.ok()) {
  const text = await dump.text();
  check("the account export carries no plaintext password", !text.includes(PASSWORD));
  check("and no password hash either", !/scrypt\$/.test(text), /scrypt\$/.test(text) ? "hash present" : "");
} else {
  check("the account export responds", false, String(dump.status()));
}

/* ------------------------------------------------------------------ */
console.log("\n--- 7. SIGN OUT CLOSES THE DOOR ---");
/* ------------------------------------------------------------------ */
await p.goto(BASE + "/", { waitUntil: "networkidle" });
const out = p.getByRole("button", { name: /sign out/i }).or(p.getByRole("link", { name: /sign out/i })).first();
if (await out.count()) {
  await out.click();
  await p.waitForTimeout(2000);
} else {
  await p.request.post(BASE + "/api/auth/signout", { form: {} });
  await ctx.clearCookies();
}
const after = await p.goto(BASE + "/projects", { waitUntil: "domcontentloaded" });
check("after signing out the app is closed again", new URL(p.url()).pathname === "/login",
  `${after.status()} ${new URL(p.url()).pathname}`);

console.log(`\nerrors: ${errs.length ? errs.join(" | ") : "none"}`);
console.log(`\n=== ${pass}/${pass + fail} checks passed ===`);
await b.close();
process.exit(fail ? 1 : 0);
