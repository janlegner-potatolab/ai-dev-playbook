import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { z } from "zod";
import {
  hasPermission,
  type Authenticate,
  type Permission,
  type RequestContext,
} from "../auth/requestContext";
import { isDomainError } from "../domain/domainError";
import { buildProblem, fieldErrorsOf, logFailure, sendProblem } from "./problems";

type Method = "get" | "post" | "put" | "patch" | "delete";

/** What the request schema receives: params, query, body and lower-cased headers. */
type RawInput = { params: unknown; query: unknown; body: unknown; headers: unknown };

export type RouteSpec<Input, Output> = {
  method: Method;
  path: string;
  request: z.ZodType<Input>;
  response: z.ZodType<Output>;
  permission: Permission;
  successStatus?: number;
  handler: (input: Input, context: RequestContext) => Promise<Output>;
};

export type RouteDefinition = {
  method: Method;
  path: string;
  handle: (request: Request, response: Response, authenticate: Authenticate) => Promise<void>;
};

const HTTP_OK = 200;

async function runRoute<Input, Output>(
  spec: RouteSpec<Input, Output>,
  request: Request,
  response: Response,
  authenticate: Authenticate,
  traceId: string,
): Promise<void> {
  const context = await authenticate(request, traceId);
  if (!context) return sendProblem(response, buildProblem("unauthenticated", traceId));
  if (!hasPermission(context, spec.permission)) {
    return sendProblem(response, buildProblem("forbidden", traceId));
  }
  const raw: RawInput = {
    params: request.params,
    query: request.query,
    body: request.body,
    headers: request.headers,
  };
  const input = spec.request.safeParse(raw);
  if (!input.success) {
    const problem = buildProblem("invalid_input", traceId, undefined, fieldErrorsOf(input.error));
    return sendProblem(response, problem);
  }
  const output = spec.response.parse(await spec.handler(input.data, context));
  response.status(spec.successStatus ?? HTTP_OK).json(output);
}

function failureResponse(error: unknown, operation: string, traceId: string, response: Response) {
  if (isDomainError(error)) {
    return sendProblem(response, buildProblem(error.kind, traceId, error.message));
  }
  logFailure(operation, traceId, error);
  sendProblem(response, buildProblem("internal", traceId));
}

export function defineRoute<Input, Output>(spec: RouteSpec<Input, Output>): RouteDefinition {
  const operation = `${spec.method.toUpperCase()} ${spec.path}`;
  return {
    method: spec.method,
    path: spec.path,
    handle: async (request, response, authenticate) => {
      const traceId = request.get("x-trace-id") ?? randomUUID();
      try {
        await runRoute(spec, request, response, authenticate, traceId);
      } catch (error) {
        failureResponse(error, operation, traceId, response);
      }
    },
  };
}

export function mountRoutes(routes: RouteDefinition[], authenticate: Authenticate): Router {
  const router = Router();
  for (const route of routes) {
    router[route.method](route.path, (request, response) =>
      route.handle(request, response, authenticate),
    );
  }
  return router;
}
