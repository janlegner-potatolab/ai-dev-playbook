import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OrdersPage } from "./modules/orders/pages/OrdersPage";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

createRoot(container).render(
  <StrictMode>
    <OrdersPage />
  </StrictMode>,
);
