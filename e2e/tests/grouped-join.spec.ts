import { test, expect } from '../fixtures/test';
import { submitJoinFlow } from '../helpers/join';

// K.10 — Grouped-by-submitter review view of the join queue (GET /join/grouped).

test('K.10.1 toggle Group by submitter → applications grouped by submitter', async ({ browser }) => {
  test.setTimeout(90_000);
  const flow = await submitJoinFlow(browser, 'kgj');
  const page = flow.coordPage;

  // The flat queue shows the pending request; switch to the grouped review view.
  await page.getByRole('button', { name: 'Group by submitter' }).click();

  await expect(page.getByText('Applications by submitter')).toBeVisible({ timeout: 10_000 });
  // The grouped card carries the per-submitter aggregates (count + self-delegation) and a way back.
  await expect(page.getByText(/self-delegation/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Flat list' })).toBeVisible();

  await flow.close();
});
