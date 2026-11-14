/** Browser-side calls to our own API routes (never to 9router directly). */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfter?: number,
  ) {
    super(`${status} ${code}`);
  }
}

type Listener = (err: ApiError) => void;
const authListeners = new Set<Listener>();

/** Called when the server says the device is locked (401) or no profile is chosen (403 no-profile). */
export function onAuthError(listener: Listener): () => void {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

export async function errorFrom(res: Response): Promise<ApiError> {
  let code = `http-${res.status}`;
  let retryAfter: number | undefined;
  try {
    const body = (await res.json()) as { error?: string; retryAfter?: number };
    if (body.error) code = body.error;
    retryAfter = body.retryAfter;
  } catch {
    // not JSON
  }
  const err = new ApiError(res.status, code, retryAfter);
  if (res.status === 401 || code === "no-profile") authListeners.forEach((l) => l(err));
  return err;
}

/** fetch with JSON in and out. Throws ApiError on a non-2xx answer. */
export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  const res = await fetch(path, {
    method,
    headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(init.body ?? {}),
    signal: init.signal,
    cache: "no-store",
  });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}

/** Result of anything that checks a password or PIN. */
export type GuessResult = "ok" | "wrong" | { wait: number };

export function guessResult(err: unknown): GuessResult {
  if (err instanceof ApiError && err.status === 429) return { wait: err.retryAfter ?? 30 };
  if (err instanceof ApiError && (err.code === "wrong-password" || err.code === "wrong-pin")) return "wrong";
  throw err;
}
