import { sameAccount } from '@/utils/address';
import { toBech32, fromBech32 } from '@cosmjs/encoding';

// A valid 20-byte account, rendered under two different HRPs → same account.
const bytes = fromBech32('cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu').data;
const cosmosAddr = toBech32('cosmos', bytes);
const chainAddr = toBech32('mychain', bytes);

describe('sameAccount', () => {
  it('matches the same account across different bech32 prefixes', () => {
    expect(sameAccount(cosmosAddr, chainAddr)).toBe(true);
  });

  it('does not match different accounts', () => {
    const otherBytes = Uint8Array.from(bytes);
    otherBytes[0] ^= 0xff; // flip a byte → a different account
    expect(sameAccount(cosmosAddr, toBech32('cosmos', otherBytes))).toBe(false);
  });

  it('returns false for missing input', () => {
    expect(sameAccount(undefined, cosmosAddr)).toBe(false);
    expect(sameAccount(cosmosAddr, null)).toBe(false);
  });

  it('falls back to raw equality for non-bech32 input', () => {
    expect(sameAccount('not-an-address', 'not-an-address')).toBe(true);
    expect(sameAccount('not-an-address', 'other')).toBe(false);
  });
});
