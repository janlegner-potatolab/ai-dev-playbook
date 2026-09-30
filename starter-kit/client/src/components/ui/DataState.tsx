import type { ReactNode } from "react";
import { Button } from "./Button";

export type DataStatus = "loading" | "empty" | "error" | "ready";

type DataStateProps = {
  status: DataStatus;
  loadingLabel: string;
  emptyLabel: string;
  errorLabel?: string;
  retryLabel: string;
  onRetry: () => void;
  children: ReactNode;
};

export function DataState(props: DataStateProps) {
  const { status, loadingLabel, emptyLabel, errorLabel, retryLabel, onRetry, children } = props;
  if (status === "loading") {
    return (
      <p role="status" aria-live="polite">
        {loadingLabel}
      </p>
    );
  }
  if (status === "empty") return <p>{emptyLabel}</p>;
  if (status === "error") {
    return (
      <div role="alert">
        <p>{errorLabel}</p>
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}
