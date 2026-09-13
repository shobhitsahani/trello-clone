/** Supabase clients for backend — optional.
 *
 * When SUPABASE_URL + SERVICE_ROLE_KEY are set, `supabaseAdmin` can be used
 * for privileged operations (storage, auth admin, bypassing RLS where needed).
 * `supabaseAnon` is the public anon client. Both are lazy: null when env is
 * not configured, so local Docker Postgres continues to work unchanged.
 *
 * Prefer the existing drizzle `db` for most queries; use Supabase clients only
 * where Supabase-specific features are needed (e.g. Supabase Auth, Storage).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";

let _admin: SupabaseClient | null | undefined;
let _anon: SupabaseClient | null | undefined;

export function supabaseAdmin(): SupabaseClient | null {
  if (_admin !== undefined) return _admin;
  const { supabaseUrl, supabaseServiceRoleKey } = config();
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    _admin = null;
    return _admin;
  }
  _admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

export function supabaseAnon(): SupabaseClient | null {
  if (_anon !== undefined) return _anon;
  const { supabaseUrl, supabaseAnonKey } = config();
  if (!supabaseUrl || !supabaseAnonKey) {
    _anon = null;
    return _anon;
  }
  _anon = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _anon;
}

/** True when Supabase env is configured (at least URL + one key). */
export function isSupabaseConfigured(): boolean {
  const { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey } = config();
  return !!supabaseUrl && (!!supabaseAnonKey || !!supabaseServiceRoleKey);
}
