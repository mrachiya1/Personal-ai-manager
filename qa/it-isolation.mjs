// Two accounts, two Notion workspaces, one server.
//
// The multi-user path has been written and type-checked for several rounds
// and never actually exercised — "each user connects their own Notion" is the
// kind of claim that is either true or a data breach, and there is no middle
// state. This drives it with real sessions and real cookies.
const BASE = process.env.QA_BASE || "http://localhost:5417";

const jars = new Map();
function jarFor(user) {
  if (!jars.has(user)) jars.set(user, new Map());
  return jars.get(user);
}
function cookieHeader(user) {
  return [...jarFor(user)].map(([k, v]) => `${k}=${v}`).join("; ");
}
function absorb(user, res) {
  const jar = jarFor(user);
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const i = pair.indexOf("=");
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    if (value === "" ) jar.delete(name); else jar.set(name, value);
  }
}
async function call(user, path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    redirect: "manual",
    headers: { ...(init.headers || {}), cookie: cookieHeader(user) },
  });
  absorb(user, res);
  return res;
}

async function signUp(user, email, password) {
  const reg = await call(user, "/api/account/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: user }),
  });
  const regBody = await reg.text();
  if (!reg.ok && !/already/i.test(regBody)) throw new Error(`register ${user}: ${reg.status} ${regBody.slice(0, 200)}`);

  // next-auth's credentials callback: fetch a CSRF token, then post the form.
  const csrfRes = await call(user, "/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  const res = await call(user, "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password, csrfToken, callbackUrl: BASE + "/" }).toString(),
  });
  const session = await (await call(user, "/api/auth/session")).json();
  return { status: res.status, email: session?.user?.email ?? null };
}

async function connect(user, token, databases) {
  const c = await call(user, "/api/notion/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!c.ok) throw new Error(`connect ${user}: ${c.status} ${(await c.text()).slice(0, 200)}`);
  const d = await call(user, "/api/notion/databases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ databases }),
  });
  if (!d.ok) throw new Error(`map ${user}: ${d.status} ${(await d.text()).slice(0, 200)}`);
}

const A_IDS = Object.fromEntries(
  [["companies","01"],["coreRules","02"],["projects","03"],["tasks","04"],["clients","05"],["payments","06"],
   ["ideas","07"],["learning","08"],["financeGoals","09"],["wishlist","10"],["astroEvents","11"],
   ["dailyLogs","12"],["sleepLogs","13"],["team","14"],["expenses","15"],["accounts","16"],["income","17"]]
    .map(([k, n]) => [k, "0".repeat(30) + n])
);
const B_IDS = Object.fromEntries(Object.keys(A_IDS).map((k, i) => [k, "bbbb" + "b".repeat(26) + String(i + 1).padStart(2, "0")]));
B_IDS.projects = "bbbb" + "b".repeat(26) + "03";
B_IDS.companies = "bbbb" + "b".repeat(26) + "01";

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

console.log("--- SIGN UP TWO ACCOUNTS ---");
const a = await signUp("alice", "alice@qa.test", "correct-horse-battery-1");
const b = await signUp("bob", "bob@qa.test", "correct-horse-battery-2");
console.log(`  alice session: ${a.email} · bob session: ${b.email}`);
check("two distinct sessions exist", a.email === "alice@qa.test" && b.email === "bob@qa.test", `${a.email} / ${b.email}`);

console.log("\n--- EACH CONNECTS THEIR OWN NOTION ---");
await connect("alice", "ntn_alice_token_aaaaaaaaaaaaaaaa", A_IDS);
await connect("bob", "ntn_bob_token_bbbbbbbbbbbbbbbbbb", B_IDS);
console.log("  both connected");

console.log("\n--- WHAT EACH ONE SEES ON /projects ---");
const aPage = await (await call("alice", "/projects")).text();
const bPage = await (await call("bob", "/projects")).text();
const aSeesOwn = aPage.includes("Northwind");
const bSeesOwn = bPage.includes("TENANT-B-SEALED-PROJECT");
console.log(`  alice page ${aPage.length}b · bob page ${bPage.length}b`);
check("alice sees her own workspace", aSeesOwn, aSeesOwn ? "Northwind present" : "her projects missing");
check("bob sees his own workspace", bSeesOwn, bSeesOwn ? "sealed project present" : "his project missing");
check("alice CANNOT see bob's project", !aPage.includes("TENANT-B-SEALED"), "");
check("bob CANNOT see alice's projects", !bPage.includes("Northwind"), "");
check("bob CANNOT see alice's companies", !bPage.includes("Orex Studio"), "");

console.log("\n--- CONFIG AND SECRETS ---");
const aMap = await (await call("alice", "/api/notion/databases")).json();
const bMap = await (await call("bob", "/api/notion/databases")).json();
const aProjects = aMap.databases.find((d) => d.key === "projects")?.id;
const bProjects = bMap.databases.find((d) => d.key === "projects")?.id;
console.log(`  alice projects db: ${aProjects}`);
console.log(`  bob   projects db: ${bProjects}`);
check("database mappings are separate", aProjects !== bProjects && String(bProjects).startsWith("bbbb"), "");

const aExport = await (await call("alice", "/api/account/data")).text();
check("alice's export contains no plaintext token", !/ntn_alice_token/.test(aExport), "");
check("alice's export contains nothing of bob's", !/bob@qa\.test|ntn_bob_token/.test(aExport), "");

console.log("\n--- SIGNED OUT ---");
const anon = await fetch(BASE + "/projects", { redirect: "manual" });
check("an anonymous request is not served the app", anon.status >= 300 && anon.status < 400, `status ${anon.status}`);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED: " + failed.map((f) => f.name).join(", "));
  process.exit(1);
}
