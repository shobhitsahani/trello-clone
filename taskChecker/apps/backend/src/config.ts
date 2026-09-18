/**
 * App-environment config — reads process.env with dev-friendly defaults.
 * Never logs secrets.
 */
export interface Config {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  /** Migrations run as the bootstrap superuser: tables + SECURITY DEFINER
   * lookups must be owned by a role RLS cannot constrain (the app role is
   * NOSUPERUSER so RLS applies to it). */
  migrateDatabaseUrl: string;
  databaseReplicaUrl?: string;
  redisUrl: string;
  jwtSecret: string;
  accessTokenTtl: string;
  uploadBackend: "memory" | "s3";
  s3Endpoint?: string;
  s3Bucket?: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
  s3Region?: string;
  publicBaseUrl: string;
  /** Absolute URL of the web app — invite links point here, not at the API. */
  frontendBaseUrl: string;
  /** Deadline sweep cadence (ms) — how often overdue tasks move to backlog. */
  deadlineSweepMs: number;
  webhookRetries: number;
  logLevel: string;
  /** Supabase — optional. When set, the backend can use the Supabase
   * client (service_role / anon) and the Postgres pooler as DATABASE_URL. */
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
}

function need(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function configured(name: string, alias: string, fallback: string): string {
  const value = process.env[name];
  if (value && value !== `process.env.${alias}`) return value;
  return need(alias, fallback);
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT ?? 4002),
    nodeEnv: process.env.NODE_ENV ?? "development",
    // v0 project variables may be referenced through an indirection such as
    // process.env.DATABASE_URL_4; resolve that alias before connecting.
    databaseUrl: configured("DATABASE_URL", "DATABASE_URL_4", "postgres://teamflow:teamflow@localhost:5432/teamflow"),
    migrateDatabaseUrl: configured("DATABASE_MIGRATE_URL", "DATABASE_URL_4", "postgres://postgres:postgres@localhost:5432/teamflow"),
    databaseReplicaUrl: process.env.DATABASE_REPLICA_URL,
    redisUrl: need("REDIS_URL", "redis://localhost:6379"),
    jwtSecret: configured("JWT_SECRET", "JWT_SECRET_4", "dev-only-change-me-at-least-32-chars-with-randomness"),
    accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
    uploadBackend: (process.env.UPLOAD_BACKEND as "memory" | "s3") ?? "memory",
    s3Endpoint: process.env.S3_ENDPOINT,
    s3Bucket: process.env.S3_BUCKET ?? "teamflow-attachments",
    s3AccessKey: process.env.S3_ACCESS_KEY,
    s3SecretKey: process.env.S3_SECRET_KEY,
    s3Region: process.env.S3_REGION ?? "us-east-1",
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:4002",
    frontendBaseUrl: (process.env.FRONTEND_BASE_URL ?? "http://localhost:4000").replace(/\/+$/, ""),
    deadlineSweepMs: Number(process.env.DEADLINE_SWEEP_MS ?? 5 * 60 * 1000),
    webhookRetries: Number(process.env.WORKER_WEBHOOK_RETRIES ?? 10),
    logLevel: process.env.LOG_LEVEL ?? "info",
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

/** Lazy singleton so importing the module never hard-fails (tests, healthz). */
let _config: Config | undefined;
export function config(): Config {
  _config ??= loadConfig();
  return _config;
}
