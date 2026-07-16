import { test, expect } from '../fixtures/test';
import { createLaunch } from '../helpers/launch';

// K.13 — Governed cancel (CANCEL_LAUNCH proposal)
//
// cancel-governance split: a *direct* cancel is only allowed in DRAFT/PUBLISHED; past PUBLISHED coordd
// rejects it (409) and cancellation must go through an M-of-N CANCEL_LAUNCH proposal that any committee
// member can raise. This drives the launch to WINDOW_OPEN, asserts the direct button is gone and the
// governed "Propose Cancel" is shown instead, then raises the proposal. The e2e committee is 1-of-1, so
// the CANCEL_LAUNCH proposal executes immediately → the launch reaches CANCELED.

test('K.13.1 past PUBLISHED, Propose Cancel raises a CANCEL_LAUNCH proposal', async ({ page }) => {
  await createLaunch(page, { chainName: 'k131chain', chainId: 'k131-1' });

  // Move to WINDOW_OPEN (past PUBLISHED), where the direct cancel is no longer permitted.
  await page
    .getByPlaceholder('https://files.example.com/genesis.json')
    .fill('https://example.com/genesis.json');
  await page.getByPlaceholder('64-character hex digest').fill('a'.repeat(64));
  await page.getByRole('button', { name: /submit genesis reference/i }).click();
  await expect(page.getByText(/genesis reference saved/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /open application window/i }).click();
  await expect(
    page.getByText(/WINDOW_OPEN/i).or(page.getByText(/\bopen\b/i)).first(),
  ).toBeVisible({ timeout: 10_000 });

  // The direct cancel button is gone; the governed affordance is shown instead.
  await expect(page.getByRole('button', { name: 'Propose Cancel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel Launch' })).toHaveCount(0);

  // Raise the signed CANCEL_LAUNCH proposal. 1-of-1 committee → it executes immediately.
  await page.getByRole('button', { name: 'Propose Cancel' }).click();
  await page.getByRole('button', { name: 'Sign & Raise' }).click();

  // The executed cancel transitions the launch to CANCELED.
  await expect(page.getByText(/CANCELED/i).first()).toBeVisible({ timeout: 15_000 });
});
