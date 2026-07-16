import { test, expect } from '../fixtures/test';
import { createLaunch } from '../helpers/launch';

// K.12 — SSE live event feed (authenticated fetch stream)
//
// The "Live Events" panel is fed ONLY by useLaunchEventStream (the authenticated SSE push) with no
// react-query/polling backstop — so the placeholder clearing is proof that the stream connected WITH
// the Bearer token and received a server-pushed event, not a refetch. Before the fetch-based SSE fix,
// the native EventSource hit coordd's visibility-gated /events anonymously (EventSource can't set an
// Authorization header) → 404 → the feed stayed silently empty. This guards that regression end-to-end
// against a real coordd.
//
// Trigger = a direct cancel of the fresh DRAFT launch: coordd's CancelLaunch publishes LaunchCancelled
// to the SSE broker (s.events.Publish). Note many *direct* actions (OpenWindow, uploads, patches) only
// write the audit log and do NOT publish to SSE — only proposal executions, cancel, and rehearsal
// events reach the live feed — so cancel is the simplest single action that produces a push.

test('K.12.1 the live feed receives a pushed event', async ({ page }) => {
  await createLaunch(page, { chainName: 'k121chain', chainId: 'k121-1' });

  // SSE-exclusive panel: empty ("Listening for events…") until a real push arrives.
  const placeholder = page.getByText(/Listening for events/i);
  await expect(placeholder).toBeVisible();

  // Directly cancel the DRAFT launch (lead-only, unsigned, two-step confirm). CancelLaunch publishes
  // LaunchCancelled to the SSE broker → the open stream pushes it to this client.
  await page.getByRole('button', { name: 'Cancel Launch' }).click();
  await page.getByRole('button', { name: 'Confirm Cancel' }).click();

  // The pushed event replaces the placeholder. The assertion only requires that *a* push arrived (the
  // panel is SSE-exclusive), not the event's identity. Generous timeout absorbs stream / CI timing (the
  // config already notes occasional SSE timing flakes + a CI retry). Web-first assertion, no fixed sleeps.
  await expect(placeholder).toBeHidden({ timeout: 20_000 });
});
