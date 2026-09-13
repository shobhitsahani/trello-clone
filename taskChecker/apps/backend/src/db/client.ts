/** Postgres client + drizzle instance. postgres-js connects lazily, so the
 * server boots even when the DB is down; endpoints surface 503 until it returns.
 *
 * Supabase: set DATABASE_URL to the Supabase pooler string
 *   postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true
 * (or the direct 5432 URL). The client auto-enables ssl=require when the URL
 * contains supabase.co, which Supabase requires. See .env.example.
 */
import { config } from "../config.js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

// The app connects as a NON-superuser role so RLS is enforced (superusers bypass
// row-level security). See docker-compose.yml + migrations. On Supabase the
// pooler/service_role bypasses RLS, but tenant scoping is still enforced in
// application queries (tenant_id filters).
const dbUrl = config().databaseUrl;
const isSupabase = dbUrl.includes("supabase.co") || !!config().supabaseUrl;

export const sql = postgres(dbUrl, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: isSupabase ? 10 : 5,
  prepare: false, // required when using drizzle with postgres-js
  ssl: isSupabase ? "require" : false,
});

export const db = drizzle(sql, { schema });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];