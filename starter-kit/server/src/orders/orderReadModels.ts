import { z } from "zod";
import type { ListOrdersQuery, Order, Page } from "../../../packages/contracts/src/index";
import { DomainError } from "../domain/domainError";

export type OrderCursor = { createdAt: string; id: string };

export interface OrderListSource {
  listPage(tenantId: string, after: OrderCursor | undefined, take: number): Promise<Order[]>;
}

export type OrderReadModelsDeps = { source: OrderListSource };

const cursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid() });

export function encodeCursor(order: Order): string {
  const cursor: OrderCursor = { createdAt: order.createdAt, id: order.id };
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(raw: string): OrderCursor {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
  } catch {
    throw new DomainError("invalid_input", "cursor is not valid");
  }
}

export function createOrderReadModels(deps: OrderReadModelsDeps) {
  async function listOrders(tenantId: string, query: ListOrdersQuery): Promise<Page<Order>> {
    const after = query.cursor ? decodeCursor(query.cursor) : undefined;
    const rows = await deps.source.listPage(tenantId, after, query.limit + 1);
    const hasMore = rows.length > query.limit;
    const data = rows.slice(0, query.limit);
    const last = data.at(-1);
    return { data, hasMore, nextCursor: hasMore && last ? encodeCursor(last) : null };
  }

  return { listOrders };
}

export type OrderReadModels = ReturnType<typeof createOrderReadModels>;
