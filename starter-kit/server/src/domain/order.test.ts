import { describe, expect, it } from "vitest";
import { DomainError } from "./domainError";
import {
  MAX_ORDER_TOTAL_CENTS,
  assertOrderTotalAllowed,
  canTransition,
  sourceStatusesFor,
} from "./order";

describe("order transitions", () => {
  it("allows draft to confirmed", () => {
    expect(canTransition("draft", "confirmed")).toBe(true);
  });

  it("never leaves confirmed", () => {
    expect(canTransition("confirmed", "draft")).toBe(false);
    expect(canTransition("confirmed", "confirmed")).toBe(false);
  });

  it("lists draft as the only source of confirmed", () => {
    expect(sourceStatusesFor("confirmed")).toEqual(["draft"]);
  });
});

describe("assertOrderTotalAllowed", () => {
  it("accepts the maximum", () => {
    expect(() => assertOrderTotalAllowed(MAX_ORDER_TOTAL_CENTS)).not.toThrow();
  });

  it("rejects a total above the maximum", () => {
    expect(() => assertOrderTotalAllowed(MAX_ORDER_TOTAL_CENTS + 1)).toThrow(DomainError);
  });
});
