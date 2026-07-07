import { sha256 } from '@cosmjs/crypto';
import { fromBase64, toBase64 } from '@cosmjs/encoding';
import { type TestKeypair } from '../fixtures/keypairs';

// Builds a real, cryptographically-signed SIGN_MODE_DIRECT MsgCreateValidator gentx that passes
// the backend's gentxvalidate (seedward-libs/gentxvalidate). The sign-bytes reconstruction is a
// byte-for-byte port of gentxvalidate/signdoc.go's hand-rolled protobuf encoder — the emitted JSON
// and the signed bytes are derived from the same field values, so they stay consistent by
// construction. The signer key must be the same key whose valoper address is validator_address
// (CheckOperatorAddress derives RIPEMD160(SHA256(pubkey)) and compares).

const MSG_TYPE = '/cosmos.staking.v1beta1.MsgCreateValidator';
const SECP256K1_PUBKEY_TYPE = '/cosmos.crypto.secp256k1.PubKey';
const ED25519_PUBKEY_TYPE = '/cosmos.crypto.ed25519.PubKey';
const SIGN_MODE_DIRECT = 1;

// A fixed, valid 32-byte ed25519 consensus pubkey (only checked for ed25519 type + 32-byte length).
const CONSENSUS_PUBKEY_B64 = 'f5DzEhtQbnmXE/WZQsX+I8RljPdEU0u0ncVGtniFyEM=';

// ── minimal protobuf wire writers (mirror signdoc.go appendXField) ─────────────

const utf8 = (s: string) => new TextEncoder().encode(s);

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// Unsigned LEB128 varint. All values here (field tags, lengths, gas_limit, mode) fit in 32 bits.
function varint(n: number): Uint8Array {
  const bytes: number[] = [];
  let v = n;
  do {
    let b = v & 0x7f;
    v = Math.floor(v / 128);
    if (v > 0) b |= 0x80;
    bytes.push(b);
  } while (v > 0);
  return new Uint8Array(bytes);
}

const tag = (field: number, wire: number) => varint((field << 3) | wire);
const bytesField = (field: number, val: Uint8Array) => concat(tag(field, 2), varint(val.length), val);
const stringField = (field: number, s: string) => bytesField(field, utf8(s));
const varintField = (field: number, n: number) => concat(tag(field, 0), varint(n));

// LegacyDec wire form: "0.10" → "100000000000000000" (value ×10^18, no dot, no leading zeros).
function legacyDecWire(s: string): Uint8Array {
  const [intPart, fracRaw = ''] = s.split('.');
  const frac = (fracRaw + '0'.repeat(18)).slice(0, 18);
  const scaled = (intPart + frac).replace(/^0+/, '') || '0';
  return utf8(scaled);
}

// google.protobuf.Any{ type_url=1, value=2 }
function encodeAny(typeUrl: string, value: Uint8Array): Uint8Array {
  return concat(typeUrl ? stringField(1, typeUrl) : new Uint8Array(), value.length ? bytesField(2, value) : new Uint8Array());
}

interface GentxParams {
  keypair: TestKeypair;
  chainId: string;
  bech32Prefix: string;
  denom: string;
  moniker?: string;
  amount?: string;
  rate?: string;
  maxRate?: string;
  maxChangeRate?: string;
  minSelfDelegation?: string;
}

/**
 * Builds and signs a gentx JSON string for the given launch. commission defaults sit at/under the
 * create-launch form's ceilings (max_rate 0.20, max_change 0.01, min_self_delegation 1).
 */
export async function makeSignedGentx(p: GentxParams): Promise<string> {
  const moniker = p.moniker ?? 'e2e-validator';
  const amount = p.amount ?? '1000000';
  const rate = p.rate ?? '0.100000000000000000';
  const maxRate = p.maxRate ?? '0.200000000000000000';
  const maxChangeRate = p.maxChangeRate ?? '0.010000000000000000';
  const minSelfDelegation = p.minSelfDelegation ?? '1';

  const validatorAddress = p.keypair.valoperAddress(p.bech32Prefix);
  const secpPubKey = fromBase64(p.keypair.pubKeyB64); // 33-byte compressed
  const consPubKey = fromBase64(CONSENSUS_PUBKEY_B64); // 32-byte ed25519

  // ── sign-bytes reconstruction (mirror signdoc.go exactly) ────────────────────

  // MsgCreateValidator{ description=1, commission=2, min_self_delegation=3,
  //   delegator_address=4 (empty→omit), validator_address=5, pubkey=6, value=7 }
  const description = stringField(1, moniker); // moniker=1; other Description fields empty→omitted
  const commission = concat(
    bytesField(1, legacyDecWire(rate)),
    bytesField(2, legacyDecWire(maxRate)),
    bytesField(3, legacyDecWire(maxChangeRate)),
  );
  const value = concat(stringField(1, p.denom), bytesField(2, utf8(amount))); // Coin{denom=1, amount=2 (Int)}
  const consAny = encodeAny(ED25519_PUBKEY_TYPE, bytesField(1, consPubKey)); // PubKey{key=1}
  const msg = concat(
    bytesField(1, description),
    bytesField(2, commission),
    bytesField(3, utf8(minSelfDelegation)), // Int customtype → ASCII digits
    stringField(5, validatorAddress),
    bytesField(6, consAny),
    bytesField(7, value),
  );
  const bodyBytes = bytesField(1, encodeAny(MSG_TYPE, msg)); // TxBody{ messages=1 }; memo/timeout omitted

  // AuthInfo{ signer_infos=1, fee=2 }
  const pubKeyAny = encodeAny(SECP256K1_PUBKEY_TYPE, bytesField(1, secpPubKey));
  const modeInfo = bytesField(1, varintField(1, SIGN_MODE_DIRECT)); // ModeInfo{ single=1{ mode=1 } }
  const signerInfo = concat(bytesField(1, pubKeyAny), bytesField(2, modeInfo)); // sequence=0 → omitted
  const fee = varintField(2, 200000); // Fee{ gas_limit=2 }; no coins/payer/granter
  const authInfoBytes = concat(bytesField(1, signerInfo), bytesField(2, fee));

  // SignDoc{ body_bytes=1, auth_info_bytes=2, chain_id=3, account_number=4 (0→omit) }
  const signDoc = concat(bytesField(1, bodyBytes), bytesField(2, authInfoBytes), stringField(3, p.chainId));

  const signature = toBase64(await p.keypair.signDigest(sha256(signDoc)));

  // ── matching JSON (same field values → gentxvalidate re-derives identical sign bytes) ──
  return JSON.stringify({
    body: {
      messages: [
        {
          '@type': MSG_TYPE,
          description: { moniker },
          commission: { rate, max_rate: maxRate, max_change_rate: maxChangeRate },
          min_self_delegation: minSelfDelegation,
          delegator_address: '',
          validator_address: validatorAddress,
          pubkey: { '@type': ED25519_PUBKEY_TYPE, key: CONSENSUS_PUBKEY_B64 },
          value: { denom: p.denom, amount },
        },
      ],
      memo: '',
      timeout_height: '0',
      extension_options: [],
      non_critical_extension_options: [],
    },
    auth_info: {
      signer_infos: [
        {
          public_key: { '@type': SECP256K1_PUBKEY_TYPE, key: p.keypair.pubKeyB64 },
          mode_info: { single: { mode: 'SIGN_MODE_DIRECT' } },
          sequence: '0',
        },
      ],
      fee: { amount: [], gas_limit: '200000', payer: '', granter: '' },
    },
    signatures: [signature],
  });
}
