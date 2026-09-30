import type { z } from "zod";
import { problemSchema, type FieldError } from "../../../packages/contracts/src/index";

export type ApiErrorKind =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "idempotency_mismatch"
  | "server"
  | "network";

const KIND_BY_STATUS: Record<number, ApiErrorKind> = {
  400: "invalid_input",
  401: "unauthenticated",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  422: "idempotency_mismatch",
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly fieldErrors: FieldError[];
  readonly retryable: boolean;
  readonly traceId: string | undefined;

  constructor(kind: ApiErrorKind, detail: string, extra: Partial<ApiError> = {}) {
    super(detail);
    this.name = "ApiError";
    this.kind = kind;
    this.fieldErrors = extra.fieldErrors ?? [];
    this.retryable = extra.retryable ?? (kind === "server" || kind === "network");
    this.traceId = extra.traceId;
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const parsed = problemSchema.safeParse(await response.json().catch(() => undefined));
  const kind = KIND_BY_STATUS[response.status] ?? "server";
  if (!parsed.success) return new ApiError(kind, `HTTP ${response.status}`);
  const problem = parsed.data;
  return new ApiError(kind, problem.detail ?? problem.title, {
    fieldErrors: problem.errors ?? [],
    retryable: problem.retryable,
    traceId: problem.trace_id,
  });
}

export async function requestJson<Output>(
  path: string,
  schema: z.ZodType<Output>,
  init: RequestInit = {},
): Promise<Output> {
  const headers = { "content-type": "application/json", ...init.headers };
  const response = await fetch(path, { ...init, headers }).catch((error: unknown) => {
    throw new ApiError("network", error instanceof Error ? error.message : String(error));
  });
  if (!response.ok) throw await toApiError(response);
  return schema.parse(await response.json());
}
