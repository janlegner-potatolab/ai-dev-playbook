import type { ErrorRequestHandler, RequestHandler, Response } from "express";
import type { z } from "zod";
import type { FieldError, Problem } from "../../../packages/contracts/src/index";
import type { DomainErrorKind } from "../domain/domainError";

const PROBLEM_TYPE_BASE = "https://errors.example.com/";
const PROBLEM_CONTENT_TYPE = "application/problem+json";

const PROBLEMS: Record<DomainErrorKind | "internal", { status: number; title: string }> = {
  invalid_input: { status: 400, title: "Request validation failed" },
  unauthenticated: { status: 401, title: "Authentication required" },
  forbidden: { status: 403, title: "Permission denied" },
  not_found: { status: 404, title: "Resource not found" },
  conflict: { status: 409, title: "Conflicting state" },
  idempotency_mismatch: { status: 422, title: "Idempotency key reused with another body" },
  internal: { status: 500, title: "Internal error" },
};

export type ProblemKind = keyof typeof PROBLEMS;

export function buildProblem(
  kind: ProblemKind,
  traceId: string,
  detail?: string,
  errors?: FieldError[],
): Problem {
  const { status, title } = PROBLEMS[kind];
  return {
    type: `${PROBLEM_TYPE_BASE}${kind}`,
    title,
    status,
    detail,
    retryable: kind === "internal",
    trace_id: traceId,
    errors,
  };
}

export function fieldErrorsOf(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    code: issue.code,
    message: issue.message,
  }));
}

export function sendProblem(response: Response, problem: Problem): void {
  response.status(problem.status).type(PROBLEM_CONTENT_TYPE).send(JSON.stringify(problem));
}

export function logFailure(operation: string, traceId: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  process.stderr.write(
    `${JSON.stringify({ level: "error", operation, traceId, message, stack })}\n`,
  );
}

export const notFoundHandler: RequestHandler = (request, response) => {
  sendProblem(response, buildProblem("not_found", request.get("x-trace-id") ?? "none"));
};

export const lastResortHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) return next(error);
  const traceId = request.get("x-trace-id") ?? "none";
  const isBadBody = (error as { type?: string }).type === "entity.parse.failed";
  if (!isBadBody) logFailure(`${request.method} ${request.path}`, traceId, error);
  sendProblem(response, buildProblem(isBadBody ? "invalid_input" : "internal", traceId));
};
