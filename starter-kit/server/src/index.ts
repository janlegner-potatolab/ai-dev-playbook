import { createApp } from "./app";
import type { Authenticate } from "./auth/requestContext";
import { createOrderActions } from "./orders/orderActions";
import { createOrderReadModels } from "./orders/orderReadModels";
import { createOrderSql } from "./orders/orderSql";

const DEFAULT_PORT = 3000;

// Replace with the real identity provider before the first route leaves localhost.
const rejectEveryone: Authenticate = async () => undefined;

const orderSql = createOrderSql();
const app = createApp({
  orders: {
    actions: createOrderActions({ store: orderSql }),
    readModels: createOrderReadModels({ source: orderSql }),
    authenticate: rejectEveryone,
  },
});

const port = Number(process.env.PORT ?? DEFAULT_PORT);
app.listen(port, () => {
  process.stdout.write(`listening on ${port}\n`);
});
