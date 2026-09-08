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
  webhookRetries: number;
  logLevel: string;
}

function need(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT ?? 6002),
    nodeEnv: process.env.NODE_ENV ?? "development",
    // App connects as the NON-superuser RLS-scoped role (docker/init.sql);
    // migrations/provisioning run as the bootstrap superuser instead.
    databaseUrl: need("DATABASE_URL", "postgres://teamflow:teamflow@localhost:5432/teamflow"),
    migrateDatabaseUrl: need("DATABASE_MIGRATE_URL", "postgres://postgres:postgres@localhost:5432/teamflow"),
    databaseReplicaUrl: process.env.DATABASE_REPLICA_URL,
    redisUrl: need("REDIS_URL", "redis://localhost:6379"),
    jwtSecret: need("JWT_SECRET", "dev-only-change-me-at-least-32-chars-with-randomness"),
    accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
    uploadBackend: (process.env.UPLOAD_BACKEND as "memory" | "s3") ?? "memory",
    s3Endpoint: process.env.S3_ENDPOINT,
    s3Bucket: process.env.S3_BUCKET ?? "teamflow-attachments",
    s3AccessKey: process.env.S3_ACCESS_KEY,
    s3SecretKey: process.env.S3_SECRET_KEY,
    s3Region: process.env.S3_REGION ?? "us-east-1",
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:6002",
    webhookRetries: Number(process.env.WORKER_WEBHOOK_RETRIES ?? 10),
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}

/** Lazy singleton so importing the module never hard-fails (tests, healthz). */
let _config: Config | undefined;
export function config(): Config {
  _config ??= loadConfig();
  return _config;
}