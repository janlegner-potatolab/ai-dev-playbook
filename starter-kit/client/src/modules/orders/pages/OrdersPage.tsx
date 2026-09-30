import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Order } from "../../../../../packages/contracts/src/index";
import { Button, DataState, TextField, type DataStatus } from "../../../components/ui";
import { confirmOrder, createOrder, fetchOrders } from "../api";
import { errorMessage, parseTotalInput, replaceOrder, toOrderRows } from "../ordersModel";
import { ordersTexts } from "../ordersTexts";

type ListState = { orders: Order[]; nextCursor: string | null; error?: string; loading: boolean };

function statusOf(list: ListState): DataStatus {
  if (list.loading && list.orders.length === 0) return "loading";
  if (list.error && list.orders.length === 0) return "error";
  return list.orders.length === 0 ? "empty" : "ready";
}

function useOrderList() {
  const [list, setList] = useState<ListState>({ orders: [], nextCursor: null, loading: true });
  const load = useCallback(async (cursor: string | null) => {
    setList((current) => ({ ...current, loading: true, error: undefined }));
    try {
      const page = await fetchOrders(cursor);
      setList((current) => ({
        orders: cursor ? [...current.orders, ...page.data] : page.data,
        nextCursor: page.nextCursor,
        loading: false,
      }));
    } catch (error) {
      setList((current) => ({ ...current, loading: false, error: errorMessage(error) }));
    }
  }, []);
  useEffect(() => {
    void load(null);
  }, [load]);
  return { list, setList, load };
}

function CreateOrderForm({ onCreated }: { onCreated: (order: Order) => void }) {
  const [customerName, setCustomerName] = useState("");
  const [total, setTotal] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const totalCents = parseTotalInput(total);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (totalCents === undefined) return setError(ordersTexts.totalInvalid);
    setSaving(true);
    try {
      onCreated(await createOrder({ customerName, totalCents }, idempotencyKey));
      setCustomerName("");
      setTotal("");
      setIdempotencyKey(crypto.randomUUID());
      setError(undefined);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} aria-label={ordersTexts.createHeading}>
      <TextField
        label={ordersTexts.customerLabel}
        value={customerName}
        required
        onChange={(event) => setCustomerName(event.target.value)}
      />
      <TextField
        label={ordersTexts.totalLabel}
        hint={ordersTexts.totalHint}
        inputMode="decimal"
        value={total}
        error={error}
        onChange={(event) => setTotal(event.target.value)}
      />
      <Button type="submit" loading={saving}>
        {ordersTexts.submit}
      </Button>
    </form>
  );
}

type OrderListProps = {
  list: ListState;
  onConfirm: (orderId: string) => Promise<void>;
  onLoadMore: (cursor: string | null) => Promise<void>;
};

function OrderList({ list, onConfirm, onLoadMore }: OrderListProps) {
  const locale = navigator.language;
  return (
    <>
      {list.error && <p role="alert">{list.error}</p>}
      <ul>
        {toOrderRows(list.orders, locale).map((row) => (
          <li key={row.id}>
            {row.customerName} · {row.total} · {row.statusLabel}
            {row.canConfirm && (
              <Button variant="secondary" onClick={() => void onConfirm(row.id)}>
                {ordersTexts.confirm}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {list.nextCursor && (
        <Button
          variant="secondary"
          loading={list.loading}
          onClick={() => void onLoadMore(list.nextCursor)}
        >
          {ordersTexts.loadMore}
        </Button>
      )}
    </>
  );
}

export function OrdersPage() {
  const { list, setList, load } = useOrderList();

  async function confirm(orderId: string) {
    try {
      const updated = await confirmOrder(orderId);
      setList((current) => ({ ...current, orders: replaceOrder(current.orders, updated) }));
    } catch (error) {
      setList((current) => ({ ...current, error: errorMessage(error) }));
    }
  }

  return (
    <main>
      <h1>{ordersTexts.title}</h1>
      <CreateOrderForm
        onCreated={(order) =>
          setList((current) => ({ ...current, orders: [order, ...current.orders] }))
        }
      />
      <DataState
        status={statusOf(list)}
        loadingLabel={ordersTexts.loading}
        emptyLabel={ordersTexts.empty}
        errorLabel={list.error}
        retryLabel={ordersTexts.retry}
        onRetry={() => void load(null)}
      >
        <OrderList list={list} onConfirm={confirm} onLoadMore={load} />
      </DataState>
    </main>
  );
}
