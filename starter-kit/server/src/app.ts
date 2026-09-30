import express from "express";
import { createOrdersRouter, type OrdersRouterDeps } from "./http/ordersRouter";
import { lastResortHandler, notFoundHandler } from "./http/problems";

const API_PREFIX = "/v1";

export type AppDeps = { orders: OrdersRouterDeps };

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use(API_PREFIX, createOrdersRouter(deps.orders));
  app.use(notFoundHandler);
  app.use(lastResortHandler);
  return app;
}
