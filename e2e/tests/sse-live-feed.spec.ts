import { test, expect } from '../fixtures/test';
import { createLaunch } from '../helpers/launch';

// K.12 — SSE live event feed
//
// SKIPPED: the "Live Events" panel was removed from the launch detail page. The audit log is now the
// single activity view (it auto-refetches on every governance mutation), and the SSE feed never streamed
// through the same-origin Next rewrite proxy the container deployment uses. coordd's GET
// /launch/{id}/events endpoint and the useLaunchEventStream hook are kept and unit-tested for the future
// "unify audit ⟺ SSE" work — at which point the stream should DRIVE an audit refetch rather than feed a
// separate panel. This test targeted the removed panel; re-enable and rewrite it against the audit log
// (not a "Listening for events…" placeholder) once that rewrite lands.

test.skip('K.12.1 the live feed receives a pushed event', async ({ page }) => {
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
