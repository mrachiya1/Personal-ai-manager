// A stand-in Notion API for UI work: serves realistically-shaped records so
// every screen can be rendered and reviewed without touching a real workspace.
// Point the app at it with NOTION_API_BASE_URL. Not shipped.

import http from "node:http";

const PORT = Number(process.argv[2] || 5300);
const TODAY = new Date("2026-08-26T12:00:00Z");
const day = (n) => new Date(TODAY.getTime() + n * 86400000).toISOString().slice(0, 10);
const iso = (n) => new Date(TODAY.getTime() + n * 86400000).toISOString();

/* ---------- Notion property builders ---------- */
const T = (v) => ({ title: [{ plain_text: v, text: { content: v } }] });
const R = (v) => ({ rich_text: v ? [{ plain_text: v, text: { content: v } }] : [] });
const S = (v) => ({ select: v ? { name: v } : null });
const M = (v = []) => ({ multi_select: v.map((n) => ({ name: n })) });
const N = (v) => ({ number: v ?? null });
const C = (v) => ({ checkbox: Boolean(v) });
const D = (v) => ({ date: v ? { start: v } : null });
const E = (v) => ({ email: v ?? null });
const P = (v) => ({ phone_number: v ?? null });
const L = (ids = []) => ({ relation: ids.map((id) => ({ id })) });
const FILES = (names = []) => ({
  files: names.map((n) => ({ name: n, type: "file", file: { url: `https://example.invalid/${encodeURIComponent(n)}` } })),
});

const page = (id, props, edited = -1) => ({
  object: "page",
  id,
  last_edited_time: iso(edited),
  created_time: iso(-30),
  properties: props,
});

/* ---------- Fixtures ---------- */
const co = { orex: "co-orex", studio: "co-studio", labs: "co-labs" };
const cl = { north: "cl-north", lumen: "cl-lumen", vero: "cl-vero", atlas: "cl-atlas" };
const tm = { dinesh: "tm-dinesh", aisha: "tm-aisha", marco: "tm-marco", nadia: "tm-nadia", sam: "tm-sam" };
const pr = {
  solo: "00000000000000000000000000000090", film: "pr-film", pack: "pr-pack", explain: "pr-explain", onboard: "pr-onboard", reel: "pr-reel", vero: "pr-vero", atlas: "pr-atlas" };
const ac = { bank: "ac-bank", wise: "ac-wise", cash: "ac-cash" };

const F = {
  companies: [
    page(co.orex, { Name: T("Orex"), Type: S("SaaS"), "Start Date": D(day(-420)), Goals: R("Reach 40 paying teams by Q4."), Description: R("Product studio building the internal tooling suite."), "Monthly Revenue Target": N(850000), "Plan / To-Dos": R("Ship billing. Hire a second engineer.") }),
    page(co.studio, { Name: T("Orex Studio"), Type: S("Studio"), "Start Date": D(day(-900)), Goals: R("Two brand films a quarter."), Description: R("Motion and 3D for brand clients."), "Monthly Revenue Target": N(1200000), "Plan / To-Dos": R("Refresh the showreel.") }),
    page(co.labs, { Name: T("Orex Labs"), Type: S("R&D"), "Start Date": D(-120), Goals: R("One shipped experiment per month."), Description: R("Early experiments."), "Monthly Revenue Target": N(0), "Plan / To-Dos": R("") }),
  ],
  clients: [
    page(cl.north, { Name: T("Northwind Retail"), Email: E("ops@northwind.example"), Phone: P("+94 71 555 0134"), Country: R("Sri Lanka"), Company: L([co.studio]), Relationship: S("VIP"), "Preferred Contact": R("WhatsApp"), Notes: R("Pays fast. Prefers Friday reviews.") }),
    page(cl.lumen, { Name: T("Lumen Health"), Email: E("hello@lumen.example"), Phone: P("+1 415 555 0199"), Country: R("United States"), Company: L([co.orex]), Relationship: S("Active"), "Preferred Contact": R("Email"), Notes: R("Compliance review adds two weeks to everything.") }),
    page(cl.vero, { Name: T("Vero Logistics"), Email: E("finance@vero.example"), Country: R("Singapore"), Company: L([co.orex]), Relationship: S("Active"), "Preferred Contact": R("Email"), Notes: R("") }),
    page(cl.atlas, { Name: T("Atlas Foods"), Email: E("mark@atlasfoods.example"), Country: R("United Kingdom"), Company: L([co.studio]), Relationship: S("Lead"), "Preferred Contact": R("Call"), Notes: R("Intro call went well; waiting on budget.") }),
  ],
  team: [
    page(tm.dinesh, { Name: T("Dinesh Perera"), Role: R("3D Lead"), Company: L([co.studio]), Email: E("dinesh@orex.example"), Phone: P("+94 77 555 0111"), Status: S("Active"), Notes: R("") }),
    page(tm.aisha, { Name: T("Aisha Rahman"), Role: R("Motion Designer"), Company: L([co.studio]), Email: E("aisha@orex.example"), Status: S("Active"), Notes: R("") }),
    page(tm.marco, { Name: T("Marco Silva"), Role: R("Producer"), Company: L([co.orex]), Email: E("marco@orex.example"), Status: S("Active"), Notes: R("") }),
    page(tm.nadia, { Name: T("Nadia Khan"), Role: R("QA"), Company: L([co.orex]), Email: E("nadia@orex.example"), Status: S("Active"), Notes: R("") }),
    page(tm.sam, { Name: T("Sam Oyelaran"), Role: R("Editor"), Company: L([co.studio]), Status: S("Inactive"), Notes: R("On sabbatical until November.") }),
  ],
  projects: [
    page(pr.film, { Name: T("Northwind — Brand Relaunch Film"), Company: L([co.studio]), Client: L([cl.north]), Category: M(["3D", "Motion"]), Status: S("Production"), Description: R("Full CG hero film plus three cutdowns for the autumn campaign."), Deadline: D(day(-2)), "Render Priority": S("High"), "Estimated Render Time (hrs)": N(46), "Assigned To": L([tm.dinesh, tm.aisha, tm.marco]), "Start Date": D(day(-56)), Value: N(480000), Headline: R("90-second hero film for the autumn campaign"), "Client Requests": R("Wants an extra 6-second vertical cut for TikTok, and the logo sting slowed down."), "Last Reviewed": D(day(-4)), "Reviewed By": L([tm.marco]), "Staging URL": { url: "https://staging.northwind.example" }, Invoiced: C(true), Files: FILES(["Northwind brief v3.pdf", "Signed SOW.pdf", "Board refs.zip"]) }, -0.05),
    page(pr.pack, { Name: T("Northwind — Packaging Renders"), Company: L([co.studio]), Client: L([cl.north]), Category: M(["3D"]), Status: S("Rendering-Ready"), Description: R("42 SKU renders for the new range."), Deadline: D(day(2)), "Render Priority": S("Medium"), "Estimated Render Time (hrs)": N(18), "Assigned To": L([tm.dinesh]), "Start Date": D(day(-21)), Value: N(165000), Headline: R("42 SKU renders for the new range"), "Client Requests": R(""), "Last Reviewed": D(null), "Reviewed By": L([]), "Staging URL": { url: "" }, Invoiced: C(false), Files: FILES(["SKU list.xlsx"]) }, -1),
    page(pr.explain, { Name: T("Lumen — Product Explainer"), Company: L([co.orex]), Client: L([cl.lumen]), Category: M(["Motion", "Web"]), Status: S("Planning"), Description: R("Explainer for the clinician dashboard."), Deadline: D(day(23)), "Render Priority": S("Low"), "Estimated Render Time (hrs)": N(9), "Assigned To": L([tm.aisha, tm.nadia]), "Start Date": D(day(-6)), Value: N(92000), Headline: R("Explainer for the clinician dashboard"), "Client Requests": R("Legal need to approve every on-screen claim before animation."), "Last Reviewed": D(day(-7)), "Reviewed By": L([tm.nadia]), "Staging URL": { url: "" }, Invoiced: C(false), Files: FILES(["Clinician script.docx", "Legal notes.pdf"]) }, -5),
    page(pr.onboard, { Name: T("Lumen — Onboarding Loop"), Company: L([co.orex]), Client: L([cl.lumen]), Category: M(["Motion"]), Status: S("Idea"), Description: R(""), Deadline: D(day(37)), "Render Priority": S("Low"), "Assigned To": L([]), Value: N(40000), Headline: R(""), "Client Requests": R(""), "Reviewed By": L([]) }, -12),
    page(pr.reel, { Name: T("Studio Reel 2026"), Company: L([co.studio]), Client: L([]), Category: M(["3D", "Motion", "Web"]), Status: S("Production"), Description: R("Annual showreel, internal."), Deadline: D(day(4)), "Render Priority": S("Medium"), "Estimated Render Time (hrs)": N(30), "Assigned To": L([tm.dinesh, tm.aisha, tm.marco, tm.nadia]), "Start Date": D(day(-16)), Value: N(0), Headline: R("Internal — annual showreel"), "Client Requests": R(""), "Reviewed By": L([]) }, -2),
    page(pr.vero, { Name: T("Vero — Fleet Dashboard Motion Kit"), Company: L([co.orex]), Client: L([cl.vero]), Category: M(["Motion"]), Status: S("Delivered"), Description: R("Twelve UI motion components."), Deadline: D(day(-40)), "Render Priority": S("Low"), "Assigned To": L([tm.aisha]), "Start Date": D(day(-95)), Value: N(210000), Headline: R("Twelve UI motion components, delivered"), "Last Reviewed": D(day(-38)), "Reviewed By": L([tm.marco]) }, -38),
    /* No company AND no client — the only thing that is actually personal.
       Every other project here belongs to a company, which is what the
       sections used to get wrong: filing them all as "Personal · internal
       R&D" because none of them had a client attached. */
    page(pr.solo, { Name: T("Learning Houdini — personal"), Company: L([]), Client: L([]), Category: M(["3D"]), Status: S("Planning"), Description: R("Self-directed, no client, no company."), Deadline: D(day(30)), "Render Priority": S("Low"), "Assigned To": L([]), "Start Date": D(day(-3)), Value: N(0), Headline: R("Evenings and weekends"), "Client Requests": R(""), "Reviewed By": L([]) }, -3),
    page(pr.atlas, { Name: T("Atlas Foods — Pitch Concept"), Company: L([co.studio]), Client: L([cl.atlas]), Category: M(["3D"]), Status: S("Idea"), Description: R("Speculative concept for the pitch."), Deadline: D(day(11)), "Render Priority": S("High"), "Assigned To": L([tm.dinesh]), "Start Date": D(day(-1)), Value: N(0), Headline: R("Speculative — pitch is on the 12th"), "Client Requests": R("Asked to see two directions, not one."), "Reviewed By": L([]) }, -0.3),
  ],
  tasks: [
    /* --- pr.film: four levels deep, the spec's own example shape ---------
       Showreel -> Shot 01 Animation -> Lighting & Shading -> Turntable pass.
       Deliberately lopsided: one milestone holds a deep branch and a shallow
       one, which is the case where counting immediate children instead of
       leaves gives the wrong percentage. */
    page("tk1", { Title: T("Storyboard approved"), Project: L([pr.film]), Status: S("Done"), "Due Date": D(day(-40)), Tags: M(["Creative"]),
      "Parent Task": L([]), "Start Date": D(day(-46)), Priority: S("Normal"), "Assigned To": L([tm.dinesh]), Thumbnail: { files: [] }, Files: { files: [] } }),
    page("tk2", { Title: T("Previz pass"), Project: L([pr.film]), Status: S("Done"), "Due Date": D(day(-24)), Tags: M([]),
      "Parent Task": L([]), "Start Date": D(day(-34)), Priority: S("Normal"), "Assigned To": L([]), Thumbnail: { files: [] }, Files: { files: [] } }),
    page("tk3", { Title: T("Shot 01 Animation"), Project: L([pr.film]), Status: S("In Progress"), "Due Date": D(day(1)), Tags: M(["3D"]),
      "Parent Task": L([]), "Start Date": D(day(-6)), Priority: S("High"), "Assigned To": L([tm.dinesh, tm.aisha]), Thumbnail: { files: [] }, Files: { files: [] } }),
    page("tk3a", { Title: T("Animation Planning"), Project: L([pr.film]), Status: S("Done"), "Due Date": D(day(-4)), Tags: M([]),
      "Parent Task": L(["tk3"]), "Start Date": D(day(-6)), Priority: S("Normal"), "Assigned To": L([tm.dinesh]), Thumbnail: { files: [] }, Files: { files: [] } }),
    page("tk3b", { Title: T("3D Modeling"), Project: L([pr.film]), Status: S("Done"), "Due Date": D(day(-2)), Tags: M([]),
      "Parent Task": L(["tk3"]), "Start Date": D(day(-4)), Priority: S("Normal"), "Assigned To": L([tm.aisha]), Thumbnail: { files: [] }, Files: { files: [] } }),
    page("tk3c", { Title: T("Lighting & Shading"), Project: L([pr.film]), Status: S("In Progress"), "Due Date": D(day(1)), Tags: M([]),
      "Parent Task": L(["tk3"]), "Start Date": D(day(-1)), Priority: S("Urgent"), "Assigned To": L([tm.aisha]), Thumbnail: { files: [] },
      Files: { files: [{ name: "Lighting ref", type: "external", external: { url: "https://figma.com/file/lighting/Ref" } }] } }),
    page("tk3c1", { Title: T("Key light pass"), Project: L([pr.film]), Status: S("Done"), "Due Date": D(day(0)), Tags: M([]),
      "Parent Task": L(["tk3c"]), "Start Date": D(day(-1)), Priority: S("Normal"), "Assigned To": L([]), Thumbnail: { files: [] }, Files: { files: [] } }),
    page("tk3c2", { Title: T("Turntable pass"), Project: L([pr.film]), Status: S("Backlog"), "Due Date": D(day(1)), Tags: M([]),
      "Parent Task": L(["tk3c"]), "Start Date": D(day(0)), Priority: S("High"), "Assigned To": L([]), Thumbnail: { files: [] }, Files: { files: [] } }),
    page("tk3d", { Title: T("Final Render"), Project: L([pr.film]), Status: S("Backlog"), "Due Date": D(day(3)), Tags: M(["3D"]),
      "Parent Task": L(["tk3"]), "Start Date": D(day(2)), Priority: S("High"), "Assigned To": L([]), Thumbnail: { files: [] }, Files: { files: [] } }),
    page("tk4", { Title: T("Final render + grade"), Project: L([pr.film]), Status: S("Blocked"), "Due Date": D(day(3)), Tags: M(["3D"]),
      "Parent Task": L([]), "Start Date": D(day(2)), Priority: S("High"), "Assigned To": L([]), Thumbnail: { files: [] }, Files: { files: [] } }),

    /* --- pr.pack: one milestone away from auto-completing ---------------
       Ticking "Turntable renders" is the check that a parent completes itself
       when its last child is done. */
    page("tk5", { Title: T("Asset build"), Project: L([pr.pack]), Status: S("In Progress"), "Due Date": D(day(0)), Tags: M([]),
      "Parent Task": L([]), "Start Date": D(day(-12)), Priority: S("Normal"), "Assigned To": L([]), Thumbnail: { files: [] }, Files: { files: [] } }),
    page("tk5a", { Title: T("Model 42 SKUs"), Project: L([pr.pack]), Status: S("Done"), "Due Date": D(day(-8)), Tags: M([]),
      "Parent Task": L(["tk5"]), "Start Date": D(day(-12)), Priority: S("Normal"), "Assigned To": L([]), Thumbnail: { files: [] }, Files: { files: [] } }),
    page("tk6", { Title: T("Turntable renders"), Project: L([pr.pack]), Status: S("In Progress"), "Due Date": D(day(0)), Tags: M([]),
      "Parent Task": L(["tk5"]), "Start Date": D(day(-3)), Priority: S("Normal"), "Assigned To": L([]), Thumbnail: { files: [] }, Files: { files: [] } }),

    page("tk7", { Title: T("Script sign-off"), Project: L([pr.explain]), Status: S("Done"), "Due Date": D(day(-3)), Tags: M(["Client"]),
      "Parent Task": L([]), "Start Date": D(day(-10)), Priority: S("Normal"), "Assigned To": L([]), Thumbnail: { files: [] }, Files: { files: [] } }),
    page("tk8", { Title: T("Design frames"), Project: L([pr.explain]), Status: S("Backlog"), "Due Date": D(day(9)), Tags: M([]),
      "Parent Task": L([]), "Start Date": D(day(4)), Priority: S("Low"), "Assigned To": L([]), Thumbnail: { files: [] }, Files: { files: [] } }),
    page("tk9", { Title: T("Cut selects"), Project: L([pr.reel]), Status: S("In Progress"), "Due Date": D(day(0)), Tags: M([]),
      "Parent Task": L([]), "Start Date": D(day(-2)), Priority: S("Normal"), "Assigned To": L([]), Thumbnail: { files: [] }, Files: { files: [] } }),
    /* A parent that does not exist. Nothing stops someone deleting a task in
       Notion while its children point at it, and an orphan that renders
       nowhere is a task the owner has silently lost. */
    page("tk9x", { Title: T("Orphaned grade pass"), Project: L([pr.reel]), Status: S("Backlog"), "Due Date": D(day(2)), Tags: M([]),
      "Parent Task": L(["tk-does-not-exist"]), "Start Date": D(day(1)), Priority: S("Normal"), "Assigned To": L([]), Thumbnail: { files: [] }, Files: { files: [] } }),
    page("tk10", { Title: T("Two concept directions"), Project: L([pr.atlas]), Status: S("Backlog"), "Due Date": D(day(6)), Tags: M(["Creative"]),
      "Parent Task": L([]), "Start Date": D(day(2)), Priority: S("Normal"), "Assigned To": L([]), Thumbnail: { files: [] }, Files: { files: [] } }),
  ],
  payments: [
    page("pay1", { Label: T("Northwind — film, 50% deposit"), Client: L([cl.north]), Project: L([pr.film]), Amount: N(240000), "Due Date": D(day(-19)), "Paid Date": D(day(-17)), Status: S("Paid"), "Linked Income": L(["inc1"]) }),
    page("pay2", { Label: T("Northwind — film, balance"), Client: L([cl.north]), Project: L([pr.film]), Amount: N(240000), "Due Date": D(day(-5)), Status: S("Overdue"), "Linked Income": L([]) }),
    page("pay3", { Label: T("Lumen — explainer, deposit"), Client: L([cl.lumen]), Project: L([pr.explain]), Amount: N(46000), "Due Date": D(day(6)), Status: S("Pending"), "Linked Income": L([]) }),
    page("pay4", { Label: T("Vero — motion kit, final"), Client: L([cl.vero]), Project: L([pr.vero]), Amount: N(210000), "Due Date": D(day(-35)), "Paid Date": D(day(-33)), Status: S("Paid"), "Linked Income": L(["inc2"]) }),
    page("pay5", { Label: T("Northwind — packaging"), Client: L([cl.north]), Project: L([pr.pack]), Amount: N(165000), "Due Date": D(day(14)), Status: S("Pending"), "Linked Income": L([]) }),
  ],
  accounts: [
    page(ac.bank, { Name: T("Commercial Bank — Current"), Type: S("Bank"), Balance: N(1284500), Currency: R("LKR"), Institution: R("Commercial Bank"), "Last Updated": D(day(-1)), Notes: R("") }),
    page(ac.wise, { Name: T("Wise USD"), Type: S("Bank"), Balance: N(4820), Currency: R("USD"), Institution: R("Wise"), "Last Updated": D(day(-3)), Notes: R("Client payments from abroad land here.") }),
    page(ac.cash, { Name: T("Petty Cash"), Type: S("Cash"), Balance: N(38000), Currency: R("LKR"), Institution: R(""), "Last Updated": D(day(-6)), Notes: R("") }),
  ],
  expenses: [
    page("ex1", { Name: T("Adobe Creative Cloud"), Category: S("Subscription"), Amount: N(18500), Currency: S("LKR"), Vendor: R("Adobe"), Date: D(day(-2)), Recurring: C(true), Company: L([co.studio]), Account: L([ac.bank]), Notes: R("Ref INV-9931 · Card") }),
    page("ex2", { Name: T("Render farm — August"), Category: S("Software"), Amount: N(64200), Currency: S("LKR"), Vendor: R("GarageFarm"), Date: D(day(-4)), Recurring: C(false), Company: L([co.studio]), Account: L([ac.bank]), Notes: R("") }),
    page("ex3", { Name: T("Office rent"), Category: S("Rent"), Amount: N(145000), Currency: S("LKR"), Vendor: R("Kandy Holdings"), Date: D(day(-9)), Recurring: C(true), Company: L([co.orex]), Account: L([ac.bank]), Notes: R("") }),
    page("ex4", { Name: T("Fuel"), Category: S("Fuel"), Amount: N(9800), Currency: S("LKR"), Vendor: R("Ceypetco"), Date: D(day(-1)), Recurring: C(false), Company: L([]), Account: L([ac.cash]), Notes: R("") }),
    page("ex5", { Name: T("Freelance editor — reel"), Category: S("Salary"), Amount: N(85000), Currency: S("LKR"), Vendor: R("S. Oyelaran"), Date: D(day(-11)), Recurring: C(false), Company: L([co.studio]), Account: L([ac.bank]), Notes: R("") }),
    page("ex6", { Name: T("Domain renewals"), Category: S("Other"), Amount: N(12400), Currency: S("LKR"), Vendor: R("Namecheap"), Date: D(day(-18)), Recurring: C(true), Company: L([co.orex]), Account: L([ac.wise]), Notes: R("") }),
  ],
  income: [
    page("inc1", { Name: T("Northwind — film deposit"), Source: S("Client Payment"), Amount: N(240000), Currency: R("LKR"), Date: D(day(-17)), Recurring: C(false), Company: L([co.studio]), Account: L([ac.bank]), Notes: R(""), "Linked Payment": L(["pay1"]) }),
    page("inc2", { Name: T("Vero — motion kit final"), Source: S("Client Payment"), Amount: N(210000), Currency: R("LKR"), Date: D(day(-33)), Recurring: C(false), Company: L([co.orex]), Account: L([ac.bank]), Notes: R(""), "Linked Payment": L(["pay4"]) }),
    page("inc3", { Name: T("Retainer — Lumen"), Source: S("Client Payment"), Amount: N(120000), Currency: R("LKR"), Date: D(day(-6)), Recurring: C(true), Company: L([co.orex]), Account: L([ac.bank]), Notes: R(""), "Linked Payment": L([]) }),
  ],
  financeGoals: [
    page("fg1", { Goal: T("Six-month runway"), Type: S("Company"), "Target Amount": N(3000000), "Current Amount": N(1840000), Deadline: D(day(120)), "Linked Company": L([co.orex]), "Linked Account": L([ac.bank]), "Linked Project": L([]) }),
    page("fg2", { Goal: T("New render workstation"), Type: S("Personal"), "Target Amount": N(950000), "Current Amount": N(410000), Deadline: D(day(75)), "Linked Company": L([]), "Linked Account": L([ac.wise]), "Linked Project": L([]) }),
  ],
  wishlist: [
    page("w1", { Item: T("Colour-accurate reference monitor"), Category: R("Studio"), "Estimated Cost": N(420000), Priority: S("Medium") }),
    page("w2", { Item: T("Second render node"), Category: R("Studio"), "Estimated Cost": N(680000), Priority: S("High") }),
  ],
  ideas: [
    page("id1", { Idea: T("Template pack for SaaS explainer intros"), Description: R("Sell the rig we keep rebuilding."), Tags: M(["Product", "Revenue"]), "Linked Company": L([co.orex]), "Linked Project": L([]), Priority: S("High") }),
    page("id2", { Idea: T("Monthly client render digest"), Description: R("One email a month showing what we shipped."), Tags: M(["Marketing"]), "Linked Company": L([co.studio]), "Linked Project": L([]), Priority: S("Medium") }),
    page("id3", { Idea: T("Batch slip scanning for the accountant"), Description: R(""), Tags: M(["Ops"]), "Linked Company": L([]), "Linked Project": L([]), Priority: S("Low") }),
  ],
  learning: [
    page("ln1", { Topic: T("Houdini pyro"), Description: R("For the Atlas pitch."), Resources: R("Entagma series; SideFX masterclass"), Progress: S("In Progress"), "Session Notes": R("Sparse solver settings still confusing."), Completion: N(35), "Target Date": D(day(21)) }),
    page("ln2", { Topic: T("Notion API"), Description: R("For the internal tooling."), Resources: R("developers.notion.com"), Progress: S("Completed"), "Session Notes": R("") }),
    // No Completion column on this one on purpose — it exercises the
    // fallback where all we honestly know is the status.
    page("ln3", { Topic: T("Procedural shading"), Description: R("Substance to Karma."), Resources: R(""), Progress: S("In Progress"), "Session Notes": R("") }),
    page("ln4", { Topic: T("SMC"), Description: R("Smart money concepts."), Resources: R(""), Progress: S("In Progress"), "Session Notes": R(""), Completion: N(72), "Target Date": D(day(-4)) }),
  ],
  dailyLogs: [
    page("dl1", { "Log Date": D(day(-1)), "Mood Score": N(7), "Energy Level": S("High"), Notes: R("Good focus block in the morning. Render queue cleared."), "AI Daily Plan": R("") }),
    page("dl2", { "Log Date": D(day(-2)), "Mood Score": N(5), "Energy Level": S("Medium"), Notes: R("Late night on the film; slow start."), "AI Daily Plan": R("") }),
    page("dl3", { "Log Date": D(day(-3)), "Mood Score": N(6), "Energy Level": S("Medium"), Notes: R(""), "AI Daily Plan": R("") }),
  ],
  sleepLogs: [
    page("sl1", { Name: T("Sleep"), "Sleep Time": D(day(-1)), "Wake Time": D(day(0)), "Duration (hrs)": N(6.5), Notes: R("") }),
    page("sl2", { Name: T("Sleep"), "Sleep Time": D(day(-2)), "Wake Time": D(day(-1)), "Duration (hrs)": N(7.2), Notes: R("") }),
  ],
  coreRules: [
    page("cr1", { Rule: T("Days divisible by 2 are bad for starting new companies"), Category: S("Numerology"), Condition: R("day_of_month % 2 == 0"), Guidance: R("Plan and prepare, but sign nothing new."), Active: C(true), "Applies To": L([co.orex]) }),
    page("cr2", { Rule: T("No client calls inside Rahu Kalam"), Category: S("Astro"), Condition: R("inside_rahu_kalam"), Guidance: R("Move the call, or make it internal."), Active: C(true), "Applies To": L([]) }),
    page("cr3", { Rule: T("Late renders follow late nights"), Category: S("Personal Pattern"), Condition: R("slept_after_1am"), Guidance: R("Do not schedule a final render pass today."), Active: C(true), "Applies To": L([]) }),
  ],
  astroEvents: [
    page("ae1", { Name: T("Mercury direct"), "Event Date": D(day(5)), "Key Transits": R("Mercury stations direct in Leo"), "AI Interpretation": R("Contracts stuck since the 10th tend to move again.") }),
  ],
};

/* ---------- Database id -> fixture key ---------- */
const ENV_KEYS = {
  NOTION_COMPANIES_DB: "companies", NOTION_CORE_RULES_DB: "coreRules", NOTION_PROJECTS_DB: "projects",
  NOTION_TASKS_DB: "tasks", NOTION_CLIENTS_DB: "clients", NOTION_PAYMENTS_DB: "payments",
  NOTION_IDEAS_DB: "ideas", NOTION_LEARNING_DB: "learning", NOTION_FINANCE_GOALS_DB: "financeGoals",
  NOTION_WISHLIST_DB: "wishlist", NOTION_ASTRO_EVENTS_DB: "astroEvents", NOTION_DAILY_LOGS_DB: "dailyLogs",
  NOTION_SLEEP_LOGS_DB: "sleepLogs", NOTION_TEAM_DB: "team", NOTION_EXPENSES_DB: "expenses",
  NOTION_ACCOUNTS_DB: "accounts", NOTION_INCOME_DB: "income",
};
const byId = new Map();
for (const [env, key] of Object.entries(ENV_KEYS)) {
  const id = process.env[env];
  if (id) byId.set(id.replace(/-/g, "").toLowerCase(), key);
}

// A second, completely separate workspace, for the isolation test. Its ids are
// in their own space (bbbb…) and its only content is one uniquely-named
// project — so "user B can see user A's data" and "user A can see user B's"
// are both checkable by a plain string search of the rendered page.
const TENANT_B = {
  projects: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb03",
  companies: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb01",
};
const TENANT_B_FIXTURES = {
  [TENANT_B.projects]: [
    page("b-pr1", {
      Name: T("TENANT-B-SEALED-PROJECT"),
      Company: L(["b-co1"]),
      Category: M(["Internal"]),
      Status: S("Production"),
      Description: R("Only user B may ever see this."),
      Deadline: D(day(5)),
      "Render Priority": S("High"),
      "Estimated Render Time (hrs)": N(1),
      Client: L([]), "Assigned To": L([]), "Start Date": D(day(-5)), Value: N(1),
      Headline: R("Isolation canary"), "Client Requests": R(""), "Last Reviewed": D(null),
      "Reviewed By": L([]), "Staging URL": { url: "" }, Invoiced: C(false), Files: { files: [] },
    }),
  ],
  [TENANT_B.companies]: [
    page("b-co1", {
      Name: T("TENANT-B-COMPANY"), Type: S("Studio"), "Start Date": D(day(-100)),
      Goals: R(""), Description: R(""), "Monthly Revenue Target": N(1), Plan: R(""),
    }),
  ],
};

let createdCount = 0;
const allPages = () => Object.values(F).flat();

/**
 * Turns what the app WRITES into what Notion RETURNS.
 *
 * Notion's write shape for text is `{title:[{text:{content}}]}` and its read
 * shape is `{title:[{plain_text}]}`. Storing a created page verbatim therefore
 * produced a row with a blank name on the next read — the record existed, the
 * title didn't, and a test looking for the task by name saw nothing at all.
 */
function normalise(properties = {}) {
  const out = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value && Array.isArray(value.title)) {
      out[key] = { title: value.title.map((t) => ({ ...t, plain_text: t.plain_text ?? t.text?.content ?? "" })) };
    } else if (value && Array.isArray(value.rich_text)) {
      out[key] = { rich_text: value.rich_text.map((t) => ({ ...t, plain_text: t.plain_text ?? t.text?.content ?? "" })) };
    } else {
      out[key] = value;
    }
  }
  return out;
}

const send = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const path = url.pathname;
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (path === "/users/me") return send(res, 200, { id: "bot", name: "QA Bot", bot: { workspace_name: "QA Workspace" } });

      console.log(`${req.method} ${path}`);
      const q = path.match(/^\/databases\/([^/]+)\/query$/);
      if (q) {
        const raw = q[1].replace(/-/g, "").toLowerCase();
        // Tenant B's own space. Anything else in that space is legitimately
        // empty, which is exactly what a fresh workspace looks like.
        if (raw.startsWith("bbbb")) {
          return send(res, 200, { object: "list", results: TENANT_B_FIXTURES[raw] ?? [], has_more: false, next_cursor: null });
        }
        const key = byId.get(raw);
        return send(res, 200, { object: "list", results: key ? F[key] : [], has_more: false, next_cursor: null });
      }

      const dbGet = path.match(/^\/databases\/([^/]+)$/);
      if (dbGet && req.method === "GET") {
        const key = byId.get(dbGet[1].replace(/-/g, "").toLowerCase());
        const sample = key && F[key][0];
        const properties = {};
        if (sample) {
          for (const [k, v] of Object.entries(sample.properties)) {
            properties[k] = { type: Object.keys(v)[0] };
          }
        }
        return send(res, 200, { object: "database", id: dbGet[1], title: [{ plain_text: key || "Unknown" }], properties });
      }
      if (dbGet && req.method === "PATCH") return send(res, 200, { object: "database", id: dbGet[1] });

      // Writes persist for the life of the process.
      //
      // They used to be acknowledged and thrown away, which quietly limited
      // what any test could prove: a created sub-task vanished on the next
      // router.refresh(), and a rollup that auto-completes a parent could only
      // be checked by trusting the response rather than by re-reading the row.
      // A tree is a data structure whose whole behaviour is in how the parts
      // refer to each other, so the stand-in has to remember them.
      if (path === "/pages" && req.method === "POST") {
        let payload = {};
        try {
          payload = JSON.parse(body || "{}");
        } catch {}
        const dbRaw = String(payload?.parent?.database_id || "").replace(/-/g, "").toLowerCase();
        const key = byId.get(dbRaw);
        const created = page(`new-${++createdCount}`, normalise(payload.properties || {}), 0);
        if (key) F[key].push(created);
        return send(res, 200, created);
      }

      const pageOp = path.match(/^\/pages\/([^/]+)$/);
      if (pageOp) {
        const id = pageOp[1];
        const found = allPages().find((pg) => pg.id === id);
        if (req.method === "PATCH") {
          let payload = {};
          try {
            payload = JSON.parse(body || "{}");
          } catch {}
          if (found) {
            if (payload.archived) {
              for (const list of Object.values(F)) {
                const at = list.indexOf(found);
                if (at >= 0) list.splice(at, 1);
              }
            } else {
              Object.assign(found.properties, normalise(payload.properties || {}));
              found.last_edited_time = new Date().toISOString();
            }
          }
          return send(res, 200, found || { object: "page", id });
        }
        return send(res, 200, found || { object: "page", id, properties: {} });
      }

      // Stand-in for api.sunrise-sunset.org, so the hora/panchang engine has
      // real numbers to chew on in QA. Colombo-ish times, held constant so a
      // screenshot taken today matches one taken next week.
      if (path === "/json") {
        const date = (url.searchParams.get("date") || "2026-08-27");
        return send(res, 200, {
          status: "OK",
          results: {
            sunrise: `${date}T00:37:00+00:00`,
            sunset: `${date}T12:52:00+00:00`,
          },
        });
      }

      send(res, 404, { object: "error", message: `stand-in Notion has no route for ${req.method} ${path}` });
    });
  })
  .listen(PORT, () => console.log(`stand-in Notion on :${PORT} · ${byId.size} databases mapped`));
