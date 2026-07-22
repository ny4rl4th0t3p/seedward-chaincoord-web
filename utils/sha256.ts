import { sha256 } from '@cosmjs/crypto';

/**
 * Lowercase-hex SHA-256 of a byte buffer, matching coordd's genesis/allocation digest encoding.
 *
 * Uses the native SubtleCrypto when available, but falls back to a pure-JS SHA-256 when it isn't:
 * `crypto.subtle` exists only in **secure contexts** (HTTPS / localhost), and the demo is often
 * served over a plain-http origin (e.g. an IP), where it is `undefined` — the same insecure-origin
 * gap that bit `crypto.randomUUID`. Without the fallback, genesis-hash verification throws
 * "Cannot read properties of undefined (reading 'digest')".
 */
export async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  const digest = subtle
    ? new Uint8Array(await subtle.digest('SHA-256', buffer))
    : sha256(new Uint8Array(buffer));
  return Array.from(digest)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
