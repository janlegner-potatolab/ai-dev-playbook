import {
  fromOrderDto,
  fromPageDto,
  orderDtoSchema,
  orderPageDtoSchema,
  toCreateOrderDto,
  type CreateOrderRequest,
  type Order,
  type Page,
} from "../../../../packages/contracts/src/index";
import { requestJson } from "../../lib/http";

const ORDERS_PATH = "/v1/orders";

export async function fetchOrders(cursor: string | null): Promise<Page<Order>> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const dto = await requestJson(`${ORDERS_PATH}${query}`, orderPageDtoSchema);
  return fromPageDto(dto, fromOrderDto);
}

export async function createOrder(
  request: CreateOrderRequest,
  idempotencyKey: string,
): Promise<Order> {
  const dto = await requestJson(ORDERS_PATH, orderDtoSchema, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(toCreateOrderDto(request)),
  });
  return fromOrderDto(dto);
}

export async function confirmOrder(orderId: string): Promise<Order> {
  const path = `${ORDERS_PATH}/${encodeURIComponent(orderId)}/confirm`;
  return fromOrderDto(await requestJson(path, orderDtoSchema, { method: "POST" }));
}
