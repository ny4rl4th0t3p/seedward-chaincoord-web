/**
 * Builds the canonical JSON payload that must be passed to signArbitrary.
 *
 * The field order MUST be alphabetical (challenge → nonce → operator_address → timestamp)
 * to match canonicaljson.MarshalForSigning on the Go server. The nonce is part of the
 * signed bytes (replay protection) — it must be the same nonce sent in the verify request.
 * No whitespace. Timestamp must be RFC 3339 UTC with second precision.
 *
 * Pinned by the contract test in internal/application/services/auth_contract_test.go.
 */
export function buildAuthPayload(
  address: string,
  challenge: string,
  nonce: string,
  timestamp: string,
): string {
  // JSON.stringify preserves insertion order — keys inserted in alphabetical order.
  return JSON.stringify({
    challenge,
    nonce,
    operator_address: address,
    timestamp,
  });
}

/** Returns current UTC time as RFC 3339 with second precision (no milliseconds). */
export function nowTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Generates a random nonce for replay protection. */
export function generateNonce(): string {
  // crypto.randomUUID() exists only in a secure context (HTTPS or localhost/127.0.0.1). Served
  // over plain HTTP on a LAN IP it's undefined, so fall back to a UUIDv4 built from
  // getRandomValues — the one Crypto method that is also available in insecure contexts.
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}