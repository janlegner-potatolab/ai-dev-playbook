import pg from "pg";

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

// Module-level on purpose: one pool per process, shared by all requests (S12 exception).
export const pool = new pg.Pool({ connectionString: requireDatabaseUrl() });
