import type { PoolClient } from "pg";
import { pool } from "./pool";

export type Queryable = Pick<PoolClient, "query">;

/** Runs work in one transaction with the tenant set for RLS (app.current_tenant()). */
export async function withTenantTransaction<Result>(
  tenantId: string,
  work: (client: Queryable) => Promise<Result>,
): Promise<Result> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
