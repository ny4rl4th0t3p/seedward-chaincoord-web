import { test, expect } from '../fixtures/test';
import { createLaunch } from '../helpers/launch';

// K.8 — Allocation files (committee-gated, attestor mode: register an external URL + SHA-256).
// Each test creates a fresh launch to keep state independent.

test('K.8.1 register an attestor allocation → PENDING file with a download action', async ({ page }) => {
  await createLaunch(page, { chainName: 'k81chain', chainId: 'k81-1' });

  // Allocation Files section — default type 'accounts'; attestor mode = URL + SHA-256.
  await page
    .getByPlaceholder('https://files.example.com/accounts.csv')
    .fill('https://files.example.com/accounts.csv');
  await page.getByPlaceholder('64-char hex SHA-256 digest').fill('b'.repeat(64));
  await page.getByRole('button', { name: /register allocation file/i }).click();

  await expect(page.getByText(/allocation file registered/i)).toBeVisible({ timeout: 10_000 });
  // The registered file now lists with its (PENDING) status and a download action.
  await expect(page.getByText('PENDING', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeVisible();
});

test('K.8.2 allocation register requires a URL', async ({ page }) => {
  await createLaunch(page, { chainName: 'k82chain', chainId: 'k82-1' });

  await page.getByRole('button', { name: /register allocation file/i }).click();
  await expect(page.getByText('URL is required.')).toBeVisible();
});
