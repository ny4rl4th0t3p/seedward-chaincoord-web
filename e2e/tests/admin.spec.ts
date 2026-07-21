import { test, expect } from '../fixtures/test';
import { coordinator, validator } from '../fixtures/keypairs';
import { loginAs, invalidateJwt } from '../helpers/auth';

// K.7 — Admin panel

test('K.7.1 /admin shows the auth wall when unauthenticated', async ({ page }) => {
  await page.goto('/admin');
  // The app shell gates unauthenticated requests — the admin page never mounts. (An authenticated
  // *non-admin* seeing the "not an admin" guard is exercised by the admin.tsx unit test, which can
  // mock the auth state directly; e2e can't easily mint a non-admin session here.)
  await expect(page.getByText(/you need to be signed in to view this section/i)).toBeVisible({ timeout: 10_000 });
});

test('K.7.2 admin address → allowlist section visible', async ({ page }) => {
  await loginAs(page, coordinator(), { navigateTo: '/admin' });
  await expect(page.getByText(/coordinator allowlist/i)).toBeVisible({ timeout: 10_000 });
});

test('K.7.3 add address to allowlist → appears in list', async ({ page }) => {
  await loginAs(page, coordinator(), { navigateTo: '/admin' });
  await expect(page.getByText(/coordinator allowlist/i)).toBeVisible({ timeout: 10_000 });

  const newAddr = validator().address('cosmos');
  const addInput = page.getByPlaceholder(/cosmos1/i).first();
  await addInput.fill(newAddr);
  // Wait for the add to *commit* (the POST), then reload for a fresh list read. We wait on the
  // mutation rather than the in-page refetch because a slow backend can abort the background GET
  // ("context canceled"), leaving the list stale; a reload re-reads it cleanly.
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/admin/coordinators') && r.request().method() === 'POST'),
    page.getByRole('button', { name: /^add$/i }).click(),
  ]);
  await page.reload();
  await expect(page.getByText(newAddr)).toBeVisible({ timeout: 20_000 });
});

test('K.7.4 remove address from allowlist → removed from list', async ({ page }) => {
  await loginAs(page, coordinator(), { navigateTo: '/admin' });
  await expect(page.getByText(/coordinator allowlist/i)).toBeVisible({ timeout: 10_000 });

  // Add first — wait for the POST to commit, then reload so the row is present before we target it.
  const targetAddr = validator().address('cosmos');
  const addInput = page.getByPlaceholder(/cosmos1/i).first();
  await addInput.fill(targetAddr);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/admin/coordinators') && r.request().method() === 'POST'),
    page.getByRole('button', { name: /^add$/i }).click(),
  ]);
  await page.reload();
  await expect(page.getByText(targetAddr)).toBeVisible({ timeout: 20_000 });

  // Remove. The address <Text> is inside an inner <Box>; its grandparent is the row that also
  // contains the Remove button. Wait for the DELETE to commit, then reload to confirm removal.
  const row = page.getByText(targetAddr, { exact: true }).locator('..').locator('..');
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/admin/coordinators') && r.request().method() === 'DELETE'),
    row.getByRole('button', { name: /remove/i }).click(),
  ]);
  await page.reload();
  await expect(page.getByText(targetAddr)).not.toBeVisible({ timeout: 20_000 });
});

test('K.7.5 session revocation input accepts an address and calls DELETE', async ({ page }) => {
  await loginAs(page, coordinator(), { navigateTo: '/admin' });
  await expect(page.getByText(/session revocation/i)).toBeVisible({ timeout: 10_000 });

  const revokeInput = page.getByPlaceholder(/cosmos1/i).nth(1);
  await revokeInput.fill(coordinator().address('cosmos'));
  await page.getByRole('button', { name: /revoke sessions/i }).click();

  // Success: the confirmation message appears (204 response). Assert the positive outcome rather
  // than "no /error/i visible" — the Log Level section renders an "error" button that would match.
  await expect(page.getByText(/sessions revoked for/i)).toBeVisible({ timeout: 5_000 });

  // Revocation invalidates the cached JWT — subsequent tests need a fresh one.
  await invalidateJwt(coordinator(), 'cosmos');
});

test('K.7.6 log level → change persists on the running server', async ({ page }) => {
  await loginAs(page, coordinator(), { navigateTo: '/admin' });
  await expect(page.getByText(/log level/i)).toBeVisible({ timeout: 10_000 });

  // Wait for the GET to populate "Current: <level>" (it renders "…" until then — don't assume the
  // start level or race the fetch), then pick a different target to switch to.
  const currentLabel = page.getByText(/Current:\s*(trace|debug|info|warn|error)\b/);
  await expect(currentLabel).toBeVisible({ timeout: 15_000 });
  const current = (await currentLabel.textContent())!.match(/(trace|debug|info|warn|error)/)![1];
  const target = current === 'debug' ? 'info' : 'debug';

  const targetButton = page.getByRole('button', { name: target, exact: true });
  await expect(targetButton).toBeEnabled();
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/admin/log-level') && r.request().method() === 'POST'),
    targetButton.click(),
  ]);
  await expect(page.getByText(new RegExp(`log level set to ${target}`, 'i'))).toBeVisible({ timeout: 5_000 });

  // The change is in-memory server state: a fresh page read must report the new level. Assert on the
  // GET body directly (registered before the reload) rather than polling the button's disabled state,
  // so a slow refetch on the cold server can't race the assertion.
  const reloadedGet = page.waitForResponse(
    (r) => r.url().includes('/admin/log-level') && r.request().method() === 'GET' && r.ok(),
    { timeout: 30_000 },
  );
  await page.reload();
  expect((await (await reloadedGet).json()).level).toBe(target);
});
