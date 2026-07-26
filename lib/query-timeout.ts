export class QueryTimeoutError extends Error {
  readonly timedOut = true as const;

  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "QueryTimeoutError";
  }
}

export function isQueryTimeoutError(error: unknown): error is QueryTimeoutError {
  return (
    error instanceof QueryTimeoutError ||
    (error instanceof Error &&
      (error.name === "QueryTimeoutError" ||
        error.message.toLocaleLowerCase().includes("timed out")))
  );
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        onTimeout?.();
      } catch {
        // ignore listener errors
      }
      reject(new QueryTimeoutError(label, ms));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Client waits slightly longer than the worker so the worker clears the queue first. */
export const DESK_QUERY_TIMEOUT_MS = 50_000;
export const VIEW_QUERY_TIMEOUT_MS = 45_000;
export const HEAVY_QUERY_TIMEOUT_MS = 90_000;
export const EXPORT_TIMEOUT_MS = 5 * 60_000;
export const COUNTS_TIMEOUT_MS = 15_000;
export const INGEST_TIMEOUT_MS = 10 * 60_000;
export const PING_TIMEOUT_MS = 8_000;
