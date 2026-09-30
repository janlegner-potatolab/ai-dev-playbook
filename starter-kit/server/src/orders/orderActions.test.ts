import { describe, expect, it } from "vitest";
import type { Order, OrderStatus } from "../../../packages/contracts/src/index";
import { DomainError } from "../domain/domainError";
import { MAX_ORDER_TOTAL_CENTS } from "../domain/order";
import { createOrderActions, type NewOrderRow, type OrderStore } from "./orderActions";

const TENANT = "00000000-0000-4000-8000-000000000001";
const OTHER_TENANT = "00000000-0000-4000-8000-000000000002";
const KEY = "5f0c9a3e-1d2b-4c5d-8e7f-0a1b2c3d4e5f";
const CREATED_AT = "2026-01-01T00:00:00.000Z";

type StoredRow = NewOrderRow & { tenantId: string; order: Order };

function fakeStore() {
  const rows: StoredRow[] = [];
  const find = (tenantId: string, orderId: string) =>
    rows.find((row) => row.tenantId === tenantId && row.order.id === orderId);
  const store: OrderStore = {
    findByIdempotencyKey: async (tenantId, key) => {
      const row = rows.find((item) => item.tenantId === tenantId && item.idempotencyKey === key);
      return row ? { order: row.order, requestHash: row.requestHash } : undefined;
    },
    insertOnce: async (tenantId, row) => {
      const id = `00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, "0")}`;
      const order: Order = {
        id,
        customerName: row.customerName,
        totalCents: row.totalCents,
        status: "draft",
        createdAt: CREATED_AT,
        confirmedAt: null,
      };
      rows.push({ ...row, tenantId, order });
      return order;
    },
    transition: async (tenantId, orderId, from: OrderStatus[], to) => {
      const row = find(tenantId, orderId);
      if (!row || !from.includes(row.order.status)) return undefined;
      row.order = { ...row.order, status: to, confirmedAt: CREATED_AT };
      return row.order;
    },
    exists: async (tenantId, orderId) => find(tenantId, orderId) !== undefined,
  };
  return { store, rows };
}

const request = { customerName: "Example Customer", totalCents: 1250 };

describe("createOrder", () => {
  it("creates a draft order", async () => {
    const { store } = fakeStore();
    const order = await createOrderActions({ store }).createOrder({
      tenantId: TENANT,
      idempotencyKey: KEY,
      request,
    });
    expect(order.status).toBe("draft");
  });

  it("returns the original order for a duplicate idempotency key", async () => {
    const { store, rows } = fakeStore();
    const actions = createOrderActions({ store });
    const first = await actions.createOrder({ tenantId: TENANT, idempotencyKey: KEY, request });
    const second = await actions.createOrder({ tenantId: TENANT, idempotencyKey: KEY, request });
    expect(second).toEqual(first);
    expect(rows).toHaveLength(1);
  });

  it("rejects the same key with a different body", async () => {
    const { store } = fakeStore();
    const actions = createOrderActions({ store });
    await actions.createOrder({ tenantId: TENANT, idempotencyKey: KEY, request });
    const changed = { ...request, totalCents: 999 };
    await expect(
      actions.createOrder({ tenantId: TENANT, idempotencyKey: KEY, request: changed }),
    ).rejects.toMatchObject({ kind: "idempotency_mismatch" });
  });

  it("scopes the idempotency key to the tenant", async () => {
    const { store, rows } = fakeStore();
    const actions = createOrderActions({ store });
    await actions.createOrder({ tenantId: TENANT, idempotencyKey: KEY, request });
    await actions.createOrder({ tenantId: OTHER_TENANT, idempotencyKey: KEY, request });
    expect(rows).toHaveLength(2);
  });

  it("rejects a total above the maximum", async () => {
    const { store } = fakeStore();
    const tooMuch = { ...request, totalCents: MAX_ORDER_TOTAL_CENTS + 1 };
    await expect(
      createOrderActions({ store }).createOrder({
        tenantId: TENANT,
        idempotencyKey: KEY,
        request: tooMuch,
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe("confirmOrder", () => {
  async function seededDraft() {
    const { store } = fakeStore();
    const actions = createOrderActions({ store });
    const order = await actions.createOrder({ tenantId: TENANT, idempotencyKey: KEY, request });
    return { actions, order };
  }

  it("confirms a draft", async () => {
    const { actions, order } = await seededDraft();
    const confirmed = await actions.confirmOrder(TENANT, order.id);
    expect(confirmed.status).toBe("confirmed");
  });

  it("refuses to confirm twice", async () => {
    const { actions, order } = await seededDraft();
    await actions.confirmOrder(TENANT, order.id);
    await expect(actions.confirmOrder(TENANT, order.id)).rejects.toMatchObject({
      kind: "conflict",
    });
  });

  it("hides another tenant's order as not found", async () => {
    const { actions, order } = await seededDraft();
    await expect(actions.confirmOrder(OTHER_TENANT, order.id)).rejects.toMatchObject({
      kind: "not_found",
    });
  });
});
