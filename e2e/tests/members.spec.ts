import { test, expect } from '../fixtures/test';
import { createLaunch } from '../helpers/launch';
import { validator } from '../fixtures/keypairs';

// K.9 — Members allowlist (per-launch, committee-gated add/remove). Distinct from the ADMIN
// coordinator allowlist (admin.spec) — this controls who can see a private launch and submit.

test('K.9.1 add a member → appears; remove with confirm → gone', async ({ page }) => {
  await createLaunch(page, { chainName: 'k91chain', chainId: 'k91-1' });

  const memberAddr = validator().address('cosmos');

  await page.getByPlaceholder('cosmos1… hot address').fill(memberAddr);
  await page.getByPlaceholder(/Acme Validators/).fill('Test Validator');
  await page.getByRole('button', { name: 'Add member' }).click();

  // Member row appears (by label).
  await expect(page.getByText('Test Validator', { exact: true })).toBeVisible({ timeout: 10_000 });

  // Two-step confirm remove.
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('Remove?')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();

  await expect(page.getByText('Test Validator', { exact: true })).not.toBeVisible({ timeout: 10_000 });
});

test('K.9.2 add member requires an address', async ({ page }) => {
  await createLaunch(page, { chainName: 'k92chain', chainId: 'k92-1' });

  await page.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByText('Address is required.')).toBeVisible();
});
