import { useChainStore, chainStore } from '@/contexts/chain';

describe('chain store', () => {
  it('starts with an empty selected chain', () => {
    expect(useChainStore.getState().selectedChain).toBe('');
  });

  it('setSelectedChain updates the store state', () => {
    chainStore.setSelectedChain('cosmoshub');
    expect(useChainStore.getState().selectedChain).toBe('cosmoshub');
  });
});
