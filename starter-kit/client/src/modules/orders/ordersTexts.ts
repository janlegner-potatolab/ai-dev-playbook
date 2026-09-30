import type { ApiErrorKind } from "../../lib/http";

export const ordersTexts = {
  title: "Orders",
  loading: "Loading orders",
  empty: "No orders yet.",
  retry: "Try again",
  loadMore: "Load more",
  confirm: "Confirm",
  createHeading: "New order",
  customerLabel: "Customer",
  totalLabel: "Total",
  totalHint: "Amount with up to two decimals, for example 12.50",
  totalInvalid: "Enter a positive amount with up to two decimals.",
  submit: "Create order",
  status: { draft: "Draft", confirmed: "Confirmed" },
  errors: {
    invalid_input: "Some values are not valid. Check the form.",
    unauthenticated: "Your session ended. Sign in again.",
    forbidden: "You do not have permission for this action.",
    not_found: "The order no longer exists.",
    conflict: "The order changed in the meantime. Reload the list.",
    idempotency_mismatch: "This request was already sent with other values.",
    server: "Something went wrong on our side. Try again.",
    network: "The server is not reachable. Check your connection.",
  } satisfies Record<ApiErrorKind, string>,
};
