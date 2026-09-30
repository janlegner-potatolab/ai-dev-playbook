import { createHash } from "node:crypto";
import type { CreateOrderRequest, Order, OrderStatus } from "../../../packages/contracts/src/index";
import { DomainError } from "../domain/domainError";
import { assertOrderTotalAllowed, sourceStatusesFor } from "../domain/order";

export type NewOrderRow = CreateOrderRequest & { idempotencyKey: string; requestHash: string };

export type StoredIdempotentOrder = { order: Order; requestHash: string };

export interface OrderStore {
  findByIdempotencyKey(tenantId: string, key: string): Promise<StoredIdempotentOrder | undefined>;
  insertOnce(tenantId: string, row: NewOrderRow): Promise<Order | undefined>;
  transition(
    tenantId: string,
    orderId: string,
    from: OrderStatus[],
    to: OrderStatus,
  ): Promise<Order | undefined>;
  exists(tenantId: string, orderId: string): Promise<boolean>;
}

export type OrderActionsDeps = { store: OrderStore };

export type CreateOrderCommand = {
  tenantId: string;
  idempotencyKey: string;
  request: CreateOrderRequest;
};

function hashRequest(request: CreateOrderRequest): string {
  const canonical = JSON.stringify([request.customerName, request.totalCents]);
  return createHash("sha256").update(canonical).digest("hex");
}

function replayOrReject(stored: StoredIdempotentOrder, requestHash: string): Order {
  if (stored.requestHash !== requestHash) {
    throw new DomainError("idempotency_mismatch", "Idempotency-Key was used with another body");
  }
  return stored.order;
}

export function createOrderActions(deps: OrderActionsDeps) {
  const { store } = deps;

  async function createOrder(command: CreateOrderCommand): Promise<Order> {
    const { tenantId, idempotencyKey, request } = command;
    assertOrderTotalAllowed(request.totalCents);
    const requestHash = hashRequest(request);
    const earlier = await store.findByIdempotencyKey(tenantId, idempotencyKey);
    if (earlier) return replayOrReject(earlier, requestHash);
    const inserted = await store.insertOnce(tenantId, { ...request, idempotencyKey, requestHash });
    if (inserted) return inserted;
    const raced = await store.findByIdempotencyKey(tenantId, idempotencyKey);
    if (!raced) throw new Error(`Order insert for key ${idempotencyKey} vanished`);
    return replayOrReject(raced, requestHash);
  }

  async function confirmOrder(tenantId: string, orderId: string): Promise<Order> {
    const target: OrderStatus = "confirmed";
    const updated = await store.transition(tenantId, orderId, sourceStatusesFor(target), target);
    if (updated) return updated;
    if (await store.exists(tenantId, orderId)) {
      throw new DomainError("conflict", "Only a draft order can be confirmed");
    }
    throw new DomainError("not_found", "Order not found");
  }

  return { createOrder, confirmOrder };
}

export type OrderActions = ReturnType<typeof createOrderActions>;
