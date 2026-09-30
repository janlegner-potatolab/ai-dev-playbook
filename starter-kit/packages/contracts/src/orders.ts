import { z } from "zod";
import { pageDtoSchema, pageQuerySchema } from "./http";

const MAX_CUSTOMER_NAME_LENGTH = 200;

export const orderStatusSchema = z.enum(["draft", "confirmed"]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const orderDtoSchema = z.object({
  id: z.uuid(),
  customer_name: z.string(),
  total_cents: z.number().int(),
  status: orderStatusSchema,
  created_at: z.iso.datetime(),
  confirmed_at: z.iso.datetime().nullable(),
});
export type OrderDto = z.infer<typeof orderDtoSchema>;

export type Order = {
  id: string;
  customerName: string;
  totalCents: number;
  status: OrderStatus;
  createdAt: string;
  confirmedAt: string | null;
};

export function toOrderDto(order: Order): OrderDto {
  return {
    id: order.id,
    customer_name: order.customerName,
    total_cents: order.totalCents,
    status: order.status,
    created_at: order.createdAt,
    confirmed_at: order.confirmedAt,
  };
}

export function fromOrderDto(dto: OrderDto): Order {
  return {
    id: dto.id,
    customerName: dto.customer_name,
    totalCents: dto.total_cents,
    status: dto.status,
    createdAt: dto.created_at,
    confirmedAt: dto.confirmed_at,
  };
}

export const createOrderDtoSchema = z.object({
  customer_name: z.string().trim().min(1).max(MAX_CUSTOMER_NAME_LENGTH),
  total_cents: z.number().int().positive(),
});
export type CreateOrderDto = z.infer<typeof createOrderDtoSchema>;
export type CreateOrderRequest = { customerName: string; totalCents: number };

export function toCreateOrderDto(request: CreateOrderRequest): CreateOrderDto {
  return { customer_name: request.customerName, total_cents: request.totalCents };
}

export function fromCreateOrderDto(dto: CreateOrderDto): CreateOrderRequest {
  return { customerName: dto.customer_name, totalCents: dto.total_cents };
}

export const listOrdersQuerySchema = pageQuerySchema;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

export const orderPageDtoSchema = pageDtoSchema(orderDtoSchema);

export const confirmOrderParamsSchema = z.object({ orderId: z.uuid() });
