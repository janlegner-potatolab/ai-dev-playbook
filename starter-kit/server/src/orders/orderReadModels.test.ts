import { describe, expect, it } from "vitest";
import type { Order } from "../../../packages/contracts/src/index";
import {
  createOrderReadModels,
  decodeCursor,
  encodeCursor,
  type OrderCursor,
} from "./orderReadModels";

const TENANT = "00000000-0000-4000-8000-000000000001";

function makeOrder(index: number): Order {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    customerName: `Customer ${index}`,
    totalCents: index * 100,
    status: "draft",
    createdAt: new Date(Date.UTC(2026, 0, index)).toISOString(),
    confirmedAt: null,
  };
}

function sourceOf(orders: Order[]) {
  const calls: Array<{ after: OrderCursor | undefined; take: number }> = [];
  const source = {
    listPage: async (_tenantId: string, after: OrderCursor | undefined, take: number) => {
      calls.push({ after, take });
      return orders.slice(0, take);
    },
  };
  return { source, calls };
}

describe("listOrders", () => {
  it("asks for one extra row and reports more pages", async () => {
    const { source, calls } = sourceOf([1, 2, 3].map(makeOrder));
    const page = await createOrderReadModels({ source }).listOrders(TENANT, { limit: 2 });
    expect(calls[0]?.take).toBe(3);
    expect(page.data).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe(encodeCursor(makeOrder(2)));
  });

  it("ends with a null cursor on the last page", async () => {
    const { source } = sourceOf([makeOrder(1)]);
    const page = await createOrderReadModels({ source }).listOrders(TENANT, { limit: 2 });
    expect(page).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("rejects a forged cursor", () => {
    expect(() => decodeCursor("not-a-cursor")).toThrow("cursor is not valid");
  });
});
