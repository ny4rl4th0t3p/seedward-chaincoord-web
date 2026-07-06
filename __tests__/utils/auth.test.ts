import { buildAuthPayload, nowTimestamp, generateNonce } from '@/utils/auth';

// ── buildAuthPayload ─────────────────────────────────────────────────────────
//
// These values are taken directly from the Go contract test:
//   internal/application/services/auth_contract_test.go
//   TestVerifyChallengeInput_CanonicalSigningBytes
//
// If this test breaks, the Go contract test must be checked first — the two
// must stay byte-identical.

describe('buildAuthPayload', () => {
  const address = 'cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu';
  const challenge = 'dGVzdC1jaGFsbGVuZ2U=';
  const nonce = 'unique-nonce-abc';
  const timestamp = '2026-01-01T00:00:00Z';

  it('produces byte-identical output to canonicaljson.MarshalForSigning (Go contract)', () => {
    const got = buildAuthPayload(address, challenge, nonce, timestamp);
    const want =
      '{"challenge":"dGVzdC1jaGFsbGVuZ2U=","nonce":"unique-nonce-abc","operator_address":"cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu","timestamp":"2026-01-01T00:00:00Z"}';
    expect(got).toBe(want);
  });

  it('keys are in alphabetical order: challenge → nonce → operator_address → timestamp', () => {
    const payload = buildAuthPayload(address, challenge, nonce, timestamp);
    const parsed = JSON.parse(payload);
    const keys = Object.keys(parsed);
    expect(keys).toEqual(['challenge', 'nonce', 'operator_address', 'timestamp']);
  });

  it('includes nonce (signed for replay protection) but not pubkey_b64 or signature', () => {
    const payload = buildAuthPayload(address, challenge, nonce, timestamp);
    expect(payload).toContain('nonce');
    expect(payload).not.toContain('pubkey_b64');
    expect(payload).not.toContain('signature');
  });

  it('contains no whitespace', () => {
    const payload = buildAuthPayload(address, challenge, nonce, timestamp);
    expect(payload).not.toMatch(/\s/);
  });

  it('preserves the exact challenge value without re-encoding', () => {
    const payload = buildAuthPayload(address, 'my-challenge-xyz', nonce, timestamp);
    expect(JSON.parse(payload).challenge).toBe('my-challenge-xyz');
  });

  it('preserves the exact operator_address value', () => {
    const payload = buildAuthPayload('cosmos1abc', challenge, nonce, timestamp);
    expect(JSON.parse(payload).operator_address).toBe('cosmos1abc');
  });
});

// ── nowTimestamp ─────────────────────────────────────────────────────────────

describe('nowTimestamp', () => {
  it('matches RFC 3339 UTC format with second precision', () => {
    const ts = nowTimestamp();
    // e.g. "2026-04-17T12:34:56Z" — no milliseconds, Z suffix
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('does not include milliseconds', () => {
    const ts = nowTimestamp();
    expect(ts).not.toMatch(/\.\d+Z$/);
  });

  it('ends with Z (UTC)', () => {
    const ts = nowTimestamp();
    expect(ts.endsWith('Z')).toBe(true);
  });

  it('is parseable as a valid date', () => {
    const ts = nowTimestamp();
    const d = new Date(ts);
    expect(isNaN(d.getTime())).toBe(false);
  });
});

// ── generateNonce ────────────────────────────────────────────────────────────

describe('generateNonce', () => {
  it('returns a non-empty string', () => {
    expect(typeof generateNonce()).toBe('string');
    expect(generateNonce().length).toBeGreaterThan(0);
  });

  it('returns a different value each call', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
  });
});