import type { ApiErrorEnvelope } from '../generated/model/apiErrorEnvelope';

/**
 * orval custom mutator — the single fetch path every generated coordd API call goes through.
 *
 * Deliberately a plain module function (NOT a React hook), so the generated client never depends
 * on React context:
 *   - reads the JWT from sessionStorage ('coord_auth_token') — the same key AuthProvider persists;
 *   - injects `Authorization: Bearer <token>` when present;
 *   - on 401, clears the session keys and dispatches a `coord:unauthorized` event so AuthProvider can
 *     run its logout() (see contexts/auth.tsx).
 *
 * react-query contract: returns the parsed success **data** (`T`) and **throws** coordd's nested error
 * envelope `{ error: { code, message, invariants } }` on any non-2xx — react-query surfaces the throw as
 * the hook's `.error`, so every consumer reads `err.error?.message` / `err.error?.invariants`. This is the
 * app-wide error-shape fix, at the root.
 *
 * Signature is orval's fetch-httpClient mutator contract: `(url, requestInit) => Promise<T>`. Confirm it
 * matches your installed orval version on the first `yarn gen:api`.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

const SESSION_KEYS = ['coord_auth_token', 'coord_auth_address', 'coord_auth_chain'] as const;

export const authFetchMutator = async <T>(
  url: string,
  options: RequestInit = {},
): Promise<T> => {
  const token =
    typeof window !== 'undefined' ? sessionStorage.getItem('coord_auth_token') : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });

  if (res.status === 401 && typeof window !== 'undefined') {
    // Decouple from React: clear the session and let AuthProvider react (logout + redirect).
    SESSION_KEYS.forEach((k) => sessionStorage.removeItem(k));
    window.dispatchEvent(new Event('coord:unauthorized'));
  }

  if (!res.ok) {
    // coordd's error envelope is nested: { error: { code, message, invariants } }.
    const envelope = (await res
      .json()
      .catch(() => ({ error: { code: 'unknown', message: res.statusText } }))) as ApiErrorEnvelope;
    throw envelope;
  }

  // 204 No Content (and other empty bodies) → nothing to parse.
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
};

export default authFetchMutator;
