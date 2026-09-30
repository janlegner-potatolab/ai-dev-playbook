import type { OrderStatus } from "../../../packages/contracts/src/index";
import { DomainError } from "./domainError";

export const MAX_ORDER_TOTAL_CENTS = 100_000_000;

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ["confirmed"],
  confirmed: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function sourceStatusesFor(target: OrderStatus): OrderStatus[] {
  return (Object.keys(TRANSITIONS) as OrderStatus[]).filter((from) => canTransition(from, target));
}

export function assertOrderTotalAllowed(totalCents: number): void {
  if (totalCents > MAX_ORDER_TOTAL_CENTS) {
    throw new DomainError("invalid_input", "Order total exceeds the allowed maximum");
  }
}
