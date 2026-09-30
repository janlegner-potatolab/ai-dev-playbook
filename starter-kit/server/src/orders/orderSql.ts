import type { Order, OrderStatus } from "../../../packages/contracts/src/index";
import { withTenantTransaction, type Queryable } from "../db/transaction";
import type { NewOrderRow, OrderStore, StoredIdempotentOrder } from "./orderActions";
import type { OrderCursor, OrderListSource } from "./orderReadModels";

type OrderRow = {
  id: string;
  customer_name: string;
  total_cents: number;
  status: OrderStatus;
  created_at: Date;
  confirmed_at: Date | null;
  request_hash: string;
};

const ORDER_COLUMNS =
  "id, customer_name, total_cents, status, created_at, confirmed_at, request_hash";

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    customerName: row.customer_name,
    totalCents: row.total_cents,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    confirmedAt: row.confirmed_at ? row.confirmed_at.toISOString() : null,
  };
}

async function selectByKey(db: Queryable, tenantId: string, key: string) {
  const result = await db.query<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE tenant_id = $1 AND idempotency_key = $2`,
    [tenantId, key],
  );
  const row = result.rows[0];
  return row ? { order: toOrder(row), requestHash: row.request_hash } : undefined;
}

async function insertOnce(db: Queryable, tenantId: string, row: NewOrderRow) {
  const result = await db.query<OrderRow>(
    `INSERT INTO orders (tenant_id, customer_name, total_cents, idempotency_key, request_hash)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
     RETURNING ${ORDER_COLUMNS}`,
    [tenantId, row.customerName, row.totalCents, row.idempotencyKey, row.requestHash],
  );
  const inserted = result.rows[0];
  return inserted ? toOrder(inserted) : undefined;
}

async function transition(
  db: Queryable,
  tenantId: string,
  orderId: string,
  from: OrderStatus[],
  to: OrderStatus,
) {
  const result = await db.query<OrderRow>(
    `UPDATE orders SET status = $4, confirmed_at = now()
     WHERE tenant_id = $1 AND id = $2 AND status = ANY($3::text[])
     RETURNING ${ORDER_COLUMNS}`,
    [tenantId, orderId, from, to],
  );
  const updated = result.rows[0];
  return updated ? toOrder(updated) : undefined;
}

async function listPage(
  db: Queryable,
  tenantId: string,
  after: OrderCursor | undefined,
  take: number,
) {
  const result = await db.query<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders
     WHERE tenant_id = $1
       AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, $3::uuid))
     ORDER BY created_at DESC, id DESC
     LIMIT $4`,
    [tenantId, after?.createdAt ?? null, after?.id ?? null, take],
  );
  return result.rows.map(toOrder);
}

export function createOrderSql(): OrderStore & OrderListSource {
  return {
    findByIdempotencyKey: (tenantId, key): Promise<StoredIdempotentOrder | undefined> =>
      withTenantTransaction(tenantId, (db) => selectByKey(db, tenantId, key)),
    insertOnce: (tenantId, row) =>
      withTenantTransaction(tenantId, (db) => insertOnce(db, tenantId, row)),
    transition: (tenantId, orderId, from, to) =>
      withTenantTransaction(tenantId, (db) => transition(db, tenantId, orderId, from, to)),
    exists: (tenantId, orderId) =>
      withTenantTransaction(tenantId, async (db) => {
        const result = await db.query("SELECT 1 FROM orders WHERE tenant_id = $1 AND id = $2", [
          tenantId,
          orderId,
        ]);
        return result.rowCount === 1;
      }),
    listPage: (tenantId, after, take) =>
      withTenantTransaction(tenantId, (db) => listPage(db, tenantId, after, take)),
  };
}
