import { useEffect, useState } from 'react';

/**
 * Streams a launch's server-sent event feed over an authenticated fetch.
 *
 * NOTE: intentionally NOT wired into any page right now. The old launch-detail "Live Events" card was
 * removed — it only ever showed a strict subset of the audit log (proposal executions/cancel/
 * rehearsal-publish; direct actions are audited but not broadcast) and did not stream through the
 * container's same-origin Next rewrite proxy. This hook (and coordd's GET /launch/{id}/events) is kept,
 * tested and ready, for the future "unify audit ⟺ SSE" work: once every audited event is broadcast
 * (plan-chaincoord-sse-hardening) and the stream reaches the browser, this should DRIVE a refetch of the
 * audit query — real-time visibility of other participants' actions from the one source of truth, rather
 * than a second, lossy feed. See the comment above <AuditLogSection/> in pages/launch/[id].tsx.
 *
 * Native `EventSource` can't set an `Authorization` header, but coordd's `/events` is
 * visibility-gated behind the Bearer token — so we stream over `fetch` (header-capable)
 * and reconnect with capped exponential backoff on transient drops. coordd emits no
 * `id:` lines and its broker keeps no replay buffer, so a reconnect resubscribes for
 * *future* events only; react-query polling reconciles anything missed during a gap.
 *
 * Failure handling mirrors the rest of the app: a 401 dispatches `coord:unauthorized`
 * (AuthProvider logs out); a 404 or any other 4xx (not visible / gone) stops the stream
 * instead of hammering coordd; 5xx / network drops retry with backoff.
 *
 * Returns up to the 50 most recent events, newest first, as `"HH:MM:SS: <data>"`.
 */
export function useLaunchEventStream(launchId: string, token: string | null): string[] {
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    if (!token || !launchId) return undefined;

    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
    const ctrl = new AbortController();
    let attempt = 0;

    const append = (data: string) =>
      setEvents((prev) => [`${new Date().toLocaleTimeString()}: ${data}`, ...prev.slice(0, 49)]);

    // Resolves after `ms`, or immediately on teardown so unmount stops the loop promptly.
    const backoff = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(resolve, ms);
        ctrl.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(t);
            resolve();
          },
          { once: true },
        );
      });

    const run = async () => {
      while (!ctrl.signal.aborted) {
        try {
          const res = await fetch(`${apiBase}/launch/${launchId}/events`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
            signal: ctrl.signal,
          });

          if (res.status === 401) {
            window.dispatchEvent(new Event('coord:unauthorized')); // AuthProvider logs out
            return;
          }
          if (res.status >= 400 && res.status < 500) return; // 404 not-visible / gone, etc. — fatal
          if (!res.ok || !res.body) throw new Error(`sse ${res.status}`); // 5xx / no body — retry

          attempt = 0; // connected — reset backoff
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break; // server closed the stream → reconnect
            buf += decoder.decode(value, { stream: true });
            // coordd frames each event as `event: <name>\ndata: <json>\n\n`; split on the blank line.
            let sep = buf.indexOf('\n\n');
            while (sep !== -1) {
              const data = buf
                .slice(0, sep)
                .split('\n')
                .filter((l) => l.startsWith('data:')) // ignore comment (:) / event: / id: lines
                .map((l) => l.slice(5).replace(/^ /, '')) // drop 'data:' + one optional leading space
                .join('\n');
              buf = buf.slice(sep + 2);
              if (data) append(data);
              sep = buf.indexOf('\n\n');
            }
          }
        } catch {
          if (ctrl.signal.aborted) return; // torn down
          // transient (network / dropped stream) → fall through to backoff + retry
        }
        await backoff(Math.min(1000 * (2 ** attempt), 30_000)); // 1s, 2s, 4s … capped at 30s
        attempt += 1;
      }
    };

    void run();
    return () => ctrl.abort();
  }, [launchId, token]);

  return events;
}
