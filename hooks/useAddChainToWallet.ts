import { useState, useCallback } from 'react';
import { useWalletManager } from '@interchain-kit/react';
import { getLaunchIdChainHint } from '@/api/generated/launches/launches';
import { buildChainSuggestion, ChainHint } from '@/utils/chainSuggestion';

export interface UseAddChainToWalletResult {
  addChain: () => Promise<void>;
  isPending: boolean;
  isRegistered: boolean;
  /** The chain hint returned by the backend — available once isRegistered is true. */
  hint: ChainHint | null;
  error: Error | null;
}

/**
 * Fetches the chain-hint for a launch (authenticated — via the shared API client, so the
 * Bearer token is attached and a 401 triggers logout) and registers the chain with the
 * WalletManager + all connected wallet extensions via experimentalSuggestChain.
 *
 * `isRegistered` becomes true once addChains() completes (chain is known to interchain-kit).
 * Any useChain(chainName) call must be gated on isRegistered to avoid ChainNameNotExist errors.
 * Use `hint.chain_name` as the chainName argument to useChain.
 */
export function useAddChainToWallet(launchId: string): UseAddChainToWalletResult {
  const store = useWalletManager();
  const [isPending, setIsPending] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [hint, setHint] = useState<ChainHint | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const addChain = useCallback(async () => {
    setIsPending(true);
    setError(null);
    try {
      const raw = await getLaunchIdChainHint(launchId);
      // The generated model types every field optional; coordd always returns them for a valid
      // hint, so narrow explicitly and fail loudly if any is missing rather than build a
      // half-undefined suggestion.
      if (!raw.chain_id || !raw.chain_name || !raw.bech32_prefix || !raw.denom) {
        throw new Error('chain-hint response missing required fields');
      }
      const fetchedHint: ChainHint = {
        chain_id: raw.chain_id,
        chain_name: raw.chain_name,
        bech32_prefix: raw.bech32_prefix,
        denom: raw.denom,
      };
      const { chain, assetList } = buildChainSuggestion(fetchedHint);

      // Register chain in interchain-kit's internal store.
      await store.addChains([chain], [assetList]);

      // addChains does NOT call experimentalSuggestChain on the live wallet extension.
      // We must do it explicitly so Keplr/Leap actually know about the chain.
      // Iterate all wallets and ignore errors for wallets that aren't installed.
      await Promise.allSettled(
        (store.wallets as Array<{ addSuggestChain: (id: string) => Promise<void> }>)
          .map((w) => w.addSuggestChain(fetchedHint.chain_id))
      );

      setHint(fetchedHint);
      setIsRegistered(true);
    } catch (err) {
      // getLaunchIdChainHint throws coordd's error envelope ({ error: { message } }) — a plain
      // object, not an Error — on non-2xx; surface its message, else fall back for real Errors.
      // (The unauthenticated landing shows a uniform non-leaking prompt instead of this message.)
      const message =
        err instanceof Error
          ? err.message
          : ((err as { error?: { message?: string } })?.error?.message ?? String(err));
      setError(new Error(message));
    } finally {
      setIsPending(false);
    }
  }, [launchId, store]);

  return { addChain, isPending, isRegistered, hint, error };
}