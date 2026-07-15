import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Text } from '@interchain-ui/react';
import { useChain } from '@interchain-kit/react';
import { Button } from '@/components';
import { ValidatorPanel } from '@/components/ValidatorPanel';
import { CommitteePanel } from '@/components/CommitteePanel';
import { RehearsalResetButton } from '@/components/RehearsalResetButton';
import { AuditLogSection } from '@/components/AuditLogSection';
import { useAddChainToWallet } from '@/hooks';
import { useAuth } from '@/contexts';
import { ChainHint } from '@/utils/chainSuggestion';
import { sameAccount } from '@/utils/address';
import { useGetLaunchId } from '@/api/generated/launches/launches';
import { useGetCommitteeLaunchId } from '@/api/generated/committee/committee';
import { useGetLaunchIdDashboard } from '@/api/generated/readiness/readiness';
import { useGetLaunchIdRehearsal } from '@/api/generated/rehearsal/rehearsal';

// ── Top-level page ─────────────────────────────────────────────────────────────

export default function LaunchDetail() {
  const router = useRouter();
  const launchId = router.query.id as string;
  const { isAuthenticated, chainName } = useAuth();

  if (!launchId) return null;

  if (isAuthenticated && chainName) {
    return <AuthenticatedLaunchDetail launchId={launchId} />;
  }

  return <UnauthenticatedLanding launchId={launchId} />;
}

// ── Unauthenticated landing — two-path or validator flow ──────────────────────

function UnauthenticatedLanding({ launchId }: { launchId: string }) {
  const [validatorMode, setValidatorMode] = useState(false);
  const { addChain, isPending, isRegistered, hint, error } = useAddChainToWallet(launchId);

  if (!validatorMode) {
    return (
      <Box maxWidth="800px" mx="auto" mt="60px">
        <StepCard
          title="Access this launch"
          description="Choose how you are participating in this launch."
        >
          <Box display="flex" flexDirection="column" gap="12px" alignItems="center">
            <Box
              borderRadius="6px"
              border="1px solid"
              borderColor="$divider"
              p="16px"
              width="100%"
              maxWidth="400px"
            >
              <Text fontSize="$sm" fontWeight="$semibold" attributes={{ mb: '4px' }}>
                Committee member or validator
              </Text>
              <Text fontSize="$xs" color="$textSecondary">
                Use the Sign In button in the header to authenticate with your wallet.
              </Text>
            </Box>
            <Box
              borderRadius="6px"
              border="1px solid"
              borderColor="$divider"
              p="16px"
              width="100%"
              maxWidth="400px"
            >
              <Text fontSize="$sm" fontWeight="$semibold" attributes={{ mb: '8px' }}>
                New validator
              </Text>
              <Text fontSize="$xs" color="$textSecondary" attributes={{ mb: '12px' }}>
                Register this chain in your wallet and authenticate with your validator address.
              </Text>
              <Button variant="primary" size="sm" onClick={() => setValidatorMode(true)}>
                Join as Validator
              </Button>
            </Box>
          </Box>
        </StepCard>
      </Box>
    );
  }

  // Validator onboarding — add chain step
  if (!isRegistered) {
    return (
      <Box maxWidth="800px" mx="auto" mt="60px">
        <StepCard
          title="Add chain to wallet"
          description="Before you can authenticate, this chain must be registered in your wallet extension."
          // Any failure here is a private-launch visibility gate (a 404 for non-members, identical
          // whether or not the launch exists). Show a uniform, non-leaking prompt — never the raw
          // "not found" message, which would imply the launch exists.
          error={
            error
              ? 'Sign in to continue. Launches are private — visible only to their committee and allowlisted members.'
              : undefined
          }
        >
          <Button variant="primary" onClick={addChain} isLoading={isPending} disabled={isPending}>
            {isPending ? 'Adding…' : 'Add Chain to Wallet'}
          </Button>
        </StepCard>
      </Box>
    );
  }

  // Chain registered — connect + sign-in
  return (
    <Box maxWidth="800px" mx="auto" mt="60px">
      <ValidatorConnectAndAuth launchId={launchId} hint={hint!} />
    </Box>
  );
}

// ── Per-launch connect + sign-in (validator path) ─────────────────────────────

function ValidatorConnectAndAuth({ launchId, hint }: { launchId: string; hint: ChainHint }) {
  const { address, connect, wallet } = useChain(hint.chain_name);
  const { isPending, error, login } = useAuth();

  if (!address) {
    return (
      <StepCard
        title="Connect wallet"
        description={`Chain "${hint.chain_name}" registered. Connect your wallet to continue.`}
      >
        <Button variant="primary" onClick={connect}>
          Connect Wallet
        </Button>
      </StepCard>
    );
  }

  return (
    <StepCard
      title="Authenticate"
      description={`Connected as ${address}. Sign a challenge to prove ownership.`}
      error={error ?? undefined}
    >
      <Button
        variant="primary"
        onClick={() => login(wallet, hint.chain_id, hint.chain_name, address)}
        isLoading={isPending}
        disabled={isPending}
      >
        {isPending ? 'Signing…' : 'Sign In'}
      </Button>
    </StepCard>
  );
}

// ── Authenticated detail view ──────────────────────────────────────────────────

function AuthenticatedLaunchDetail({ launchId }: { launchId: string }) {
  const { operatorAddress, chainName, logout, revokeAllSessions } = useAuth();
  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const { wallet, chain } = useChain(chainName!);
  const signingChainId = chain.chainId as string;
  const [sseEvents, setSseEvents] = useState<string[]>([]);

  // Launch / committee / dashboard via react-query — cached + deduped across the panels; a panel's
  // mutation invalidates these query keys and every consumer refetches (no onUpdated callbacks needed).
  const { data: launch, isLoading: launchLoading, error: launchError } = useGetLaunchId(launchId);
  const { data: committee, isLoading: committeeLoading, error: committeeError } =
    useGetCommitteeLaunchId(launchId);
  const { data: dashboard } = useGetLaunchIdDashboard(launchId);

  const isLoading = launchLoading || committeeLoading;
  const error = launchError ?? committeeError;

  // Session controls are always rendered so they remain accessible even if the launch fails to load.
  const sessionControls = (
    <Box display="flex" gap="8px" alignItems="center">
      {revokeConfirm ? (
        <>
          <Text fontSize="$xs" color="$textDanger">Revoke all sessions?</Text>
          <Button variant="outline" size="sm" onClick={() => { revokeAllSessions(); setRevokeConfirm(false); }}>
            Confirm
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRevokeConfirm(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setRevokeConfirm(true)}>
          Revoke All Sessions
        </Button>
      )}
      <Button variant="outline" onClick={logout}>
        Sign Out
      </Button>
    </Box>
  );

  // ── SSE live feed ───────────────────────────────────────────────────────────

  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
  const { token } = useAuth();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!token) return;
    const url = `${API_BASE}/launch/${launchId}/events`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (ev) => {
      setSseEvents((prev) => [`${new Date().toLocaleTimeString()}: ${ev.data}`, ...prev.slice(0, 49)]);
    };

    es.onerror = () => {};

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [launchId, token, API_BASE]);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const address = operatorAddress!;
  // HRP-independent: auth address may be `cosmos1…` while the committee renders in the launch prefix.
  const isCommitteeMember = (committee?.members ?? []).some((m) => sameAccount(m.address, address));
  const isLead = sameAccount(committee?.lead_address, address);

  // Build hint from the fetched launch record (same shape, avoids a second fetch)
  const hint: ChainHint | null = launch?.record
    ? {
        chain_id: launch.record.chain_id ?? '',
        chain_name: launch.record.chain_name ?? '',
        bech32_prefix: launch.record.bech32_prefix ?? '',
        denom: launch.record.denom ?? '',
      }
    : null;

  // ── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Box display="flex" flexDirection="column" gap="16px">
        {sessionControls}
        <Text color="$textSecondary" fontSize="$sm">Loading launch…</Text>
      </Box>
    );
  }

  if (error || !launch || !committee || !hint) {
    return (
      <Box display="flex" flexDirection="column" gap="16px">
        {sessionControls}
        <Text color="$textDanger" fontSize="$sm">
          {error?.error?.message ?? 'Failed to load launch.'}
        </Text>
      </Box>
    );
  }

  return (
    <Box display="flex" flexDirection="column" gap="24px">
      {/* ── Header ── */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Text fontSize="28px" fontWeight="600">{launch.record?.chain_name}</Text>
          <Text fontSize="$sm" color="$textSecondary" fontFamily="monospace">
            {launch.record?.chain_id}
          </Text>
        </Box>
        <Box display="flex" gap="8px" alignItems="center">
          <StatusBadge status={launch.status ?? ''} />
          {sessionControls}
        </Box>
      </Box>

      {/* ── Metadata card ── */}
      <InfoCard title="Chain Details">
        <InfoRow label="Binary" value={`${launch.record?.binary_name ?? ''} ${launch.record?.binary_version ?? ''}`} />
        <InfoRow label="Denom" value={launch.record?.denom ?? ''} />
        <InfoRow label="Min validators" value={String(launch.record?.min_validator_count ?? '')} />
        {launch.record?.gentx_deadline && (
          <InfoRow label="Gentx deadline" value={new Date(launch.record.gentx_deadline).toLocaleString()} />
        )}
        {launch.record?.genesis_time && (
          <InfoRow label="Genesis time" value={new Date(launch.record.genesis_time).toLocaleString()} />
        )}
        <InfoRow label="Type" value={launch.launch_type ?? ''} />
        <InfoRow label="Role" value={isCommitteeMember ? 'Committee member' : 'Validator'} />
        {launch.initial_genesis_sha256 && (
          <InfoRow label="Initial genesis SHA-256" value={launch.initial_genesis_sha256} mono />
        )}
        {launch.final_genesis_sha256 && (
          <InfoRow label="Final genesis SHA-256" value={launch.final_genesis_sha256} mono />
        )}
      </InfoCard>

      {/* ── Committee card ── */}
      <InfoCard title={`Committee (${committee.threshold_m}/${committee.total_n})`}>
        {(committee.members ?? []).map((m) => (
          <InfoRow
            key={m.address}
            label={m.moniker || 'member'}
            value={m.address ?? ''}
            mono
          />
        ))}
      </InfoCard>

      {/* ── Dashboard card ── */}
      {dashboard && (
        <InfoCard title="Readiness Dashboard">
          <InfoRow label="Approved validators" value={String(dashboard.total_approved ?? 0)} />
          <InfoRow label="Confirmed ready" value={`${dashboard.confirmed_ready ?? 0} / ${dashboard.total_approved ?? 0}`} />
          <InfoRow label="Voting power confirmed" value={`${((dashboard.voting_power_confirmed ?? 0) * 100).toFixed(1)}%`} />
          <InfoRow label="Threshold status" value={dashboard.threshold_status ?? ''} />
        </InfoCard>
      )}

      {/* ── Rehearsal status ── committee-gated read; shown to committee members only */}
      {isCommitteeMember && <RehearsalStatusCard launchId={launchId} />}

      {/* ── Role panels ── committee members see both so they can also participate as validators */}
      {isCommitteeMember && (
        <CommitteePanel
          launchId={launchId}
          hint={hint}
          address={address}
          wallet={wallet!}
          signingChainId={signingChainId}
          launch={launch}
          committee={committee}
          isLead={isLead}
        />
      )}
      <ValidatorPanel
        launchId={launchId}
        hint={hint}
        address={address}
        wallet={wallet!}
        signingChainId={signingChainId}
        launch={launch}
        dashboard={dashboard ?? null}
      />

      {/* ── Audit log ── */}
      <AuditLogSection launchId={launchId} />

      {/* ── Live event feed ── */}
      <InfoCard title="Live Events">
        {sseEvents.length === 0 ? (
          <Text fontSize="$xs" color="$textSecondary">
            Listening for events…
          </Text>
        ) : (
          <Box display="flex" flexDirection="column" gap="4px">
            {sseEvents.map((ev, i) => (
              <Text key={i} fontSize="$xs" color="$textSecondary" fontFamily="monospace">
                {ev}
              </Text>
            ))}
          </Box>
        )}
      </InfoCard>
    </Box>
  );
}

// ── Shared UI primitives ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  // Keys are coordd's on-the-wire status values (uppercase).
  const colorMap: Record<string, string> = {
    WINDOW_OPEN: '$textSuccess',
    GENESIS_READY: '$textSuccess',
    LAUNCHED: '$purple600',
    CANCELED: '$textDanger',
  };
  return (
    <Text
      fontSize="$sm"
      fontWeight="$semibold"
      color={colorMap[status] ?? '$textSecondary'}
    >
      {status.replace(/_/g, ' ').toUpperCase()}
    </Text>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
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

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <Box display="flex" gap="8px" alignItems="baseline">
      <Text fontSize="$xs" color="$textSecondary" attributes={{ minWidth: '160px', flexShrink: '0' }}>
        {label}
      </Text>
      <Text fontSize="$sm" fontFamily={mono ? 'monospace' : undefined}>
        {value}
      </Text>
    </Box>
  );
}

// AuditLogSection was extracted to components/AuditLogSection.tsx (testable in isolation).

// ── Rehearsal status section ──────────────────────────────────────────────────
// Committee-gated read (GET /launch/{id}/rehearsal) — advisory display of the latest rehearsal fact.
// The backend gate is authoritative on freshness; the `stale` flag here is the value recorded with
// the fact (a good proxy, but the live set may have drifted further since).

function rehearsalOutcomeColor(outcome?: string): string {
  switch (outcome) {
    case 'PASS':
      return '$textSuccess';
    case 'FAIL':
    case 'ERROR':
      return '$textDanger';
    default:
      return '$textSecondary';
  }
}

function RehearsalStatusCard({ launchId }: { launchId: string }) {
  const { data, isLoading, error, refetch } = useGetLaunchIdRehearsal(launchId, {
    query: { retry: false },
  });
  const latest = data?.[0];

  return (
    <InfoCard title="Rehearsal">
      {isLoading ? (
        <Text fontSize="$xs" color="$textSecondary">Loading…</Text>
      ) : error || !latest ? (
        <Text fontSize="$xs" color="$textSecondary">
          No rehearsal has been run for this launch.
        </Text>
      ) : (
        <>
          <Box display="flex" gap="8px" alignItems="baseline">
            <Text fontSize="$xs" color="$textSecondary" attributes={{ minWidth: '160px', flexShrink: '0' }}>
              Latest outcome
            </Text>
            <Text fontSize="$sm" fontWeight="$semibold" color={rehearsalOutcomeColor(latest.outcome)}>
              {latest.outcome ?? 'UNKNOWN'}
              {latest.stale ? ' (stale)' : ''}
            </Text>
          </Box>
          {latest.summary && <InfoRow label="Summary" value={latest.summary} />}
          {latest.failed_step && <InfoRow label="Failed step" value={latest.failed_step} />}
          {latest.recorded_at && (
            <InfoRow label="Recorded" value={new Date(latest.recorded_at).toLocaleString()} />
          )}
          {latest.stale && (
            <Text fontSize="$xs" color="$textDanger">
              The approved set changed since this rehearsal — re-run before finalizing genesis.
            </Text>
          )}
          {latest.attempt_id && (
            <RehearsalResetButton
              launchId={launchId}
              attemptId={latest.attempt_id}
              onDone={refetch}
            />
          )}
        </>
      )}
    </InfoCard>
  );
}

function StepCard({
  title,
  description,
  error,
  children,
}: {
  title: string;
  description?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      borderRadius="8px"
      border="1px solid"
      borderColor="$divider"
      p="32px"
      display="flex"
      flexDirection="column"
      alignItems="center"
      gap="16px"
    >
      <Text fontSize="$md" fontWeight="$semibold">{title}</Text>
      {description && (
        <Text fontSize="$sm" color="$textSecondary" textAlign="center">{description}</Text>
      )}
      {error && <Text fontSize="$sm" color="$textDanger">{error}</Text>}
      {children}
    </Box>
  );
}