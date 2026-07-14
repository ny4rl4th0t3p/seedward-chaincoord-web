const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

const SESSION_KEYS = ['coord_auth_token', 'coord_auth_address', 'coord_auth_chain'] as const;

/**
 * RULE — orval by default: consume every JSON endpoint through the generated client
 * (`api/generated/**` — a `useX()` hook for render-time reads, or the bare `getX()`/`postX()`
 * fetcher for imperative/event-driven calls). Those route through the shared `authFetchMutator`,
 * so you inherit Bearer-token auth, 401→logout, and the `{error:{...}}` envelope for free.
 * Reach for a bespoke fetch ONLY when the generated client genuinely can't serve the call:
 *   - non-JSON bytes (this file — see below);
 *   - the pre-JWT auth handshake, which runs before a token exists (`contexts/auth.tsx`);
 *   - server-sent events, which react-query can't stream (`EventSource`).
 * A hand-rolled `fetch` to a JSON endpoint is a bug: it silently skips auth + the error envelope.
 *
 * Raw authenticated fetch for the handful of endpoints that are NOT JSON, so the generated (JSON)
 * client can't serve them:
 *   - genesis file download — the exact bytes are needed to verify SHA-256 against the published hash
 *     (a JSON re-serialization would change the bytes), and it may 302-redirect to an attestor;
 *   - host-mode file uploads (arbitrary bytes; base64-in-JSON was deliberately rejected for scale, D8).
 *
 * Returns the raw `Response` so callers can `.arrayBuffer()` / `.text()` / follow redirects. It mirrors
 * the orval mutator's auth: Bearer token from sessionStorage + on 401, clear the session and dispatch
 * `coord:unauthorized` (AuthProvider logs out). JSON endpoints should use the generated hooks instead.
 */
export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token =
    typeof window !== 'undefined' ? sessionStorage.getItem('coord_auth_token') : null;

  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401 && typeof window !== 'undefined') {
    SESSION_KEYS.forEach((k) => sessionStorage.removeItem(k));
    window.dispatchEvent(new Event('coord:unauthorized'));
  }

  return res;
}
