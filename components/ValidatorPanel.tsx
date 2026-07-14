import { useState, useCallback, useEffect, useMemo } from 'react';
import { Box, Text } from '@interchain-ui/react';
import type { StatefulWallet } from '@interchain-kit/react/store/stateful-wallet';
import { Button } from '@/components';
import { buildSignedAction } from '@/utils/signedAction';
import type { ChainHint } from '@/utils/chainSuggestion';
import { useGentxValidator, paramsFromRecord, type GentxParams } from '@/hooks/useGentxValidator';
import {
  usePostLaunchIdJoin,
  useGetLaunchIdJoinReqId,
} from '@/api/generated/join-requests/join-requests';
import {
  usePostLaunchIdReady,
  useGetLaunchIdPeers,
} from '@/api/generated/readiness/readiness';
import { authedFetch } from '@/api/authedFetch';
import type {
  ServicesSubmitInput,
  ServicesConfirmInput,
  ApiErrorEnvelope,
  ApiInvariantResultJSON,
  ApiLaunchJSON,
  ApiDashboardJSON,
} from '@/api/generated/model';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Sub-panel UI primitives ───────────────────────────────────────────────────

function PanelCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box borderRadius="8px" border="1px solid" borderColor="$divider" p="20px">
      <Text fontSize="$md" fontWeight="$semibold" attributes={{ mb: '12px' }}>
        {title}
      </Text>
      <Box display="flex" flexDirection="column" gap="8px">
        {children}
      </Box>
    </Box>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text fontSize="$xs" color="$textSecondary" attributes={{ mb: '2px' }}>
      {children}
    </Text>
  );
}

// Minimal styled input wrapper — @interchain-ui/react doesn't expose a plain
// text Input that matches the rest of the palette, so we inline a basic style.
function TextInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '8px 12px',
        borderRadius: '6px',
        border: '1px solid var(--chakra-colors-divider, #e2e8f0)',
        background: 'transparent',
        color: 'inherit',
        fontSize: '14px',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
      }}
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  disabled,
  rows,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows ?? 6}
      style={{
        width: '100%',
        padding: '8px 12px',
        borderRadius: '6px',
        border: '1px solid var(--chakra-colors-divider, #e2e8f0)',
        background: 'transparent',
        color: 'inherit',
        fontSize: '13px',
        fontFamily: 'monospace',
        resize: 'vertical',
        boxSizing: 'border-box',
      }}
    />
  );
}

// ── H.3 / H.4 — Join Section ──────────────────────────────────────────────────

interface JoinSectionProps {
  launchId: string;
  hint: ChainHint;
  address: string;
  wallet: StatefulWallet;
  signingChainId: string;
  isApproved: boolean;
  params: GentxParams;
}

function JoinSection({ launchId, hint, address, wallet, signingChainId, isApproved, params }: JoinSectionProps) {
  // Form fields — all hooks must come before any conditional returns
  const [gentxRaw, setGentxRaw] = useState('');
  const [peerAddress, setPeerAddress] = useState('');
  const [rpcEndpoint, setRpcEndpoint] = useState('');
  const [memo, setMemo] = useState('');

  // State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [invariants, setInvariants] = useState<ApiInvariantResultJSON[] | null>(null);
  const [joinRequestId, setJoinRequestId] = useState<string | null>(null);

  const submitJoin = usePostLaunchIdJoin();

  // H.4: poll for the join request status once we have an id — react-query drives the interval + dedup.
  const { data: joinRequest, error: pollError } = useGetLaunchIdJoinReqId(
    launchId,
    joinRequestId ?? '',
    { query: { enabled: !!joinRequestId, refetchInterval: 15_000 } },
  );

  // Advisory client-side gentx validation (WASM). Lazy-loads once the gentx field is non-empty; the
  // server (incl. signature) stays authoritative on submit. Load failures degrade silently.
  const gentxTrimmed = gentxRaw.trim();
  const { validate: runLight, ready: validatorReady } = useGentxValidator(gentxTrimmed.length > 0);
  const [advisory, setAdvisory] = useState<ApiInvariantResultJSON[] | null>(null);
  useEffect(() => {
    if (!validatorReady || !gentxTrimmed) {
      setAdvisory(null);
      return;
    }
    const t = setTimeout(() => {
      try {
        JSON.parse(gentxTrimmed);
      } catch {
        setAdvisory(null); // let the existing "must be valid JSON" path handle malformed input
        return;
      }
      setAdvisory(runLight(gentxTrimmed, params));
    }, 400);
    return () => clearTimeout(t);
  }, [gentxTrimmed, validatorReady, runLight, params]);

  // If validator is already approved via dashboard, just show the status card.
  if (isApproved) {
    return (
      <PanelCard title="Join Request">
        <Text fontSize="$sm" color="$textSuccess">
          Your join request has been approved.
        </Text>
      </PanelCard>
    );
  }

  // H.4: show status after submit
  if (joinRequestId) {
    const statusColor: Record<string, string> = {
      PENDING: '$textSecondary',
      APPROVED: '$textSuccess',
      REJECTED: '$textDanger',
    };
    const status = (joinRequest?.status ?? 'PENDING').toUpperCase();
    return (
      <PanelCard title="Join Request Status">
        <Box display="flex" gap="8px" alignItems="center">
          <Text fontSize="$sm" color="$textSecondary">Status:</Text>
          <Text fontSize="$sm" fontWeight="$semibold" color={statusColor[status] ?? '$textSecondary'}>
            {status.toUpperCase()}
          </Text>
        </Box>
        {joinRequest?.rejection_reason && (
          <Text fontSize="$sm" color="$textDanger">
            Reason: {joinRequest.rejection_reason}
          </Text>
        )}
        {pollError && (
          <Text fontSize="$xs" color="$textDanger">
            {pollError.error?.message ?? 'Failed to fetch status'}
          </Text>
        )}
        <Text fontSize="$xs" color="$textSecondary">
          Request ID: {joinRequestId}
        </Text>
        <Text fontSize="$xs" color="$textSecondary">
          Polling every 15 s — refresh this page to check again if you reopen the browser.
        </Text>
      </PanelCard>
    );
  }

  // H.3: join request form
  const handleGentxFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setGentxRaw(text);
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setInvariants(null);

    if (!peerAddress.trim()) {
      setSubmitError('Peer address is required.');
      return;
    }

    let gentxParsed: unknown;
    try {
      gentxParsed = JSON.parse(gentxRaw);
    } catch {
      setSubmitError('gentx must be valid JSON.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        chain_id: hint.chain_id,
        gentx: gentxParsed,
        memo: memo.trim(),
        operator_address: address,
        peer_address: peerAddress.trim(),
        rpc_endpoint: rpcEndpoint.trim(),
      };

      const signed = await buildSignedAction(payload, wallet, signingChainId, address);
      const jr = await submitJoin.mutateAsync({
        id: launchId,
        data: signed as unknown as ServicesSubmitInput,
      });
      setJoinRequestId(jr.id ?? null);
    } catch (err) {
      const env = err as ApiErrorEnvelope & { status?: number };
      // Workstream C: a gentx_invalid 400 carries a per-invariant breakdown — surface the failed checks.
      setInvariants(env.error?.invariants ?? null);
      if (env.status === 409) {
        setSubmitError(
          'You already have a pending join request for this launch. Refresh the page — if you see the join form again, the request ID was lost (browser tab closed). Contact the committee with your operator address to check status.',
        );
      } else {
        setSubmitError(
          env.error?.message ?? (err instanceof Error ? err.message : 'Unexpected error'),
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const failedInvariants = (invariants ?? []).filter((inv) => inv.ok === false);
  const advisoryFailed = (advisory ?? []).filter((inv) => inv.ok === false);

  return (
    <PanelCard title="Submit Join Request">
      <Box display="flex" flexDirection="column" gap="12px">
        <Box>
          <FieldLabel>gentx JSON — upload file or paste below *</FieldLabel>
          <input
            type="file"
            accept=".json"
            onChange={handleGentxFile}
            disabled={isSubmitting}
            style={{ marginBottom: '8px', fontSize: '13px' }}
          />
          <TextArea
            value={gentxRaw}
            onChange={setGentxRaw}
            placeholder='{"body":{"messages":[{"@type":"/cosmos.staking.v1beta1.MsgCreateValidator",...}]}}'
            disabled={isSubmitting}
            rows={6}
          />
          {/* Advisory client-side gentx checks (WASM). The server re-validates (incl. signature) on submit. */}
          {advisory !== null &&
            (advisoryFailed.length === 0 ? (
              <Text fontSize="$xs" color="$textSuccess" attributes={{ marginTop: '6px' }}>
                ✓ Passes local gentx checks (advisory — the server re-validates, including the signature, on submit).
              </Text>
            ) : (
              <Box
                display="flex"
                flexDirection="column"
                gap="4px"
                borderRadius="6px"
                border="1px solid"
                borderColor="$textSecondary"
                p="10px"
              >
                <Text fontSize="$xs" fontWeight="$semibold" color="$textSecondary">
                  Advisory gentx checks (in your browser — the server is authoritative):
                </Text>
                {advisoryFailed.map((inv, i) => (
                  <Text key={inv.invariant ?? i} fontSize="$xs" color="$textDanger">
                    • {inv.invariant}
                    {inv.reason ? ` — ${inv.reason}` : ''}
                  </Text>
                ))}
              </Box>
            ))}
        </Box>

        <Box>
          <FieldLabel>Peer address *</FieldLabel>
          <TextInput
            value={peerAddress}
            onChange={setPeerAddress}
            placeholder="nodeId@1.2.3.4:26656"
            disabled={isSubmitting}
          />
        </Box>

        <Box>
          <FieldLabel>RPC endpoint (optional)</FieldLabel>
          <TextInput
            value={rpcEndpoint}
            onChange={setRpcEndpoint}
            placeholder="https://rpc.mynode.example.com"
            disabled={isSubmitting}
          />
        </Box>

        <Box>
          <FieldLabel>Memo (optional)</FieldLabel>
          <TextInput
            value={memo}
            onChange={setMemo}
            placeholder="My validator node"
            disabled={isSubmitting}
          />
        </Box>

        {submitError && (
          <Text fontSize="$sm" color="$textDanger">
            {submitError}
          </Text>
        )}

        {/* advisory per-invariant breakdown for a gentx_invalid rejection. The server
            stays authoritative; this just tells the validator which checks failed and why. */}
        {failedInvariants.length > 0 && (
          <Box
            display="flex"
            flexDirection="column"
            gap="4px"
            borderRadius="6px"
            border="1px solid"
            borderColor="$textDanger"
            p="10px"
          >
            <Text fontSize="$xs" fontWeight="$semibold" color="$textDanger">
              gentx validation failed:
            </Text>
            {failedInvariants.map((inv, i) => (
              <Text key={inv.invariant ?? i} fontSize="$xs" color="$textDanger">
                • {inv.invariant}
                {inv.reason ? ` — ${inv.reason}` : ''}
              </Text>
            ))}
          </Box>
        )}

        <Button
          variant="primary"
          onClick={handleSubmit}
          isLoading={isSubmitting}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Signing & Submitting…' : 'Submit Join Request'}
        </Button>
      </Box>
    </PanelCard>
  );
}

// ── Peer List ─────────────────────────────────────────────────────────────────

function PeerListSection({ launchId }: { launchId: string }) {
  const [loadRequested, setLoadRequested] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isFetching, error, refetch } = useGetLaunchIdPeers(
    launchId,
    undefined,
    { query: { enabled: loadRequested } },
  );

  // Build the persistent_peers string client-side from the JSON peer list (the endpoint's ?format=text
  // convenience is no longer needed — the web formats it).
  const persistentPeers = (data?.peers ?? [])
    .map((p) => p.peer_address)
    .filter(Boolean)
    .join(',');

  const handleCopy = () => {
    if (!persistentPeers) return;
    navigator.clipboard.writeText(persistentPeers).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <PanelCard title="Peer List">
      <Text fontSize="$xs" color="$textSecondary">
        Persistent peers for all approved validators. Paste into your node&apos;s <Text as="span" fontFamily="monospace" fontSize="$xs">persistent_peers</Text> config.
      </Text>
      {!loadRequested && (
        <Button variant="outline" size="sm" onClick={() => setLoadRequested(true)}>
          Load Peers
        </Button>
      )}
      {loadRequested && isLoading && <Text fontSize="$xs" color="$textSecondary">Loading…</Text>}
      {error && (
        <Text fontSize="$xs" color="$textDanger">
          {error.error?.message ?? 'Failed to load peers'}
        </Text>
      )}
      {loadRequested && !isLoading && !error && (
        <Box display="flex" flexDirection="column" gap="8px">
          {persistentPeers === '' ? (
            <Text fontSize="$xs" color="$textSecondary">No approved peers yet.</Text>
          ) : (
            <>
              <Box
                borderRadius="6px"
                border="1px solid"
                borderColor="$divider"
                p="10px"
                attributes={{ style: { wordBreak: 'break-all' } }}
              >
                <Text fontSize="$xs" fontFamily="monospace">{persistentPeers}</Text>
              </Box>
              <Box display="flex" gap="8px">
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
                <Button variant="text" size="sm" onClick={() => refetch()} isLoading={isFetching}>
                  Refresh
                </Button>
              </Box>
            </>
          )}
        </Box>
      )}
    </PanelCard>
  );
}

// ── H.5 — Genesis Download + SHA-256 Verification ────────────────────────────

function GenesisSection({
  launchId,
  finalGenesisSha256,
}: {
  launchId: string;
  finalGenesisSha256: string;
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [verifiedHash, setVerifiedHash] = useState<string | null>(null);
  const [hashMatch, setHashMatch] = useState<boolean | null>(null);

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    setDownloadError(null);
    setVerifiedHash(null);
    setHashMatch(null);

    try {
      const r = await authedFetch(`/launch/${launchId}/genesis`);
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as ApiErrorEnvelope;
        setDownloadError(body.error?.message ?? `Server returned ${r.status}`);
        return;
      }

      const arrayBuf = await r.arrayBuffer();
      const blob = new Blob([arrayBuf], { type: 'application/json' });

      // SHA-256 verification
      const hex = await computeSha256Hex(arrayBuf);
      setVerifiedHash(hex);
      setHashMatch(hex === finalGenesisSha256);

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'genesis.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  }, [launchId, finalGenesisSha256]);

  return (
    <PanelCard title="Genesis File">
      <Box display="flex" flexDirection="column" gap="8px">
        <Box display="flex" gap="8px" alignItems="baseline">
          <Text fontSize="$xs" color="$textSecondary" attributes={{ minWidth: '140px', flexShrink: '0' }}>
            Expected SHA-256
          </Text>
          <Text fontSize="$xs" fontFamily="monospace">{finalGenesisSha256}</Text>
        </Box>

        {verifiedHash && (
          <Box display="flex" gap="8px" alignItems="baseline">
            <Text fontSize="$xs" color="$textSecondary" attributes={{ minWidth: '140px', flexShrink: '0' }}>
              Downloaded SHA-256
            </Text>
            <Text
              fontSize="$xs"
              fontFamily="monospace"
              color={hashMatch ? '$textSuccess' : '$textDanger'}
            >
              {verifiedHash}
              {hashMatch ? ' ✓ match' : ' ✗ mismatch — do not use this file'}
            </Text>
          </Box>
        )}

        {downloadError && (
          <Text fontSize="$sm" color="$textDanger">{downloadError}</Text>
        )}

        <Button
          variant="primary"
          onClick={handleDownload}
          isLoading={isDownloading}
          disabled={isDownloading}
        >
          {isDownloading ? 'Downloading…' : 'Download genesis.json'}
        </Button>
      </Box>
    </PanelCard>
  );
}

// ── H.6 — Readiness Confirmation ─────────────────────────────────────────────

interface ReadinessSectionProps {
  launchId: string;
  hint: ChainHint;
  address: string;
  wallet: StatefulWallet;
  signingChainId: string;
  finalGenesisSha256: string;
}

function ReadinessSection({
  launchId,
  hint,
  address,
  wallet,
  signingChainId,
  finalGenesisSha256,
}: ReadinessSectionProps) {
  const [binaryHash, setBinaryHash] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const confirmReadiness = usePostLaunchIdReady();

  if (confirmed) {
    return (
      <PanelCard title="Readiness Confirmation">
        <Text fontSize="$sm" color="$textSuccess">
          Readiness confirmed — the committee will see your confirmation in the dashboard.
        </Text>
      </PanelCard>
    );
  }

  const handleConfirm = async () => {
    setError(null);

    if (!binaryHash.trim()) {
      setError('Binary SHA-256 hash is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        binary_hash_confirmed: binaryHash.trim(),
        genesis_hash_confirmed: finalGenesisSha256,
        operator_address: address,
      };

      const signed = await buildSignedAction(payload, wallet, signingChainId, address);
      await confirmReadiness.mutateAsync({
        id: launchId,
        data: signed as unknown as ServicesConfirmInput,
      });
      setConfirmed(true);
    } catch (err) {
      const env = err as ApiErrorEnvelope;
      setError(env.error?.message ?? (err instanceof Error ? err.message : 'Unexpected error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PanelCard title="Confirm Readiness">
      <Box display="flex" flexDirection="column" gap="12px">
        <Text fontSize="$sm" color="$textSecondary">
          Confirm that you have downloaded and verified the genesis file and that your node binary
          matches the expected SHA-256.
        </Text>

        <Box>
          <FieldLabel>Genesis SHA-256 (pre-filled from committee)</FieldLabel>
          <TextInput
            value={finalGenesisSha256}
            onChange={() => {}}
            disabled
          />
        </Box>

        <Box>
          <FieldLabel>Binary SHA-256 *</FieldLabel>
          <TextInput
            value={binaryHash}
            onChange={setBinaryHash}
            placeholder="sha256sum output of your chain binary"
            disabled={isSubmitting}
          />
        </Box>

        {error && (
          <Text fontSize="$sm" color="$textDanger">{error}</Text>
        )}

        <Button
          variant="primary"
          onClick={handleConfirm}
          isLoading={isSubmitting}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Signing & Confirming…' : 'Confirm Readiness'}
        </Button>
      </Box>
    </PanelCard>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface ValidatorPanelProps {
  launchId: string;
  hint: ChainHint;
  address: string;
  wallet: StatefulWallet;
  signingChainId: string;
  launch: ApiLaunchJSON;
  dashboard: ApiDashboardJSON | null;
}

export function ValidatorPanel({
  launchId,
  hint,
  address,
  wallet,
  signingChainId,
  launch,
  dashboard,
}: ValidatorPanelProps) {
  const myReadiness = dashboard?.validators?.find((v) => v.operator_address === address);
  const isApproved = !!myReadiness;
  const isReady = myReadiness?.is_ready ?? false;
  // Stable identity so the advisory-validation effect doesn't re-run every render.
  const params = useMemo(() => paramsFromRecord(launch.record), [launch.record]);

  return (
    <Box display="flex" flexDirection="column" gap="16px">
      {/* H.3 / H.4 */}
      <JoinSection
        launchId={launchId}
        hint={hint}
        address={address}
        wallet={wallet}
        signingChainId={signingChainId}
        isApproved={isApproved}
        params={params}
      />

      {/* H.5 */}
      {isApproved && launch.final_genesis_sha256 && (
        <GenesisSection
          launchId={launchId}
          finalGenesisSha256={launch.final_genesis_sha256}
        />
      )}

      {/* H.6 */}
      {isApproved && !isReady && launch.final_genesis_sha256 && (
        <ReadinessSection
          launchId={launchId}
          hint={hint}
          address={address}
          wallet={wallet}
          signingChainId={signingChainId}
          finalGenesisSha256={launch.final_genesis_sha256}
        />
      )}

      {/* Already confirmed */}
      {isApproved && isReady && (
        <PanelCard title="Readiness">
          <Text fontSize="$sm" color="$textSuccess">
            Readiness confirmed
            {myReadiness?.last_confirmed_at
              ? ` — last confirmed at ${new Date(myReadiness.last_confirmed_at).toLocaleString()}`
              : '.'}
          </Text>
        </PanelCard>
      )}

      {/* Peer list — available once approved */}
      {isApproved && (
        <PeerListSection launchId={launchId} />
      )}
    </Box>
  );
}