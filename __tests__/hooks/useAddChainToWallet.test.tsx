import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useAddChainToWallet } from '@/hooks/useAddChainToWallet';

// Mock useWalletManager — the hook needs addChains and wallets from the store.
// wallets is empty: no extensions present in the test environment, so the
// Promise.allSettled over addSuggestChain calls resolves immediately.
const mockAddChains = jest.fn().mockResolvedValue(undefined);
jest.mock('@interchain-kit/react', () => ({
  useWalletManager: () => ({ addChains: mockAddChains, wallets: [] }),
}));

const HINT = {
  chain_id: 'mychain-1',
  chain_name: 'mychain',
  bech32_prefix: 'mychain',
  denom: 'umychain',
};

function mockFetchHint(hint = HINT) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => hint,
  } as Response);
}

describe('useAddChainToWallet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts with isRegistered=false, hint=null', () => {
    const { result } = renderHook(() => useAddChainToWallet('launch-123'));
    expect(result.current.isRegistered).toBe(false);
    expect(result.current.hint).toBeNull();
    expect(result.current.isPending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetches chain-hint from the correct URL', async () => {
    mockFetchHint();
    const { result } = renderHook(() => useAddChainToWallet('launch-abc'));

    await act(async () => {
      await result.current.addChain();
    });

    // Routed through the generated client's shared mutator, so fetch gets (url, {method, headers}).
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/launch/launch-abc/chain-hint'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('sets isRegistered=true and exposes hint after success', async () => {
    mockFetchHint();
    const { result } = renderHook(() => useAddChainToWallet('launch-123'));

    await act(async () => {
      await result.current.addChain();
    });

    expect(result.current.isRegistered).toBe(true);
    expect(result.current.hint).toEqual(HINT);
    expect(result.current.error).toBeNull();
  });

  it('calls addChains with a chain built from the hint', async () => {
    mockFetchHint();
    const { result } = renderHook(() => useAddChainToWallet('launch-123'));

    await act(async () => {
      await result.current.addChain();
    });

    expect(mockAddChains).toHaveBeenCalledTimes(1);
    const [chains, assetLists] = mockAddChains.mock.calls[0];
    expect(chains[0].chainId).toBe('mychain-1');
    expect(chains[0].chainName).toBe('mychain');
    expect(assetLists[0].chainName).toBe('mychain');
  });

  it('sets error and keeps isRegistered=false on fetch failure', async () => {
    // coordd returns its nested error envelope on non-2xx; the shared mutator throws it and
    // the hook surfaces `.error.message`.
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: 'not_found', message: 'launch not found' } }),
    } as Response);
    const { result } = renderHook(() => useAddChainToWallet('launch-bad'));

    await act(async () => {
      await result.current.addChain();
    });

    expect(result.current.isRegistered).toBe(false);
    expect(result.current.hint).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toContain('launch not found');
  });

  it('sets error and keeps isRegistered=false when addChains throws', async () => {
    mockFetchHint();
    mockAddChains.mockRejectedValueOnce(new Error('wallet rejected'));
    const { result } = renderHook(() => useAddChainToWallet('launch-123'));

    await act(async () => {
      await result.current.addChain();
    });

    expect(result.current.isRegistered).toBe(false);
    expect(result.current.error?.message).toBe('wallet rejected');
  });

  it('isPending is true during the async call', async () => {
    let resolveFetch!: (v: unknown) => void;
    global.fetch = jest.fn().mockReturnValue(
      new Promise((res) => { resolveFetch = res; }),
    );
    const { result } = renderHook(() => useAddChainToWallet('launch-123'));

    act(() => { result.current.addChain(); });
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      resolveFetch({ ok: true, json: async () => HINT });
    });
    expect(result.current.isPending).toBe(false);
  });
});