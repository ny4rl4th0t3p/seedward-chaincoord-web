import { fromBech32, toBech32, fromHex } from '@cosmjs/encoding';

/**
 * True if two bech32 addresses encode the **same account** (the same 20-byte
 * RIPEMD160(SHA256(pubkey))) regardless of their HRP/prefix.
 *
 * coordd is HRP-independent: a coordinator authenticates with e.g. `cosmos1…`, but a launch renders
 * its committee / lead / signer / validator addresses in the *chain's own* bech32 prefix (`mychain1…`).
 * A raw string compare (`a === b`) therefore wrongly reports "not me" for the very common case where
 * the auth prefix differs from the launch prefix. Decode both and compare the underlying account bytes.
 *
 * Returns false for missing input; falls back to a raw string compare if either address isn't
 * decodable bech32 (production addresses always are — this only guards odd/test inputs). Never throws.
 */
export function sameAccount(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  try {
    const da = fromBech32(a).data;
    const db = fromBech32(b).data;
    if (da.length !== db.length) return false;
    return da.every((byte, i) => byte === db[i]);
  } catch {
    return a === b;
  }
}

/**
 * Render a stored account — canonical account hex (as the global coordinator allowlist stores) or a
 * bech32 address — as a bech32 address under `prefix`. Beautifies HRP-independent account keys for
 * display; the account bytes reproduce the exact bech32 form the operator originally entered. Falls
 * back to the raw value if it is neither decodable bech32 nor hex. Never throws.
 */
export function accountToBech32(value: string | undefined | null, prefix: string): string {
  if (!value) return '';
  try {
    return toBech32(prefix, fromBech32(value).data); // already bech32 → re-encode under prefix
  } catch {
    try {
      return toBech32(prefix, fromHex(value)); // canonical account hex → bech32
    } catch {
      return value;
    }
  }
}

/** The HRP/prefix of a bech32 address, or `fallback` if it is missing or not decodable. */
export function bech32Prefix(addr?: string | null, fallback = 'cosmos'): string {
  if (!addr) return fallback;
  try {
    return fromBech32(addr).prefix;
  } catch {
    return fallback;
  }
}
