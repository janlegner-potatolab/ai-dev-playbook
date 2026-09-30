import { describe, expect, it } from "vitest";
import { DomainError, isDomainError } from "./domainError";

describe("isDomainError", () => {
  it("recognizes a domain error", () => {
    expect(isDomainError(new DomainError("conflict", "Order is not a draft"))).toBe(true);
  });

  it("rejects any other error", () => {
    expect(isDomainError(new Error("boom"))).toBe(false);
  });
});
