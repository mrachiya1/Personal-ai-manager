// Server-side Supabase client.
//
// This module is server-only. The service role key bypasses RLS, so it must
// never reach the browser. All Supabase calls from lib/accounts.ts go through
// here; nothing else in the app should import from @supabase/supabase-js directly.
//
// Lazy-initialised: a cold boot that is missing the env vars throws at the
// call site rather than crashing at import time with a useless stack.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Server-side Supabase client with the service role key.
 *
 * The service role key bypasses Row Level Security — NEVER expose it to the
 * browser, NEVER put it in a NEXT_PUBLIC_* variable, NEVER return it from an
 * API route.
 *
 * If either env var is missing you will get a clear error here rather than a
 * silent permission denied from Supabase later.
 */
export function supabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured.\n" +
        "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env.local.\n" +
        "Get the service role key from: Supabase dashboard → Settings → API → service_role"
    );
  }

  _client = createClient(url, key, {
    auth: { persistSession: false },
  });

  return _client;
}
