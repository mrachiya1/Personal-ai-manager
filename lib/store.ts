// A tiny, portable key/value store used to persist *per-user* configuration
// (their Notion credentials, database IDs and API keys) once the app has real
// logins instead of a single .env.local.
//
// Why a KV and not a full ORM: the actual application data lives in each
// user's own Notion workspace. The only thing this app has to remember about
// a user is a small JSON blob of settings. One table, one column of JSON, is
// genuinely all that's needed — and it keeps the app portable across the two
// very different places it runs:
//
//   * Locally (`npm run dev`)  -> SQLite file at data/orex.db, via Node 22's
//     built-in `node:sqlite`. No native module to compile, no service to run.
//   * On Vercel               -> Postgres, when DATABASE_URL / POSTGRES_URL is
//     set. Vercel's filesystem is read-only and ephemeral, so a SQLite file
//     there would silently lose every user's settings on the next deploy.
//   * Neither                 -> an in-memory map, so the app still boots (for
//     a preview build or a smoke test) while making it obvious in the logs
//     that nothing is being persisted.
//
// Auth itself deliberately does NOT use this store: sessions are JWTs (see
// auth.ts), which means logging in needs no database at all.

export interface KVStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  /** Every key beginning with `prefix`. Used by the admin/export paths. */
  keys(prefix?: string): Promise<string[]>;
  /** Which backend actually ended up being used — surfaced on the Settings page. */
  readonly backend: "postgres" | "sqlite" | "memory";
}

const POSTGRES_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";

/* ------------------------------------------------------------------ */
/* Postgres                                                            */
/* ------------------------------------------------------------------ */

function createPostgresStore(url: string): KVStore {
  // Imported lazily so a local SQLite install never has to load `pg` at all.
  let poolPromise: Promise<any> | null = null;

  async function pool() {
    if (!poolPromise) {
      poolPromise = (async () => {
        const { Pool } = await import("pg");
        const p = new Pool({
          connectionString: url,
          // Neon/Supabase/Vercel Postgres all terminate TLS at the pooler with
          // a certificate chain Node doesn't ship a root for. This is the
          // standard connection setting their own docs use.
          ssl: url.includes("localhost") || url.includes("127.0.0.1")
            ? undefined
            : { rejectUnauthorized: false },
          max: 3,
        });
        await p.query(
          `CREATE TABLE IF NOT EXISTS orex_kv (
             k TEXT PRIMARY KEY,
             v TEXT NOT NULL,
             updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
           )`
        );
        return p;
      })();
    }
    return poolPromise;
  }

  return {
    backend: "postgres",
    async get(key) {
      const p = await pool();
      const r = await p.query("SELECT v FROM orex_kv WHERE k = $1", [key]);
      return r.rows[0]?.v ?? null;
    },
    async set(key, value) {
      const p = await pool();
      await p.query(
        `INSERT INTO orex_kv (k, v, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`,
        [key, value]
      );
    },
    async del(key) {
      const p = await pool();
      await p.query("DELETE FROM orex_kv WHERE k = $1", [key]);
    },
    async keys(prefix = "") {
      const p = await pool();
      const r = await p.query("SELECT k FROM orex_kv WHERE k LIKE $1", [`${prefix}%`]);
      return r.rows.map((row: any) => row.k);
    },
  };
}

/* ------------------------------------------------------------------ */
/* SQLite (node:sqlite — built into Node 22, no native build step)     */
/* ------------------------------------------------------------------ */

function createSqliteStore(): KVStore | null {
  try {
    // `process.getBuiltinModule` reaches Node's real builtins directly, past
    // the bundler. A plain `require("node:sqlite")` gets rewritten during the
    // Next build and fails at runtime, which is what silently pushed this
    // store into the in-memory fallback the first time round.
    const getBuiltin = (process as NodeJS.Process & {
      getBuiltinModule?: (id: string) => unknown;
    }).getBuiltinModule;
    if (typeof getBuiltin !== "function") return null;

    const { DatabaseSync } = getBuiltin("node:sqlite") as { DatabaseSync: new (p: string) => any };
    const fs = getBuiltin("node:fs") as typeof import("fs");
    const path = getBuiltin("node:path") as typeof import("path");

    // Overridable so a test run can start from an empty store. Without it,
    // an isolation test passes on the second run purely because the accounts
    // it expects to create are already there from the first.
    const override = process.env["OREX_STORE_PATH"];
    let file: string;
    if (override) {
      fs.mkdirSync(path.dirname(override), { recursive: true });
      file = override;
    } else {
      const dir = path.join(process.cwd(), "data");
      fs.mkdirSync(dir, { recursive: true });
      file = path.join(dir, "orex.db");
    }
    const db = new DatabaseSync(file);
    db.exec(
      `CREATE TABLE IF NOT EXISTS orex_kv (
         k TEXT PRIMARY KEY,
         v TEXT NOT NULL,
         updated_at INTEGER NOT NULL
       )`
    );

    return {
      backend: "sqlite",
      async get(key) {
        const row = db.prepare("SELECT v FROM orex_kv WHERE k = ?").get(key) as any;
        return row?.v ?? null;
      },
      async set(key, value) {
        db.prepare(
          `INSERT INTO orex_kv (k, v, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`
        ).run(key, value, Date.now());
      },
      async del(key) {
        db.prepare("DELETE FROM orex_kv WHERE k = ?").run(key);
      },
      async keys(prefix = "") {
        const rows = db.prepare("SELECT k FROM orex_kv WHERE k LIKE ?").all(`${prefix}%`) as any[];
        return rows.map((r) => r.k);
      },
    };
  } catch (err) {
    // node:sqlite unavailable (older Node) or the filesystem is read-only.
    if (process.env.OREX_DEBUG_STORE) console.error("[orex/store] sqlite init failed:", err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Memory (last resort)                                                */
/* ------------------------------------------------------------------ */

function createMemoryStore(): KVStore {
  const map = new Map<string, string>();
  return {
    backend: "memory",
    async get(key) {
      return map.get(key) ?? null;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async del(key) {
      map.delete(key);
    },
    async keys(prefix = "") {
      return [...map.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

/* ------------------------------------------------------------------ */

let instance: KVStore | null = null;
let warned = false;

export function store(): KVStore {
  if (instance) return instance;

  if (POSTGRES_URL) {
    instance = createPostgresStore(POSTGRES_URL);
    return instance;
  }

  const sqlite = createSqliteStore();
  if (sqlite) {
    instance = sqlite;
    return instance;
  }

  if (!warned) {
    warned = true;
    console.warn(
      "[orex/store] No DATABASE_URL and no writable SQLite — per-user settings " +
        "are being kept in memory and will be lost on restart. Set DATABASE_URL " +
        "to a Postgres connection string in production."
    );
  }
  instance = createMemoryStore();
  return instance;
}

/** Convenience: read a JSON value, returning `fallback` if missing or corrupt. */
export async function getJSON<T>(key: string, fallback: T): Promise<T> {
  const raw = await store().get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function setJSON(key: string, value: unknown): Promise<void> {
  await store().set(key, JSON.stringify(value));
}
