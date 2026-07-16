import { useState } from 'react';
import Link from 'next/link';
import { Box, Text } from '@interchain-ui/react';
import type { StatefulWallet } from '@interchain-kit/react/store/stateful-wallet';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components';
import { buildSignedAction } from '@/utils/signedAction';
import type { ChainHint } from '@/utils/chainSuggestion';
import { sameAccount } from '@/utils/address';
import {
  usePostLaunchIdProposal,
  usePostLaunchIdProposalPropIdSign,
  useGetLaunchIdProposals,
} from '@/api/generated/proposals/proposals';
import {
  useGetLaunchIdJoin,
  useGetLaunchIdJoinGrouped,
  getLaunchIdGentxs,
} from '@/api/generated/join-requests/join-requests';
import {
  usePostLaunchIdOpenWindow,
  usePatchLaunchId,
  usePostLaunchIdCancel,
} from '@/api/generated/launches/launches';
import { postLaunchIdGenesis } from '@/api/generated/genesis/genesis';
import {
  useGetLaunchIdAllocations,
  postLaunchIdAllocationsType,
} from '@/api/generated/allocations/allocations';
import {
  useGetLaunchIdMembers,
  usePostLaunchIdMembers,
  useDeleteLaunchIdMembersAddress,
} from '@/api/generated/members/members';
import { authedFetch } from '@/api/authedFetch';
import { usePostLaunchIdCommittee } from '@/api/generated/committee/committee';
import type {
  ApiErrorEnvelope,
  ApiLaunchJSON,
  ApiCommitteeJSON,
  ApiJoinRequestJSON,
  ApiProposalJSON,
  ServicesRaiseInput,
  ServicesSignInput,
} from '@/api/generated/model';

// ── Shared UI primitives (mirrors ValidatorPanel) ─────────────────────────────

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

function StatusBadge({ status }: { status: string }) {
  // Shared by join-request (PENDING/APPROVED/REJECTED) and proposal
  // (PENDING_SIGNATURES/EXECUTED/VETOED/EXPIRED) statuses — coordd's exact wire values.
  const color =
    status === 'PENDING' || status === 'PENDING_SIGNATURES'
      ? '$textSecondary'
      : status === 'APPROVED' || status === 'EXECUTED'
      ? '$textSuccess'
      : '$textDanger';
  return (
    <Text fontSize="$xs" fontWeight="$semibold" color={color}>
      {status.toUpperCase()}
    </Text>
  );
}

function truncate(s: string, n = 20): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

// ── H.8 — Raise proposal form ─────────────────────────────────────────────────

type ActionKind = 'APPROVE_VALIDATOR' | 'REJECT_VALIDATOR';

interface ProposalFormProps {
  launchId: string;
  hint: ChainHint;
  address: string;
  wallet: StatefulWallet;
  signingChainId: string;
  jr: ApiJoinRequestJSON;
  action: ActionKind;
  onSuccess: (proposal: ApiProposalJSON) => void;
  onCancel: () => void;
}

function ProposalForm({
  launchId,
  hint,
  address,
  wallet,
  signingChainId,
  jr,
  action,
  onSuccess,
  onCancel,
}: ProposalFormProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const raiseProposal = usePostLaunchIdProposal();
  const queryClient = useQueryClient();

  const handleSubmit = async () => {
    setError(null);

    const payloadObj: Record<string, string> = {
      join_request_id: jr.id ?? '',
      operator_address: jr.operator_address ?? '',
    };
    if (action === 'REJECT_VALIDATOR') {
      payloadObj.reason = reason.trim();
    }

    setIsSubmitting(true);
    try {
      const body = {
        action_type: action,
        payload: payloadObj,
        member_address: address,
      };

      const signed = await buildSignedAction(body, wallet, signingChainId, address);
      const proposal = await raiseProposal.mutateAsync({
        id: launchId,
        data: signed as unknown as ServicesRaiseInput,
      });
      queryClient.invalidateQueries();
      onSuccess(proposal);
    } catch (err) {
      const env = err as ApiErrorEnvelope;
      setError(env.error?.message ?? (err instanceof Error ? err.message : 'Unexpected error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const label = action === 'APPROVE_VALIDATOR' ? 'Approve Validator' : 'Reject Validator';

  return (
    <Box
      borderRadius="6px"
      border="1px solid"
      borderColor="$divider"
      p="16px"
      display="flex"
      flexDirection="column"
      gap="12px"
    >
      <Text fontSize="$sm" fontWeight="$semibold">{label}</Text>

      <Box>
        <FieldLabel>Join request</FieldLabel>
        <Text fontSize="$xs" fontFamily="monospace" color="$textSecondary">
          {jr.id}
        </Text>
      </Box>

      <Box>
        <FieldLabel>Operator address</FieldLabel>
        <Text fontSize="$xs" fontFamily="monospace">{jr.operator_address}</Text>
      </Box>

      {jr.memo && (
        <Box>
          <FieldLabel>Memo</FieldLabel>
          <Text fontSize="$xs">{jr.memo}</Text>
        </Box>
      )}

      {action === 'REJECT_VALIDATOR' && (
        <Box>
          <FieldLabel>Reason (optional)</FieldLabel>
          <TextInput
            value={reason}
            onChange={setReason}
            placeholder="Reason for rejection"
            disabled={isSubmitting}
          />
        </Box>
      )}

      {error && (
        <Text fontSize="$sm" color="$textDanger">{error}</Text>
      )}

      <Box display="flex" gap="8px">
        <Button
          variant="primary"
          onClick={handleSubmit}
          isLoading={isSubmitting}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Signing & Submitting…' : `Sign & Raise ${label} Proposal`}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}

// ── H.7 — Join request queue ──────────────────────────────────────────────────

interface JoinQueueSectionProps {
  launchId: string;
  hint: ChainHint;
  address: string;
  wallet: StatefulWallet;
  signingChainId: string;
}

function JoinQueueSection({ launchId, hint, address, wallet, signingChainId }: JoinQueueSectionProps) {
  const { data, isLoading, error } = useGetLaunchIdJoin(
    launchId,
    { per_page: 100 },
    { query: { refetchInterval: 30_000 } },
  );
  const requests = data?.items ?? [];

  // Grouped-by-submitter review view (roles.md: the committee reviews applications grouped by
  // submitter, matching each operator + self-delegation against the label's off-band expectation).
  // Read-only aid — approve/reject stay in the flat list. Fetched only while the view is on.
  const [grouped, setGrouped] = useState(false);
  const groupedQuery = useGetLaunchIdJoinGrouped(launchId, { query: { enabled: grouped } });
  const groups = groupedQuery.data ?? [];

  // active proposal form state: which (join request, action) is being raised
  const [activeForm, setActiveForm] = useState<{ jr: ApiJoinRequestJSON; action: ActionKind } | null>(null);
  // proposals raised this session, keyed by join request id
  const [raisedProposals, setRaisedProposals] = useState<Record<string, ApiProposalJSON>>({});

  const handleProposalSuccess = (jr: ApiJoinRequestJSON, proposal: ApiProposalJSON) => {
    setRaisedProposals((prev) => ({ ...prev, [jr.id ?? '']: proposal }));
    setActiveForm(null);
  };

  const toggle = (
    <Box>
      <Button variant="outline" size="sm" onClick={() => setGrouped((g) => !g)}>
        {grouped ? 'Flat list' : 'Group by submitter'}
      </Button>
    </Box>
  );

  if (grouped) {
    return (
      <PanelCard title="Applications by submitter">
        {toggle}
        {groupedQuery.isLoading ? (
          <Text fontSize="$sm" color="$textSecondary">Loading…</Text>
        ) : groupedQuery.error ? (
          <Text fontSize="$sm" color="$textDanger">
            {groupedQuery.error.error?.message ?? 'Network error'}
          </Text>
        ) : groups.length === 0 ? (
          <Text fontSize="$sm" color="$textSecondary">No join requests yet.</Text>
        ) : (
          <Box display="flex" flexDirection="column" gap="12px">
            {groups.map((g) => (
              <Box
                key={g.submitter_address}
                borderRadius="6px"
                border="1px solid"
                borderColor="$divider"
                p="12px"
                display="flex"
                flexDirection="column"
                gap="8px"
              >
                <Box display="flex" flexDirection="column" gap="2px">
                  <Text fontSize="$xs" fontFamily="monospace">
                    {truncate(g.submitter_address ?? '', 32)}
                  </Text>
                  {g.label && <Text fontSize="$xs" color="$textSecondary">{g.label}</Text>}
                  <Text fontSize="$xs" color="$textSecondary">
                    {g.request_count ?? g.requests?.length ?? 0} request(s) · self-delegation{' '}
                    {g.total_self_delegation ?? '0'}
                  </Text>
                </Box>
                {(g.requests ?? []).map((jr) => (
                  <Box
                    key={jr.id}
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                    gap="8px"
                  >
                    <Text fontSize="$xs" fontFamily="monospace">
                      {truncate(jr.operator_address ?? '', 32)}
                    </Text>
                    <StatusBadge status={jr.status ?? ''} />
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        )}
      </PanelCard>
    );
  }

  if (isLoading) {
    return (
      <PanelCard title="Join Request Queue">
        {toggle}
        <Text fontSize="$sm" color="$textSecondary">Loading…</Text>
      </PanelCard>
    );
  }

  if (error) {
    return (
      <PanelCard title="Join Request Queue">
        {toggle}
        <Text fontSize="$sm" color="$textDanger">{error.error?.message ?? 'Network error'}</Text>
      </PanelCard>
    );
  }

  if (requests.length === 0) {
    return (
      <PanelCard title="Join Request Queue">
        {toggle}
        <Text fontSize="$sm" color="$textSecondary">No join requests yet.</Text>
      </PanelCard>
    );
  }

  return (
    <PanelCard title={`Join Request Queue (${requests.length})`}>
      {toggle}
      <Box display="flex" flexDirection="column" gap="12px">
        {requests.map((jr) => {
          const jrId = jr.id ?? '';
          const isPending = jr.status === 'PENDING';
          const raised = raisedProposals[jrId];
          const isActiveApprove = activeForm?.jr.id === jr.id && activeForm?.action === 'APPROVE_VALIDATOR';
          const isActiveReject = activeForm?.jr.id === jr.id && activeForm?.action === 'REJECT_VALIDATOR';

          return (
            <Box
              key={jrId}
              borderRadius="6px"
              border="1px solid"
              borderColor="$divider"
              p="12px"
              display="flex"
              flexDirection="column"
              gap="8px"
            >
              {/* Row header */}
              <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                <Box display="flex" flexDirection="column" gap="2px">
                  <Text fontSize="$xs" fontFamily="monospace">
                    {truncate(jr.operator_address ?? '', 32)}
                  </Text>
                  {jr.memo && (
                    <Text fontSize="$xs" color="$textSecondary">{jr.memo}</Text>
                  )}
                  <Text fontSize="$xs" color="$textSecondary">
                    {new Date(jr.submitted_at ?? '').toLocaleString()} · {jr.peer_address}
                  </Text>
                </Box>
                <StatusBadge status={jr.status ?? ''} />
              </Box>

              {/* Session-raised proposal feedback */}
              {raised && (
                <Text fontSize="$xs" color="$textSuccess">
                  Proposal raised: {raised.action_type} · {raised.status} · ID {truncate(raised.id ?? '', 16)}
                </Text>
              )}

              {/* Action buttons (pending only) */}
              {isPending && !raised && (
                <Box display="flex" gap="8px">
                  <Button
                    variant="primary"
                    onClick={() => setActiveForm({ jr, action: 'APPROVE_VALIDATOR' })}
                    disabled={!!activeForm}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setActiveForm({ jr, action: 'REJECT_VALIDATOR' })}
                    disabled={!!activeForm}
                  >
                    Reject
                  </Button>
                </Box>
              )}

              {/* Inline proposal form */}
              {(isActiveApprove || isActiveReject) && (
                <ProposalForm
                  launchId={launchId}
                  hint={hint}
                  address={address}
                  wallet={wallet}
                  signingChainId={signingChainId}
                  jr={jr}
                  action={activeForm!.action}
                  onSuccess={(p) => handleProposalSuccess(jr, p)}
                  onCancel={() => setActiveForm(null)}
                />
              )}
            </Box>
          );
        })}
      </Box>
    </PanelCard>
  );
}

// ── H.9 — Proposal list + sign/veto ──────────────────────────────────────────

interface ProposalListSectionProps {
  launchId: string;
  hint: ChainHint;
  address: string;
  wallet: StatefulWallet;
  signingChainId: string;
}

function ProposalListSection({
  launchId,
  hint,
  address,
  wallet,
  signingChainId,
}: ProposalListSectionProps) {
  const { data, isLoading, error } = useGetLaunchIdProposals(
    launchId,
    { per_page: 100 },
    { query: { refetchInterval: 30_000 } },
  );
  const proposals = data?.items ?? [];

  // signing state per proposal: null = idle, 'signing' = in flight, string = error
  const [signingState, setSigningState] = useState<Record<string, string | 'signing' | null>>({});

  const signProposal = usePostLaunchIdProposalPropIdSign();
  const queryClient = useQueryClient();

  const handleDecision = async (proposal: ApiProposalJSON, decision: 'SIGN' | 'VETO') => {
    const pid = proposal.id ?? '';
    setSigningState((prev) => ({ ...prev, [pid]: 'signing' }));
    try {
      const body = {
        member_address: address,
        decision,
      };
      const signed = await buildSignedAction(body, wallet, signingChainId, address);

      await signProposal.mutateAsync({
        id: launchId,
        propId: pid,
        data: signed as unknown as ServicesSignInput,
      });
      queryClient.invalidateQueries();
      setSigningState((prev) => ({ ...prev, [pid]: null }));
    } catch (err) {
      const env = err as ApiErrorEnvelope;
      setSigningState((prev) => ({
        ...prev,
        [pid]: env.error?.message ?? (err instanceof Error ? err.message : 'Unexpected error'),
      }));
    }
  };

  if (isLoading) {
    return (
      <PanelCard title="Proposals">
        <Text fontSize="$sm" color="$textSecondary">Loading…</Text>
      </PanelCard>
    );
  }

  if (error) {
    return (
      <PanelCard title="Proposals">
        <Text fontSize="$sm" color="$textDanger">{error.error?.message ?? 'Network error'}</Text>
      </PanelCard>
    );
  }

  if (proposals.length === 0) {
    return (
      <PanelCard title="Proposals">
        <Text fontSize="$sm" color="$textSecondary">No proposals yet.</Text>
      </PanelCard>
    );
  }

  const pendingFirst = [...proposals].sort((a, b) => {
    if (a.status === 'PENDING_SIGNATURES' && b.status !== 'PENDING_SIGNATURES') return -1;
    if (a.status !== 'PENDING_SIGNATURES' && b.status === 'PENDING_SIGNATURES') return 1;
    return new Date(b.proposed_at ?? '').getTime() - new Date(a.proposed_at ?? '').getTime();
  });

  return (
    <PanelCard title={`Proposals (${proposals.length})`}>
      <Box display="flex" flexDirection="column" gap="12px">
        {pendingFirst.map((p) => {
          const pid = p.id ?? '';
          const signatures = p.signatures ?? [];
          const myDecision = signatures.find((s) => sameAccount(s.member_address, address));
          const isPending = p.status === 'PENDING_SIGNATURES';
          const canAct = isPending && !myDecision;
          const state = signingState[pid];
          const isSigning = state === 'signing';
          const signError = typeof state === 'string' && state !== 'signing' ? state : null;

          return (
            <Box
              key={pid}
              borderRadius="6px"
              border="1px solid"
              borderColor="$divider"
              p="12px"
              display="flex"
              flexDirection="column"
              gap="8px"
            >
              {/* Header row */}
              <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                <Box display="flex" flexDirection="column" gap="2px">
                  <Text fontSize="$sm" fontWeight="$semibold">
                    {(p.action_type ?? '').replace(/_/g, ' ')}
                  </Text>
                  <Text fontSize="$xs" color="$textSecondary">
                    Proposed by {truncate(p.proposed_by ?? '', 24)} · {new Date(p.proposed_at ?? '').toLocaleString()}
                  </Text>
                  {isPending && (
                    <Text fontSize="$xs" color="$textSecondary">
                      Expires {new Date(p.ttl_expires ?? '').toLocaleString()}
                    </Text>
                  )}
                </Box>
                <StatusBadge status={p.status ?? ''} />
              </Box>

              {/* Deep link to the standalone proposal detail page */}
              <Box>
                <Link href={`/launch/${launchId}/proposal/${pid}`}>
                  <Text fontSize="$xs" color="$textSecondary">Permalink ↗</Text>
                </Link>
              </Box>

              {/* Signatures */}
              {signatures.length > 0 && (
                <Box display="flex" flexDirection="column" gap="2px">
                  {signatures.map((s) => (
                    <Text key={s.member_address} fontSize="$xs" color="$textSecondary">
                      {s.decision === 'SIGN' ? '✓' : '✗'} {truncate(s.member_address ?? '', 24)}
                    </Text>
                  ))}
                </Box>
              )}

              {/* My prior decision */}
              {myDecision && (
                <Text fontSize="$xs" color={myDecision.decision === 'SIGN' ? '$textSuccess' : '$textDanger'}>
                  You {myDecision.decision === 'SIGN' ? 'signed' : 'vetoed'} this proposal.
                </Text>
              )}

              {/* Sign / Veto buttons */}
              {canAct && (
                <Box display="flex" gap="8px">
                  <Button
                    variant="primary"
                    onClick={() => handleDecision(p, 'SIGN')}
                    isLoading={isSigning}
                    disabled={isSigning}
                  >
                    {isSigning ? 'Signing…' : 'Sign'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleDecision(p, 'VETO')}
                    disabled={isSigning}
                  >
                    Veto
                  </Button>
                </Box>
              )}

              {signError && (
                <Text fontSize="$xs" color="$textDanger">{signError}</Text>
              )}
            </Box>
          );
        })}
      </Box>
    </PanelCard>
  );
}

// ── H.10 — Committee actions ────────────────────────────────────────────────

interface CommitteeActionsSectionProps {
  launchId: string;
  launch: ApiLaunchJSON;
  isLead: boolean;
}

function CommitteeActionsSection({
  launchId,
  launch,
  isLead,
}: CommitteeActionsSectionProps) {
  const queryClient = useQueryClient();

  // Open window
  const [openWindowBusy, setOpenWindowBusy] = useState(false);
  const [openWindowError, setOpenWindowError] = useState<string | null>(null);
  const openWindow = usePostLaunchIdOpenWindow();

  // Cancel launch
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const cancelLaunch = usePostLaunchIdCancel();

  // Monitor RPC
  const [monitorRPC, setMonitorRPC] = useState(launch.monitor_rpc_url ?? '');
  const [monitorRPCBusy, setMonitorRPCBusy] = useState(false);
  const [monitorRPCError, setMonitorRPCError] = useState<string | null>(null);
  const [monitorRPCSaved, setMonitorRPCSaved] = useState(false);
  const patchLaunch = usePatchLaunchId();

  // Genesis upload
  const [genesisURL, setGenesisURL] = useState('');
  const [genesisSHA256, setGenesisSHA256] = useState('');
  const [genesisTime, setGenesisTime] = useState('');
  const [genesisType, setGenesisType] = useState<'initial' | 'final'>('initial');
  const [genesisBusy, setGenesisBusy] = useState(false);
  const [genesisError, setGenesisError] = useState<string | null>(null);
  const [genesisSaved, setGenesisSaved] = useState(false);

  const handleOpenWindow = async () => {
    setOpenWindowBusy(true);
    setOpenWindowError(null);
    try {
      await openWindow.mutateAsync({ id: launchId });
      queryClient.invalidateQueries();
    } catch (err) {
      const env = err as ApiErrorEnvelope;
      setOpenWindowError(env.error?.message ?? (err instanceof Error ? err.message : 'Unexpected error'));
    } finally {
      setOpenWindowBusy(false);
    }
  };

  const handleSetMonitorRPC = async () => {
    setMonitorRPCBusy(true);
    setMonitorRPCError(null);
    setMonitorRPCSaved(false);
    try {
      await patchLaunch.mutateAsync({
        id: launchId,
        data: { monitor_rpc_url: monitorRPC.trim() },
      });
      queryClient.invalidateQueries();
      setMonitorRPCSaved(true);
    } catch (err) {
      const env = err as ApiErrorEnvelope;
      setMonitorRPCError(env.error?.message ?? (err instanceof Error ? err.message : 'Unexpected error'));
    } finally {
      setMonitorRPCBusy(false);
    }
  };

  const handleCancel = async () => {
    setCancelBusy(true);
    setCancelError(null);
    try {
      await cancelLaunch.mutateAsync({ id: launchId });
      queryClient.invalidateQueries();
      setCancelConfirm(false);
    } catch (err) {
      const env = err as ApiErrorEnvelope;
      setCancelError(env.error?.message ?? (err instanceof Error ? err.message : 'Unexpected error'));
    } finally {
      setCancelBusy(false);
    }
  };

  const handleGenesisUpload = async () => {
    setGenesisBusy(true);
    setGenesisError(null);
    setGenesisSaved(false);

    if (!genesisURL.trim()) {
      setGenesisError('URL is required.');
      setGenesisBusy(false);
      return;
    }
    if (!genesisSHA256.trim()) {
      setGenesisError('SHA-256 is required.');
      setGenesisBusy(false);
      return;
    }
    if (genesisType === 'final' && !genesisTime.trim()) {
      setGenesisError('Genesis time is required for final genesis.');
      setGenesisBusy(false);
      return;
    }

    try {
      const body: Record<string, string> = {
        url: genesisURL.trim(),
        sha256: genesisSHA256.trim(),
      };
      if (genesisType === 'final') body.genesis_time = genesisTime.trim();

      // The generated usePostLaunchIdGenesis hook's mutateAsync shape is { id, params? } — it carries
      // no request body. Call the imperative request function directly so we can attach the JSON body,
      // then invalidate so [id].tsx refetches the launch (attestor mode: JSON { url, sha256, genesis_time? }).
      await postLaunchIdGenesis(
        launchId,
        { type: genesisType },
        {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      queryClient.invalidateQueries();
      setGenesisSaved(true);
      setGenesisURL('');
      setGenesisSHA256('');
      setGenesisTime('');
    } catch (err) {
      const env = err as ApiErrorEnvelope;
      setGenesisError(env.error?.message ?? (err instanceof Error ? err.message : 'Unexpected error'));
    } finally {
      setGenesisBusy(false);
    }
  };

  const isDraft = launch.status === 'DRAFT';

  return (
    <PanelCard title="Committee Actions">
      <Box display="flex" flexDirection="column" gap="16px">

        {/* Open application window */}
        {isDraft && (
          <Box display="flex" flexDirection="column" gap="8px">
            <Text fontSize="$sm" fontWeight="$semibold">Open Application Window</Text>
            <Text fontSize="$xs" color="$textSecondary">
              Transitions this launch from DRAFT to OPEN so validators can submit join requests.
            </Text>
            {openWindowError && (
              <Text fontSize="$xs" color="$textDanger">{openWindowError}</Text>
            )}
            <Button
              variant="primary"
              onClick={handleOpenWindow}
              isLoading={openWindowBusy}
              disabled={openWindowBusy}
            >
              {openWindowBusy ? 'Opening…' : 'Open Application Window'}
            </Button>
          </Box>
        )}

        {/* Monitor RPC URL */}
        <Box display="flex" flexDirection="column" gap="8px">
          <Text fontSize="$sm" fontWeight="$semibold">Monitor RPC URL</Text>
          <Text fontSize="$xs" color="$textSecondary">
            CometBFT RPC endpoint for block-height monitoring. Can be updated at any launch status.
          </Text>
          <TextInput
            value={monitorRPC}
            onChange={(v) => { setMonitorRPC(v); setMonitorRPCSaved(false); }}
            placeholder="https://rpc.mychain.example.com"
            disabled={monitorRPCBusy}
          />
          {monitorRPCError && (
            <Text fontSize="$xs" color="$textDanger">{monitorRPCError}</Text>
          )}
          {monitorRPCSaved && (
            <Text fontSize="$xs" color="$textSuccess">Saved.</Text>
          )}
          <Button
            variant="primary"
            onClick={handleSetMonitorRPC}
            isLoading={monitorRPCBusy}
            disabled={monitorRPCBusy}
          >
            {monitorRPCBusy ? 'Saving…' : 'Set Monitor RPC'}
          </Button>
        </Box>

        {/* Genesis upload (attestor mode) */}
        <Box display="flex" flexDirection="column" gap="8px">
          <Text fontSize="$sm" fontWeight="$semibold">Upload Genesis Reference</Text>
          <Text fontSize="$xs" color="$textSecondary">
            Attestor mode: provide a public URL and SHA-256 hash. The server stores the reference; validators download directly.
          </Text>

          <Box display="flex" gap="12px">
            {(['initial', 'final'] as const).map((t) => (
              <Box
                key={t}
                as="label"
                display="flex"
                gap="4px"
                alignItems="center"
                attributes={{ style: { cursor: 'pointer', fontSize: '13px' } }}
              >
                <input
                  type="radio"
                  name="genesis-type"
                  value={t}
                  checked={genesisType === t}
                  onChange={() => setGenesisType(t)}
                />
                <Text fontSize="$xs">{t === 'initial' ? 'Initial' : 'Final'}</Text>
              </Box>
            ))}
          </Box>

          <Box>
            <FieldLabel>Public URL *</FieldLabel>
            <TextInput
              value={genesisURL}
              onChange={setGenesisURL}
              placeholder="https://files.example.com/genesis.json"
              disabled={genesisBusy}
            />
          </Box>

          <Box>
            <FieldLabel>SHA-256 *</FieldLabel>
            <TextInput
              value={genesisSHA256}
              onChange={setGenesisSHA256}
              placeholder="64-character hex digest"
              disabled={genesisBusy}
            />
          </Box>

          {genesisType === 'final' && (
            <Box>
              <FieldLabel>Genesis time (RFC 3339) *</FieldLabel>
              <TextInput
                value={genesisTime}
                onChange={setGenesisTime}
                placeholder="2026-06-01T12:00:00Z"
                disabled={genesisBusy}
              />
            </Box>
          )}

          {genesisError && (
            <Text fontSize="$xs" color="$textDanger">{genesisError}</Text>
          )}
          {genesisSaved && (
            <Text fontSize="$xs" color="$textSuccess">Genesis reference saved.</Text>
          )}

          <Button
            variant="primary"
            onClick={handleGenesisUpload}
            isLoading={genesisBusy}
            disabled={genesisBusy}
          >
            {genesisBusy ? 'Uploading…' : 'Submit Genesis Reference'}
          </Button>
        </Box>

        {/* Cancel launch — lead only, non-terminal status */}
        {isLead && launch.status !== 'LAUNCHED' && launch.status !== 'CANCELED' && (
          <Box display="flex" flexDirection="column" gap="8px">
            <Text fontSize="$sm" fontWeight="$semibold" color="$textDanger">Cancel Launch</Text>
            <Text fontSize="$xs" color="$textSecondary">
              Emergency action. Immediately transitions this launch to CANCELED. Cannot be undone.
            </Text>
            {cancelError && (
              <Text fontSize="$xs" color="$textDanger">{cancelError}</Text>
            )}
            {!cancelConfirm ? (
              <Button variant="outline" size="sm" onClick={() => setCancelConfirm(true)}>
                Cancel Launch
              </Button>
            ) : (
              <Box display="flex" gap="8px" alignItems="center">
                <Text fontSize="$xs" color="$textDanger">Are you sure?</Text>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCancel}
                  isLoading={cancelBusy}
                  disabled={cancelBusy}
                >
                  {cancelBusy ? 'Canceling…' : 'Confirm Cancel'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCancelConfirm(false)} disabled={cancelBusy}>
                  Keep Launch
                </Button>
              </Box>
            )}
          </Box>
        )}

      </Box>
    </PanelCard>
  );
}

// ── Gentxs download ───────────────────────────────────────────────────────────

interface GentxsSectionProps {
  launchId: string;
}

function GentxsSection({ launchId }: GentxsSectionProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const data = await getLaunchIdGentxs(launchId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gentxs-${launchId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const env = err as ApiErrorEnvelope;
      setError(env.error?.message ?? (err instanceof Error ? err.message : 'Download failed'));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <PanelCard title="Download Gentxs">
      <Text fontSize="$xs" color="$textSecondary">
        Download all approved validator gentxs as a JSON bundle. Use this to assemble the final genesis file.
      </Text>
      {error && <Text fontSize="$xs" color="$textDanger">{error}</Text>}
      <Button variant="primary" onClick={handleDownload} isLoading={isBusy} disabled={isBusy}>
        {isBusy ? 'Downloading…' : 'Download gentxs.json'}
      </Button>
    </PanelCard>
  );
}

// ── Allocation files ──────────────────────────────────────────────────────────
//
// GAP NOTE (UI ⇄ backend): coordd's POST /launch/{id}/allocations/{type} accepts TWO modes,
// switched by Content-Type — attestor (application/json: external URL + SHA-256) and host
// (application/octet-stream: raw file bytes, gated by COORD_GENESIS_HOST_MODE). This UI
// deliberately surfaces ATTESTOR MODE ONLY, matching the genesis-upload UI, which is also
// attestor-only. Host-mode raw uploads remain a backend/CLI capability with no web affordance.
// See docs/decisions.md ("Allocation files: attestor-only upload") for the rationale + how to add host mode.

const ALLOCATION_TYPES = ['accounts', 'claims', 'grants', 'authz', 'feegrant'] as const;
type AllocationType = (typeof ALLOCATION_TYPES)[number];

const SELECT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid var(--chakra-colors-divider, #e2e8f0)',
  background: 'transparent',
  color: 'inherit',
  fontSize: '14px',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

interface AllocationFilesSectionProps {
  launchId: string;
}

function AllocationFilesSection({ launchId }: AllocationFilesSectionProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useGetLaunchIdAllocations(launchId);
  const allocations = data?.allocations ?? [];

  const [uploadType, setUploadType] = useState<AllocationType>('accounts');
  const [url, setUrl] = useState('');
  const [sha256, setSha256] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSaved, setUploadSaved] = useState(false);

  const [downloadingType, setDownloadingType] = useState<AllocationType | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleUpload = async () => {
    setUploadBusy(true);
    setUploadError(null);
    setUploadSaved(false);

    if (!url.trim()) {
      setUploadError('URL is required.');
      setUploadBusy(false);
      return;
    }
    if (!sha256.trim()) {
      setUploadError('SHA-256 is required.');
      setUploadBusy(false);
      return;
    }

    try {
      // Attestor mode (JSON { url, sha256 }) — the generated fetcher carries no typed body, so
      // attach it via options, exactly like handleGenesisUpload. Host mode (raw bytes) is not
      // surfaced here (see the GAP NOTE above).
      await postLaunchIdAllocationsType(launchId, uploadType, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), sha256: sha256.trim() }),
      });
      queryClient.invalidateQueries();
      setUploadSaved(true);
      setUrl('');
      setSha256('');
    } catch (err) {
      const env = err as ApiErrorEnvelope;
      setUploadError(env.error?.message ?? (err instanceof Error ? err.message : 'Unexpected error'));
    } finally {
      setUploadBusy(false);
    }
  };

  const handleDownload = async (type: AllocationType) => {
    setDownloadingType(type);
    setDownloadError(null);
    try {
      // Bytes/302 endpoint — the generated (JSON) client can't serve it (the shared mutator
      // force-parses res.json()), so use authedFetch like the genesis download. Host-mode files
      // stream raw bytes; attestor-mode files 302 to an external URL, where a cross-origin fetch
      // is best-effort and may be blocked by the remote host's CORS policy.
      const r = await authedFetch(`/launch/${launchId}/allocations/${type}`);
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as ApiErrorEnvelope;
        setDownloadError(body.error?.message ?? `Server returned ${r.status}`);
        return;
      }
      const arrayBuf = await r.arrayBuffer();
      const blob = new Blob([arrayBuf], { type: 'application/octet-stream' });
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `${type}-allocation`;
      a.click();
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloadingType(null);
    }
  };

  return (
    <PanelCard title="Allocation Files">
      <Text fontSize="$xs" color="$textSecondary">
        Register allocation files by type (attestor mode: a public URL + SHA-256). Each file lands
        PENDING until approved via an APPROVE_ALLOCATION_FILE proposal.
      </Text>

      {isLoading ? (
        <Text fontSize="$xs" color="$textSecondary">Loading…</Text>
      ) : error ? (
        <Text fontSize="$xs" color="$textDanger">
          {error.error?.message ?? 'Failed to load allocation files'}
        </Text>
      ) : allocations.length === 0 ? (
        <Text fontSize="$xs" color="$textSecondary">No allocation files registered yet.</Text>
      ) : (
        <Box display="flex" flexDirection="column" gap="8px">
          {allocations.map((a) => (
            <Box
              key={a.type}
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              gap="8px"
            >
              <Box display="flex" flexDirection="column">
                <Text fontSize="$sm" fontWeight="$semibold">{a.type}</Text>
                <Text fontSize="$xs" color="$textSecondary" fontFamily="monospace">
                  {truncate(a.sha256 ?? '', 24)}
                </Text>
              </Box>
              <Box display="flex" alignItems="center" gap="8px">
                {a.status && <StatusBadge status={a.status} />}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(a.type as AllocationType)}
                  isLoading={downloadingType === a.type}
                  disabled={downloadingType !== null}
                >
                  Download
                </Button>
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {downloadError && <Text fontSize="$xs" color="$textDanger">{downloadError}</Text>}

      <Box display="flex" flexDirection="column" gap="8px" attributes={{ mt: '8px' }}>
        <Text fontSize="$sm" fontWeight="$semibold">Register Allocation File</Text>
        <Box>
          <FieldLabel>Type</FieldLabel>
          <select
            value={uploadType}
            onChange={(e) => setUploadType(e.target.value as AllocationType)}
            disabled={uploadBusy}
            style={SELECT_STYLE}
          >
            {ALLOCATION_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Box>
        <Box>
          <FieldLabel>Public URL *</FieldLabel>
          <TextInput
            value={url}
            onChange={setUrl}
            placeholder="https://files.example.com/accounts.csv"
            disabled={uploadBusy}
          />
        </Box>
        <Box>
          <FieldLabel>SHA-256 *</FieldLabel>
          <TextInput
            value={sha256}
            onChange={setSha256}
            placeholder="64-char hex SHA-256 digest"
            disabled={uploadBusy}
          />
        </Box>
        {uploadError && <Text fontSize="$xs" color="$textDanger">{uploadError}</Text>}
        {uploadSaved && <Text fontSize="$xs" color="$textSuccess">Allocation file registered.</Text>}
        <Button variant="primary" onClick={handleUpload} isLoading={uploadBusy} disabled={uploadBusy}>
          {uploadBusy ? 'Registering…' : 'Register allocation file'}
        </Button>
      </Box>
    </PanelCard>
  );
}

// ── Replace committee (DRAFT + lead only) ────────────────────────────────────

interface ReplaceCommitteeSectionProps {
  launchId: string;
  address: string;
  wallet: StatefulWallet;
  signingChainId: string;
  committee: ApiCommitteeJSON;
}

interface MemberInput {
  address: string;
  moniker: string;
}

function ReplaceCommitteeSection({
  launchId,
  address,
  wallet,
  signingChainId,
  committee,
}: ReplaceCommitteeSectionProps) {
  const queryClient = useQueryClient();
  const replaceCommittee = usePostLaunchIdCommittee();

  const [open, setOpen] = useState(false);
  const [thresholdM, setThresholdM] = useState(String(committee.threshold_m ?? ''));
  const [totalN, setTotalN] = useState(String(committee.total_n ?? ''));
  const [members, setMembers] = useState<MemberInput[]>(
    (committee.members ?? []).map((m) => ({
      address: m.address ?? '',
      moniker: m.moniker ?? '',
    })),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function updateMember(idx: number, field: keyof MemberInput, value: string) {
    setMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)));
  }

  function addMember() {
    setMembers((prev) => [...prev, { address: '', moniker: '' }]);
    setTotalN((n) => String(Number(n) + 1));
  }

  function removeMember(idx: number) {
    if (idx === 0) return;
    setMembers((prev) => prev.filter((_, i) => i !== idx));
    setTotalN((n) => String(Math.max(1, Number(n) - 1)));
  }

  const handleSubmit = async () => {
    setError(null);
    const m = Number(thresholdM);
    const n = Number(totalN);
    if (m < 1 || m > n) { setError(`threshold_m must be between 1 and ${n}`); return; }
    if (members.length !== n) { setError(`member count (${members.length}) must equal total_n (${n})`); return; }

    // Committee member addresses must be present and unique — the backend rejects otherwise.
    const memberAddrs = members.map((mb) => mb.address.trim());
    if (memberAddrs.some((a) => !a)) { setError('every committee member needs an address'); return; }
    const dupeAddr = memberAddrs.find((a, i) => memberAddrs.indexOf(a) !== i);
    if (dupeAddr) { setError(`duplicate committee member address: ${dupeAddr}`); return; }

    setIsSubmitting(true);
    try {
      // No signature is needed at committee creation — members register their pubkey when they first
      // sign a proposal (the ADR-036 envelope carries it). See plan-chaincoord-committee-pubkeys.md.
      await replaceCommittee.mutateAsync({
        id: launchId,
        data: {
          members: members.map((mb) => ({
            address: mb.address.trim(),
            moniker: mb.moniker.trim(),
          })),
          threshold_m: m,
          total_n: n,
          lead_address: address,
        },
      });

      queryClient.invalidateQueries();
      setSuccess(true);
      setOpen(false);
    } catch (err) {
      const env = err as ApiErrorEnvelope;
      setError(env.error?.message ?? (err instanceof Error ? err.message : 'Unexpected error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PanelCard title="Replace Committee">
      {success && (
        <Text fontSize="$xs" color="$textSuccess" attributes={{ mb: '4px' }}>Committee updated.</Text>
      )}
      {!open ? (
        <Box display="flex" flexDirection="column" gap="8px">
          <Text fontSize="$xs" color="$textSecondary">
            Replace the committee members or thresholds. Only available while the launch is in DRAFT status.
          </Text>
          <Button variant="outline" size="sm" onClick={() => { setOpen(true); setSuccess(false); }}>
            Edit Committee
          </Button>
        </Box>
      ) : (
        <Box display="flex" flexDirection="column" gap="12px">
          <Box display="flex" gap="12px">
            <Box display="flex" flexDirection="column" gap="4px" attributes={{ style: { flex: 1 } }}>
              <FieldLabel>Threshold M</FieldLabel>
              <TextInput value={thresholdM} onChange={setThresholdM} placeholder="1" disabled={isSubmitting} />
            </Box>
            <Box display="flex" flexDirection="column" gap="4px" attributes={{ style: { flex: 1 } }}>
              <FieldLabel>Total N</FieldLabel>
              <TextInput
                value={totalN}
                onChange={(v) => {
                  setTotalN(v);
                  const n = Number(v);
                  if (members.length < n) {
                    setMembers((prev) => [
                      ...prev,
                      ...Array(n - prev.length).fill(null).map(() => ({ address: '', moniker: '' })),
                    ]);
                  } else if (members.length > n && n >= 1) {
                    setMembers((prev) => prev.slice(0, n));
                  }
                }}
                placeholder="1"
                disabled={isSubmitting}
              />
            </Box>
          </Box>

          {members.map((mb, idx) => (
            <Box
              key={idx}
              borderRadius="6px"
              border="1px solid"
              borderColor="$divider"
              p="12px"
              display="flex"
              flexDirection="column"
              gap="8px"
            >
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Text fontSize="$xs" color="$textSecondary">
                  {idx === 0 ? 'Lead (you)' : `Member ${idx + 1}`}
                </Text>
                {idx > 0 && (
                  <Button variant="text" size="sm" onClick={() => removeMember(idx)} disabled={isSubmitting}>
                    Remove
                  </Button>
                )}
              </Box>
              <TextInput
                value={mb.address}
                onChange={(v) => updateMember(idx, 'address', v)}
                placeholder="cosmos1…"
                disabled={idx === 0 || isSubmitting}
              />
              <TextInput
                value={mb.moniker}
                onChange={(v) => updateMember(idx, 'moniker', v)}
                placeholder="Moniker (optional)"
                disabled={isSubmitting}
              />
            </Box>
          ))}

          <Button variant="outline" size="sm" onClick={addMember} disabled={isSubmitting}>
            + Add Member
          </Button>

          {error && <Text fontSize="$xs" color="$textDanger">{error}</Text>}

          <Box display="flex" gap="8px">
            <Button variant="primary" onClick={handleSubmit} isLoading={isSubmitting} disabled={isSubmitting}>
              {isSubmitting ? 'Signing & Saving…' : 'Update Committee'}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
          </Box>
        </Box>
      )}
    </PanelCard>
  );
}

// ── Members allowlist ─────────────────────────────────────────────────────────
//
// Private-always visibility: the members allowlist controls who can *see* the launch and
// submit join requests. Committee members add each validator's HOT address (with a label
// pointing to off-band verification) and can remove entries. Clean JSON CRUD → orval hooks.

interface MembersSectionProps {
  launchId: string;
}

function MembersSection({ launchId }: MembersSectionProps) {
  const { data, isLoading, error, refetch } = useGetLaunchIdMembers(launchId);
  // The endpoint returns a bare array; guard against a non-array body (defensive).
  const members = Array.isArray(data) ? data : [];

  const addMember = usePostLaunchIdMembers();
  const removeMember = useDeleteLaunchIdMembersAddress();

  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingAddr, setConfirmingAddr] = useState<string | null>(null);
  const [removingAddr, setRemovingAddr] = useState<string | null>(null);

  const handleAdd = async () => {
    const address = newAddress.trim();
    if (!address) {
      setAddError('Address is required.');
      return;
    }
    setAddError(null);
    try {
      await addMember.mutateAsync({
        id: launchId,
        data: { address, label: newLabel.trim() || undefined },
      });
      setNewAddress('');
      setNewLabel('');
      refetch();
    } catch (err) {
      const env = err as ApiErrorEnvelope;
      setAddError(env.error?.message ?? (err instanceof Error ? err.message : 'Unexpected error'));
    }
  };

  const handleRemove = async (address: string) => {
    setRemovingAddr(address);
    setActionError(null);
    try {
      await removeMember.mutateAsync({ id: launchId, address });
    } catch (err) {
      // A 404 (already gone) is benign — fall through to refetch. Anything else surfaces.
      const env = err as ApiErrorEnvelope & { status?: number };
      if (env.status !== 404) {
        setActionError(env.error?.message ?? (err instanceof Error ? err.message : 'Unexpected error'));
        setRemovingAddr(null);
        setConfirmingAddr(null);
        return;
      }
    }
    refetch();
    setRemovingAddr(null);
    setConfirmingAddr(null);
  };

  return (
    <PanelCard title="Members Allowlist">
      <Text fontSize="$xs" color="$textSecondary">
        Controls who can see this private launch and submit join requests. Add each validator&apos;s
        hot address with a label pointing to off-band verification of who that operator is.
      </Text>

      <Box display="flex" flexDirection="column" gap="8px">
        <Box>
          <FieldLabel>Address *</FieldLabel>
          <TextInput
            value={newAddress}
            onChange={setNewAddress}
            placeholder="cosmos1… hot address"
            disabled={addMember.isLoading}
          />
        </Box>
        <Box>
          <FieldLabel>Label</FieldLabel>
          <TextInput
            value={newLabel}
            onChange={setNewLabel}
            placeholder="e.g. Acme Validators (optional)"
            disabled={addMember.isLoading}
          />
        </Box>
        {addError && <Text fontSize="$xs" color="$textDanger">{addError}</Text>}
        <Button variant="primary" onClick={handleAdd} isLoading={addMember.isLoading} disabled={addMember.isLoading}>
          {addMember.isLoading ? 'Adding…' : 'Add member'}
        </Button>
      </Box>

      {actionError && <Text fontSize="$xs" color="$textDanger">{actionError}</Text>}

      {isLoading ? (
        <Text fontSize="$xs" color="$textSecondary">Loading…</Text>
      ) : error ? (
        <Text fontSize="$xs" color="$textDanger">
          {error.error?.message ?? 'Failed to load members'}
        </Text>
      ) : members.length === 0 ? (
        <Text fontSize="$xs" color="$textSecondary">No members on the allowlist yet.</Text>
      ) : (
        <Box display="flex" flexDirection="column" gap="8px">
          {members.map((m) => (
            <Box
              key={m.address}
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              gap="8px"
            >
              <Box display="flex" flexDirection="column">
                <Text fontSize="$sm" fontWeight="$semibold" fontFamily="monospace">
                  {truncate(m.address ?? '', 24)}
                </Text>
                {m.label && <Text fontSize="$xs" color="$textSecondary">{m.label}</Text>}
              </Box>
              {confirmingAddr === m.address ? (
                <Box display="flex" gap="8px" alignItems="center">
                  <Text fontSize="$xs" color="$textDanger">Remove?</Text>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleRemove(m.address ?? '')}
                    isLoading={removingAddr === m.address}
                    disabled={removingAddr !== null}
                  >
                    Confirm
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmingAddr(null)}
                    disabled={removingAddr !== null}
                  >
                    Keep
                  </Button>
                </Box>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmingAddr(m.address ?? null)}
                  disabled={removingAddr !== null}
                >
                  Remove
                </Button>
              )}
            </Box>
          ))}
        </Box>
      )}
    </PanelCard>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface CommitteePanelProps {
  launchId: string;
  hint: ChainHint;
  address: string;
  wallet: StatefulWallet;
  signingChainId: string;
  launch: ApiLaunchJSON;
  committee: ApiCommitteeJSON;
  isLead: boolean;
}

export function CommitteePanel({
  launchId,
  hint,
  address,
  wallet,
  signingChainId,
  launch,
  committee,
  isLead,
}: CommitteePanelProps) {
  return (
    <Box display="flex" flexDirection="column" gap="16px">
      <CommitteeActionsSection
        launchId={launchId}
        launch={launch}
        isLead={isLead}
      />
      <GentxsSection launchId={launchId} />
      <AllocationFilesSection launchId={launchId} />
      <MembersSection launchId={launchId} />
      {isLead && launch.status === 'DRAFT' && (
        <ReplaceCommitteeSection
          launchId={launchId}
          address={address}
          wallet={wallet}
          signingChainId={signingChainId}
          committee={committee}
        />
      )}
      <JoinQueueSection
        launchId={launchId}
        hint={hint}
        address={address}
        wallet={wallet}
        signingChainId={signingChainId}
      />
      <ProposalListSection
        launchId={launchId}
        hint={hint}
        address={address}
        wallet={wallet}
        signingChainId={signingChainId}
      />
    </Box>
  );
}
