# Orex OS

Personal Life & Company OS — a real, working app (not a mockup) that reads
and writes your actual Notion workspace, computes numerology locally, can
pull live astrology transits, and has a working Claude-powered advisor chat.

## What's actually wired up

| Tab | Status |
|---|---|
| Today | Live — timing verdict, triggered rules, active projects, tasks due, overdue payments, recent energy, render queue, payments, ideas, learning, finance goals |
| Clients | Live — list + detail, billed/paid/outstanding computed from real Payments |
| Companies | Live — read from Notion |
| Projects | Live — read from Notion |
| Render Queue | Live — Projects filtered to Rendering-Ready, sorted by priority + deadline |
| Payments | Live — overdue / upcoming / paid, computed from Notion |
| Ideas Inbox | Live — quick-capture writes a new page to Notion; grouped by priority |
| Learning | Live — read from Notion |
| Finance & Goals | Live — goals + wishlist, read from Notion |
| Astro Lab | Numerology is live and local (no API). Transits are live *if* you connect an astrology API (optional) |
| Daily Logs | Live — quick-capture form writes to Notion; this is what feeds the advisor's "how you actually feel" context |
| Rules | Live — reads your Core Rules and shows which ones trigger today |
| Advisor Chat | Live — real Claude API calls, grounded in all of the above |
| Slip Inbox | Live — drag in many receipts/bank slips at once, AI reads each one, you confirm, they save to Notion Expenses in a batch |
| Settings | Live — per-user Notion connection, database mapping with a reachability test, AI keys, and export/delete of your stored settings |

Nothing here is mock data anymore — every tab reads your actual Notion
workspace once `.env.local` is filled in. `lib/mockData.ts` is still in the
repo as an unused reference/dev fixture, nothing imports it.

## Multi-user

The app can run two ways, and switches between them purely on what is in the
environment — there is no flag to set.

**Single-user (the default).** No auth variables set: no sign-in wall, one
implicit local user, everything read from `.env.local`. This is how the app
has always worked and how `npm run dev` behaves on a fresh clone.

**Multi-user.** Set `AUTH_SECRET` plus a Google and/or GitHub OAuth app, and
the app grows real logins. Each person signs in with a social account and
connects **their own** Notion workspace under Settings → Notion, pointing each
tab at databases in their own workspace. Their integration token is encrypted
(AES-256-GCM, keyed off `AUTH_SECRET`) before it is stored, and their AI key is
their own, so they're billed for their own usage rather than yours.

Where those per-user settings live is decided automatically:

- **Locally** — a SQLite file at `data/orex.db`, via Node 22's built-in
  `node:sqlite`. Nothing to install, no service to run.
- **In production** — Postgres, when `DATABASE_URL` is set. Required on Vercel,
  whose filesystem is read-only and ephemeral.

Sessions are JWTs, so logging in needs no database tables at all — the only
thing stored server-side is a small settings blob per user. Your projects,
clients and finances never leave your own Notion workspace.

## Deploying

See **[DEPLOY.md](./DEPLOY.md)** for the Vercel walkthrough, the environment
variable table, and the OAuth redirect URIs. The short version:

```bash
npx vercel && npx vercel --prod
```

…then connect a Neon Postgres from the Vercel dashboard so settings persist.

## Setup

```bash
npm install
cp .env.example .env.local   # already done for you — .env.local exists, just fill it in
```

Then fill in `.env.local`:

### 1. Notion (required for every tab except Astro Lab's numerology)

1. Go to **notion.so/my-integrations** → New integration → name it (e.g.
   "Orex OS") → pick your workspace → Submit.
2. Copy the **Internal Integration Secret** into `NOTION_API_KEY`.
3. In Notion, open the **"Personal ai assistant"** page → the ••• menu
   (top right) → **Connections** → add your new integration.
   This is the step people miss: without it, a valid API key still gets
   404s on every database under that page.

The 12 database IDs are already hardcoded as defaults in `lib/notion.ts`
(matching what's listed in `orex-os-build-status.md` in your Claude
project) — you only need env overrides if you recreate a database
elsewhere.

### 2. Anthropic (required for Advisor Chat)

1. Get a key at **console.anthropic.com/settings/keys** → `ANTHROPIC_API_KEY`.
2. Check the exact current model id at
   **docs.claude.com/en/docs/about-claude/models** and set `ANTHROPIC_MODEL`
   — the default in `.env.example` may be stale by the time you read this;
   model ids change over time and a wrong one 404s cleanly (the chat UI
   will show the error).

### 3. Astrology API (optional)

Astro Lab's numerology (Life Path / Personal Year / Personal Day) works
with zero API — it's pure local calculation. Live planetary transits need a
third-party API, since there isn't one universal standard. A few
budget-friendly options as of when this was built (verify current pricing
yourself before signing up):

- **astrology-api.io** — free tier ~50 requests/month, ~$11/mo for 1,000
- **AstrologyAPI.com** — free tier ~250 requests/month, ~$10/mo
- **Swiss Ephemeris**, self-hosted — free, but you run the calculation
  server yourself

Whichever you pick, set `ASTRO_API_KEY` and `ASTRO_API_BASE_URL` (and
`ASTRO_API_TRANSITS_PATH` if their docs use a different path than
`/transits/current`). `lib/astro.ts` does a best-effort mapping of the
response to a simple transit list — open that file and adjust the mapping
once you see your provider's real response shape; every provider's JSON
looks different.

Until you connect one, the Astro Lab page just shows an honest "not
connected" state instead of fake transit data.

### 4. Birth date (optional but recommended)

Set `BIRTH_DATE=YYYY-MM-DD` in `.env.local`. This feeds Life Path, Personal
Year, and Personal Day calculations everywhere they're used (Today's hero
card, Astro Lab, Rules). No API needed — it's plain arithmetic in
`lib/numerology.ts`.

## Running it

```bash
npm run dev
```

Open **http://localhost:3000**.

## How the "intelligence" actually works

- **Numerology & date logic** (`lib/numerology.ts`) — pure functions, no
  API, no AI. Life Path, Personal Year, Personal Day, odd/even day, weekday.
- **Rules engine** (`lib/rulesEngine.ts`) — reads your Core Rules from
  Notion (each has a `Condition` like `day_of_month % 2 == 0`) and evaluates
  it against today's numbers. This is what says "don't start a new company
  today" — a deterministic check against your own stated rule, not an AI
  guess.
- **Advisor Chat** (`app/api/chat/route.ts`) — the one place an LLM
  (Claude) is actually called. It's handed a compact text summary built by
  `lib/context.ts`: today's triggered rules, active projects, tasks due,
  overdue payments, and your last 5 daily logs (mood/energy/notes) — so
  when you ask "how am I doing," it's reasoning over your real recent data,
  not inventing an answer.

This matches the "only use AI for the parts that actually need judgment"
principle from the original plan — computation and rule-matching stay
local and free; Claude is only in the loop for the chat itself.

## Structure

- `lib/types.ts` — types mirroring the Notion schemas
- `lib/notion.ts` — all Notion reads/writes (plain `fetch`, no SDK — pinned
  to Notion-Version `2022-06-28` for stability)
- `lib/numerology.ts`, `lib/rulesEngine.ts`, `lib/astro.ts`, `lib/context.ts`
  — the local intelligence layer described above
- `app/*/page.tsx` — one folder per tab
- `app/api/*/route.ts` — chat, idea quick-capture, daily-log quick-capture
- `components/` — shared UI (Sidebar, ConnectPrompt, capture forms, Clients view)

## Known gaps / next steps

- **Client editing** doesn't write back to Notion yet — the button says so
  honestly rather than faking it. Wiring it up is the same pattern as
  `createIdea`/`createDailyLog` in `lib/notion.ts`, just for `PATCH
  /v1/pages/{id}`.
- **Companies/Projects/Learning/Finance/Wishlist** are read-only views —
  add/edit them in Notion directly for now, or extend the same
  quick-capture pattern used for Ideas and Daily Logs.
- **Astro API response mapping** is a best-effort guess (`lib/astro.ts`) —
  needs a real key to verify against, since I couldn't test it against a
  live provider from here.
- **Notion API calls are untested against a real integration token** from
  this environment (I don't have your credentials) — the request shapes
  follow Notion's documented API precisely, but if you hit an error on
  first run, check the browser console / terminal output, it'll show the
  real Notion error message (I built the error handling to surface these
  rather than swallow them).
- Deploy (Vercel is the natural fit) once you're happy with it locally.
