import { paramsFromRecord } from '@/hooks/useGentxValidator';

// The WASM load/instantiate path is exercised by the Playwright e2e in a real browser (jsdom cannot
// run the Go WASM runtime). Here we cover the pure record → gentxvalidate.Params field mapping, whose
// silent breakage would weaken the advisory checks without any visible error.
describe('paramsFromRecord', () => {
  it('maps chain-record fields to the gentxvalidate Params tags', () => {
    expect(
      paramsFromRecord({
        chain_id: 'foo-1',
        denom: 'ufoo',
        bech32_prefix: 'foo',
        min_self_delegation: '1000000',
        max_commission_rate: '0.200000000000000000',
        max_commission_change_rate: '0.010000000000000000',
      }),
    ).toEqual({
      chain_id: 'foo-1',
      bond_denom: 'ufoo', // denom → bond_denom
      bech32_prefix: 'foo',
      min_self_delegation: '1000000',
      min_commission_rate: '', // not carried on the record → "no floor"
      max_commission_rate: '0.200000000000000000',
      max_commission_change_rate: '0.010000000000000000',
      max_moniker_len: 0, // 0 → SDK default
    });
  });

  it('defaults every field for an undefined record', () => {
    expect(paramsFromRecord(undefined)).toEqual({
      chain_id: '',
      bond_denom: '',
      bech32_prefix: '',
      min_self_delegation: '',
      min_commission_rate: '',
      max_commission_rate: '',
      max_commission_change_rate: '',
      max_moniker_len: 0,
    });
  });
});
