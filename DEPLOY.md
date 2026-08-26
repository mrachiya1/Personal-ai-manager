# Deploying Orex OS to Vercel

The app is Vercel-ready as-is: every route is server-rendered on demand, nothing
is pre-rendered at build time, and no route needs a writable filesystem.

## The fastest path (Windows)

Right-click **`deploy.ps1`** → *Run with PowerShell*.

It installs dependencies, builds locally first (so a broken build fails on your
machine rather than on Vercel), generates the signing secret, deploys, sets the
environment variables, and walks you through the one dashboard click. Two moments
need you: signing in to Vercel when the browser opens, and creating the database.

On macOS/Linux, or if you prefer doing it by hand, the same thing in four commands:

```bash
npm install
npm run build
npx vercel deploy --yes          # sign in when the browser opens
npx vercel deploy --prod --yes
```

Then set `AUTH_SECRET` and connect a database, per the two sections below.

---

## 1. `AUTH_SECRET` — required

```bash
openssl rand -base64 32          # or: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set it under **Settings → Environment Variables** (`deploy.ps1` does this for you).

This single variable does two jobs: it signs session cookies, and it is the key
that encrypts every user's stored Notion token. Two consequences worth knowing:

- **Without it there is no login at all.** The app falls back to single-user mode,
  where every visitor shares one settings bucket — so whoever connects Notion
  first exposes their workspace to the next visitor. Never put the app on a public
  URL without this set.
- **Don't rotate it casually.** Changing it signs everyone out *and* makes every
  stored Notion token undecryptable, so all users have to reconnect.

## 2. `DATABASE_URL` — required in production

**Storage → Create Database → Neon Postgres → Connect to project.**

Vercel injects `DATABASE_URL` automatically. The app creates its own single table
(`orex_kv`) on first use — there is no migration to run. Redeploy afterwards so
the new variable is picked up.

Skipping this doesn't produce an error; it produces something worse — an app that
appears to work and quietly forgets every user's settings whenever the serverless
instance recycles. Locally this is a non-issue (a SQLite file at `data/orex.db` is
used automatically), which is exactly why it's easy to miss.

## 3. Everything else — optional

| Variable | Turns on | Notes |
|---|---|---|
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | "Continue with Google" | Redirect URI: `https://YOUR-DOMAIN/api/auth/callback/google` |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | "Continue with GitHub" | Callback URL: `https://YOUR-DOMAIN/api/auth/callback/github` |
| `AUTH_ALLOWED_EMAILS` | Restricting who may sign up | Comma-separated. Unset = open to anyone |
| `AUTH_DISABLE_SIGNUP=true` | Invite-only | Existing accounts still sign in; no new ones |
| `AUTH_DISABLE_PASSWORD=true` | Social-login-only | Only set this once an OAuth provider is configured |
| `OPENROUTER_API_KEY` | A shared AI key for everyone | Optional — each user can paste their own under Settings → AI and be billed separately |
| `NOTION_API_KEY` | A shared Notion workspace | **Leave unset in production.** Setting it points every signed-in user at *your* workspace until they connect their own |
| `NOTION_*_DB` | Default database mapping | Also leave unset in production — these are one workspace's IDs, and each user maps their own from Settings |

---

## How people sign up

Email + password works with no setup at all — that is the point of it. A visitor
opens the URL, lands on the sign-in card, chooses **Create one**, and has an
isolated account immediately.

Passwords are hashed with scrypt (memory-hard, from Node's standard library) with
a per-account salt. Sign-in attempts are throttled per address, and every failure
returns the same response whether the address exists or not, so the form can't be
used to discover who has an account.

Google and GitHub are additive: set their keys whenever you get round to creating
the OAuth apps, and the buttons appear above the password form. Someone who signed
up with a password and later uses Google with the same address lands on the same
account and the same Notion connection.

### Restricting access

Two levers, depending on what you want:

- **Invite-only:** `AUTH_DISABLE_SIGNUP=true`. Nobody new can register; you create
  accounts by temporarily unsetting it, or by using the allow-list below.
- **Specific people:** `AUTH_ALLOWED_EMAILS=you@example.com,colleague@example.com`.
  Anyone else is refused at sign-up *and* at sign-in, whichever method they use.

## 4. OAuth redirect URIs

Vercel gives you a `*.vercel.app` domain on the first deploy. That host must appear
in each provider's allowed redirects:

- **Google** — console.cloud.google.com → APIs & Services → Credentials → your
  OAuth client → Authorised redirect URIs → `https://YOUR-DOMAIN/api/auth/callback/google`
- **GitHub** — github.com/settings/developers → your OAuth App → Authorization
  callback URL → `https://YOUR-DOMAIN/api/auth/callback/github`

Add the URI for **every** domain you use, including a custom domain later. A
mismatch here is the most common cause of "sign-in didn't complete".

## 5. Optional: one-click "Connect Notion"

Out of the box each user connects Notion by pasting their own integration token —
no registration needed from you. To offer a one-click button instead, create a
**public** integration at notion.so/my-integrations and set:

```
NOTION_OAUTH_CLIENT_ID=
NOTION_OAUTH_CLIENT_SECRET=
NOTION_OAUTH_REDIRECT_URI=https://YOUR-DOMAIN/api/notion/oauth?step=callback
```

Paste that exact redirect URI into the integration's *OAuth Domain & URIs* section
too. The button appears on Settings → Notion automatically once all three exist.

---

## After deploying — a two-minute check

1. Open the URL. You should land on `/login`. Create an account.
2. **Settings → Account** must show:
   - *Settings storage* → **Postgres** (not "In memory — not persisted")
   - *Secret encryption* → **AES-256-GCM** (not "Off — set AUTH_SECRET")

   If either is wrong, fix it before anyone else signs up.
3. **Settings → Notion** — paste an integration token, press Connect.
4. **Map databases**, then press **Test connection**. Every row should come back
   reachable. A 404 means the database exists but hasn't been shared with your
   integration in Notion (••• → Connections) — the single most common setup
   mistake.
5. Open **Slip Inbox** and drop a receipt in to confirm the vision model works
   (needs an OpenRouter key under Settings → AI).

## What each user's account actually holds

Only the connection settings: their encrypted Notion token, their database
mapping, their API keys, and a few preferences. Projects, clients, finances and
slips all live in **their own Notion workspace** and are never copied into this
app's database. Settings → Account exports that settings file (secrets masked) or
deletes it outright, and deleting it never touches their Notion.
