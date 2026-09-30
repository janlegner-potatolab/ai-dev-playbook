import type { Request } from "express";

export type Permission = "orders:read" | "orders:write";

export type RequestContext = {
  tenantId: string;
  userId: string;
  permissions: readonly Permission[];
  traceId: string;
};

export type Authenticate = (
  request: Request,
  traceId: string,
) => Promise<RequestContext | undefined>;

export function hasPermission(context: RequestContext, permission: Permission): boolean {
  return context.permissions.includes(permission);
}
