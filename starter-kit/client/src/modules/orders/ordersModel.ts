import type { Order, OrderStatus } from "../../../../packages/contracts/src/index";
import { ApiError } from "../../lib/http";
import { ordersTexts } from "./ordersTexts";

const CENTS_PER_UNIT = 100;
const AMOUNT_PATTERN = /^\d+(?:[.,]\d{1,2})?$/;

export type OrderRow = {
  id: string;
  customerName: string;
  total: string;
  statusLabel: string;
  canConfirm: boolean;
};

function formatTotal(totalCents: number, locale: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2 }).format(
    totalCents / CENTS_PER_UNIT,
  );
}

export function toOrderRows(orders: Order[], locale: string): OrderRow[] {
  return orders.map((order) => ({
    id: order.id,
    customerName: order.customerName,
    total: formatTotal(order.totalCents, locale),
    statusLabel: ordersTexts.status[order.status],
    canConfirm: order.status === ("draft" satisfies OrderStatus),
  }));
}

export function parseTotalInput(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!AMOUNT_PATTERN.test(trimmed)) return undefined;
  const [units = "0", fraction = ""] = trimmed.replace(",", ".").split(".");
  const cents = Number(units) * CENTS_PER_UNIT + Number(fraction.padEnd(2, "0"));
  return cents > 0 ? cents : undefined;
}

export function replaceOrder(orders: Order[], updated: Order): Order[] {
  return orders.map((order) => (order.id === updated.id ? updated : order));
}

export function errorMessage(error: unknown): string {
  const kind = error instanceof ApiError ? error.kind : "server";
  return ordersTexts.errors[kind];
}
