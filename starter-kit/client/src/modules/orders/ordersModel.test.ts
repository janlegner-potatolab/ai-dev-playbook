import { describe, expect, it } from "vitest";
import type { Order } from "../../../../packages/contracts/src/index";
import { ApiError } from "../../lib/http";
import { errorMessage, parseTotalInput, replaceOrder, toOrderRows } from "./ordersModel";
import { ordersTexts } from "./ordersTexts";

const draft: Order = {
  id: "00000000-0000-4000-8000-000000000001",
  customerName: "Example Customer",
  totalCents: 1250,
  status: "draft",
  createdAt: "2026-01-01T00:00:00.000Z",
  confirmedAt: null,
};

describe("parseTotalInput", () => {
  it.each([
    ["12.50", 1250],
    ["12,5", 1250],
    ["7", 700],
  ])("reads %s as %i cents", (raw, cents) => {
    expect(parseTotalInput(raw)).toBe(cents);
  });

  it.each(["", "0", "-3", "1.234", "abc"])("rejects %s", (raw) => {
    expect(parseTotalInput(raw)).toBeUndefined();
  });
});

describe("toOrderRows", () => {
  it("offers confirm only for drafts", () => {
    const confirmed: Order = { ...draft, status: "confirmed" };
    const rows = toOrderRows([draft, confirmed], "en");
    expect(rows.map((row) => row.canConfirm)).toEqual([true, false]);
    expect(rows[0]?.total).toBe("12.50");
  });
});

describe("replaceOrder", () => {
  it("swaps the updated order in place", () => {
    const confirmed: Order = { ...draft, status: "confirmed" };
    expect(replaceOrder([draft], confirmed)).toEqual([confirmed]);
  });
});

describe("errorMessage", () => {
  it("maps an API error kind to its user message", () => {
    expect(errorMessage(new ApiError("conflict", "x"))).toBe(ordersTexts.errors.conflict);
  });

  it("falls back to the server message for unknown errors", () => {
    expect(errorMessage(new Error("boom"))).toBe(ordersTexts.errors.server);
  });
});
