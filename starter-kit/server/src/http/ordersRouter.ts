import { z } from "zod";
import {
  confirmOrderParamsSchema,
  createOrderDtoSchema,
  fromCreateOrderDto,
  listOrdersQuerySchema,
  orderDtoSchema,
  orderPageDtoSchema,
  toOrderDto,
  toPageDto,
} from "../../../packages/contracts/src/index";
import type { Authenticate } from "../auth/requestContext";
import type { OrderActions } from "../orders/orderActions";
import type { OrderReadModels } from "../orders/orderReadModels";
import { defineRoute, mountRoutes } from "./defineRoute";

const HTTP_CREATED = 201;

export type OrdersRouterDeps = {
  actions: OrderActions;
  readModels: OrderReadModels;
  authenticate: Authenticate;
};

export function createOrdersRouter(deps: OrdersRouterDeps) {
  const listOrders = defineRoute({
    method: "get",
    path: "/orders",
    request: z.object({ query: listOrdersQuerySchema }),
    response: orderPageDtoSchema,
    permission: "orders:read",
    handler: async ({ query }, context) =>
      toPageDto(await deps.readModels.listOrders(context.tenantId, query), toOrderDto),
  });

  const createOrder = defineRoute({
    method: "post",
    path: "/orders",
    request: z.object({
      body: createOrderDtoSchema,
      headers: z.object({ "idempotency-key": z.uuid() }),
    }),
    response: orderDtoSchema,
    permission: "orders:write",
    successStatus: HTTP_CREATED,
    handler: async ({ body, headers }, context) => {
      const order = await deps.actions.createOrder({
        tenantId: context.tenantId,
        idempotencyKey: headers["idempotency-key"],
        request: fromCreateOrderDto(body),
      });
      return toOrderDto(order);
    },
  });

  const confirmOrder = defineRoute({
    method: "post",
    path: "/orders/:orderId/confirm",
    request: z.object({ params: confirmOrderParamsSchema }),
    response: orderDtoSchema,
    permission: "orders:write",
    handler: async ({ params }, context) =>
      toOrderDto(await deps.actions.confirmOrder(context.tenantId, params.orderId)),
  });

  return mountRoutes([listOrders, createOrder, confirmOrder], deps.authenticate);
}
