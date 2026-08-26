# Orex OS -> Vercel  (Windows PowerShell)
#
#   Right-click this file -> "Run with PowerShell"
#   or:  powershell -ExecutionPolicy Bypass -File .\deploy.ps1
#
# Installs, builds, deploys, and sets the environment variables. Two moments
# need you: signing in to Vercel (a browser opens once) and creating the
# database (one click, which the script explains and waits for).

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Say($m, $c = "White") { Write-Host $m -ForegroundColor $c }
function Step($n, $m) { Write-Host ""; Write-Host "[$n] $m" -ForegroundColor Cyan }

# Runs the Vercel CLI. Kept in one place so the "npx --yes vercel@latest"
# incantation isn't repeated and can't drift between calls.
function Vercel { npx --yes vercel@latest @args }

Say ""
Say "  Orex OS  ->  Vercel" Green
Say "  ------------------------------------------------" DarkGray

# --- 0. Node ---------------------------------------------------------------
Step 0 "Checking Node.js"
try {
  $v = (node --version).TrimStart("v")
  Say "    Node $v"
  if ([int]($v.Split(".")[0]) -lt 20) {
    Say "    Node 20+ required. Install the LTS build from https://nodejs.org and re-run." Red
    Read-Host "Press Enter to close"; exit 1
  }
} catch {
  Say "    Node.js not found. Install the LTS build from https://nodejs.org, then re-run." Red
  Read-Host "Press Enter to close"; exit 1
}

# --- 1. Dependencies -------------------------------------------------------
Step 1 "Installing dependencies"
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Say "    npm install failed." Red; Read-Host "Press Enter to close"; exit 1 }

# --- 2. Local build --------------------------------------------------------
Step 2 "Building locally first"
Say "    So a broken build fails here, in 30 seconds, instead of on Vercel." DarkGray
npm run build
if ($LASTEXITCODE -ne 0) { Say "    Build failed. Nothing was deployed." Red; Read-Host "Press Enter to close"; exit 1 }
Say "    Build OK" Green

# --- 3. Signing secret -----------------------------------------------------
Step 3 "Signing secret"
# AUTH_SECRET signs session cookies AND encrypts every user's Notion token.
# Generated once and kept, because rotating it signs everyone out and makes
# every stored Notion connection undecryptable.
$secretFile = Join-Path $PSScriptRoot ".vercel-auth-secret.txt"
if (Test-Path $secretFile) {
  $authSecret = [System.IO.File]::ReadAllText($secretFile).Trim()
  Say "    Reusing the existing secret from .vercel-auth-secret.txt"
} else {
  $authSecret = node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))"
  [System.IO.File]::WriteAllText($secretFile, $authSecret)
  Say "    Generated and saved to .vercel-auth-secret.txt (gitignored - keep it)"
}

# --- 4. First deploy -------------------------------------------------------
Step 4 "Deploying"
Say "    A browser may open so you can sign in to Vercel - that's expected." DarkGray
Say "    Accept the defaults when asked (new project, name it 'orex-os')." DarkGray
Write-Host ""
Vercel deploy --yes
if ($LASTEXITCODE -ne 0) { Say "    Deploy failed." Red; Read-Host "Press Enter to close"; exit 1 }

# --- 5. Environment variables ----------------------------------------------
Step 5 "Setting AUTH_SECRET"
# Written to a temp file and fed in via cmd's redirect. Piping a PowerShell
# string into a native command adds a BOM and a trailing newline, both of
# which end up inside the secret - and a secret with invisible extra bytes
# fails in a way that looks like "login is just broken".
$tmp = [System.IO.Path]::GetTempFileName()
try {
  [System.IO.File]::WriteAllText($tmp, $authSecret, (New-Object System.Text.UTF8Encoding($false)))
  foreach ($envName in @("production", "preview")) {
    # Remove first so a re-run updates rather than erroring on "already exists".
    cmd /c "npx --yes vercel@latest env rm AUTH_SECRET $envName --yes" 2>&1 | Out-Null
    cmd /c "npx --yes vercel@latest env add AUTH_SECRET $envName < ""$tmp""" 2>&1 | Out-Null
    Say "    AUTH_SECRET -> $envName" DarkGray
  }
} finally {
  Remove-Item $tmp -ErrorAction SilentlyContinue
}

# --- 6. Database -----------------------------------------------------------
Step 6 "Database  (this one is not optional)"
Write-Host ""
Say "    Vercel's filesystem is read-only and wiped on every deploy." Yellow
Say "    With no database, each user's Notion connection is held in memory" Yellow
Say "    and disappears when the instance recycles. It fails silently." Yellow
Write-Host ""
Say "    In the Vercel dashboard for this project:" White
Say "       Storage  ->  Create Database  ->  Neon Postgres  ->  Connect" White
Write-Host ""
Say "    DATABASE_URL is then injected automatically. No migration to run -" DarkGray
Say "    the app creates its own table on first use." DarkGray
Write-Host ""
Read-Host "    Press Enter once that's connected (or now, to skip and do it later)"

# --- 7. Production ---------------------------------------------------------
Step 7 "Promoting to production"
Vercel deploy --prod --yes
if ($LASTEXITCODE -ne 0) { Say "    Production deploy failed." Red; Read-Host "Press Enter to close"; exit 1 }

Write-Host ""
Say "  ------------------------------------------------" DarkGray
Say "  Deployed." Green
Write-Host ""
Say "  Your login URL is the production URL printed just above." White
Say "  Open it, choose 'Create one', and make your account." White
Write-Host ""
Say "  Then check Settings -> Account. It must say:" White
Say "     Settings storage    Postgres        (not 'In memory')" DarkGray
Say "     Secret encryption   AES-256-GCM     (not 'Off')" DarkGray
Write-Host ""
Say "  If storage says 'In memory', the database isn't connected." Yellow
Say "  Do step 6 and re-run this script before anyone else signs up." Yellow
Write-Host ""
Read-Host "Press Enter to close"
