import { test, expect } from '../fixtures/test';
import { submitJoinFlow } from '../helpers/join';

// K.11 — Proposal deep-link detail page (GET /launch/{id}/proposal/{propId}).

test('K.11.1 raise a proposal → open its permalink → detail page renders', async ({ browser }) => {
  test.setTimeout(90_000);
  const flow = await submitJoinFlow(browser, 'kpd');
  const page = flow.coordPage;

  // Raise an APPROVE_VALIDATOR proposal (1-of-1 threshold → auto-executes).
  const approveBtn = page.getByRole('button', { name: /approve/i }).first();
  await approveBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await approveBtn.click();
  await page.getByRole('button', { name: /sign & raise/i }).click();
  await expect(page.getByText('EXECUTED', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  // Reload so the Proposals list is fresh, then open the proposal's permalink.
  await page.reload();
  await page.getByRole('link', { name: /permalink/i }).first().click();

  await expect(page).toHaveURL(/\/launch\/[a-f0-9-]{36}\/proposal\/[a-f0-9-]{36}/, { timeout: 10_000 });
  // The read-only detail page shows the action type, status, and a back link.
  await expect(page.getByText('APPROVE_VALIDATOR')).toBeVisible();
  await expect(page.getByText('EXECUTED', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /back to launch/i })).toBeVisible();

  await flow.close();
});
