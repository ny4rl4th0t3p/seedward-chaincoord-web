import { type Browser, type Page, expect } from '@playwright/test';
import { validator } from '../fixtures/keypairs';
import { createLaunch } from './launch';
import { loginAs } from './auth';
import { installValidatorWalletStub } from './wallet-stub';
import { makeSignedGentx } from './gentx';

export interface JoinFlow {
  launchId: string;
  /** Coordinator page, reloaded and positioned on the launch detail with the pending request. */
  coordPage: Page;
  /** Tears down both browser contexts. */
  close: () => Promise<void>;
}

/**
 * The shared setup for tests that need a pending join request: a coordinator creates + opens a
 * launch (with the validator pre-added to the members allowlist), then the validator submits a
 * real signed gentx (PENDING). Faithful extraction of validator.spec K.5 steps 1–2.
 *
 * Pass a distinct short bech32 prefix per test to keep chain_id unique across launches.
 */
export async function submitJoinFlow(browser: Browser, prefix: string): Promise<JoinFlow> {
  const chainId = `${prefix}chain-1`;
  const denom = `u${prefix}`;

  // ── Coordinator: create + open the launch ─────────────────────────────────────
  const coordCtx = await browser.newContext();
  const coordPage = await coordCtx.newPage();
  const launchId = await createLaunch(coordPage, {
    chainName: `${prefix}chain`,
    chainId,
    bech32Prefix: prefix,
    denom,
    // v1 join requires prior membership — grant the validator see-set access up front.
    members: [validator().address(prefix)],
  });

  // Initial genesis ref is required before OpenWindow (server auto-publishes from DRAFT + SHA).
  await coordPage.getByPlaceholder('https://files.example.com/genesis.json').fill('https://example.com/genesis.json');
  await coordPage.getByPlaceholder('64-character hex digest').fill('a'.repeat(64));
  await coordPage.getByRole('button', { name: /submit genesis reference/i }).click();
  await expect(coordPage.getByText(/genesis reference saved/i)).toBeVisible({ timeout: 10_000 });

  await coordPage.getByRole('button', { name: /open application window/i }).click();
  await expect(
    coordPage.getByText(/WINDOW_OPEN/i).or(coordPage.getByText(/\bopen\b/i)).first(),
  ).toBeVisible({ timeout: 10_000 });

  // ── Validator: sign in + submit a signed gentx ────────────────────────────────
  const valCtx = await browser.newContext();
  const valPage = await valCtx.newPage();
  await installValidatorWalletStub(valPage, validator(), prefix);
  await loginAs(valPage, validator(), { bech32Prefix: prefix, navigateTo: `/launch/${launchId}` });

  const gentx = await makeSignedGentx({ keypair: validator(), chainId, bech32Prefix: prefix, denom });
  await valPage.getByPlaceholder(/1\.2\.3\.4/i).fill('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@1.2.3.4:26656');
  await valPage.getByPlaceholder(/MsgCreateValidator/).fill(gentx);
  await valPage.getByRole('button', { name: /submit join request/i }).click();
  await expect(valPage.getByText(/pending/i)).toBeVisible({ timeout: 10_000 });

  // Reload the coordinator so the queue shows the new request.
  await coordPage.reload();

  return {
    launchId,
    coordPage,
    close: async () => {
      await coordCtx.close();
      await valCtx.close();
    },
  };
}
