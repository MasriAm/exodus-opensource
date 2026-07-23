export class QueryTimeoutError extends Error {
  readonly timedOut = true as const;

  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "QueryTimeoutError";
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
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

export const DESK_QUERY_TIMEOUT_MS = 20_000;
export const VIEW_QUERY_TIMEOUT_MS = 15_000;
export const COUNTS_TIMEOUT_MS = 12_000;
export const INGEST_TIMEOUT_MS = 10 * 60_000;
