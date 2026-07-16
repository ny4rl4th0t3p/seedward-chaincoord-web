import { useRouter } from 'next/router';
import Link from 'next/link';
import { Box, Text } from '@interchain-ui/react';
import { useAuth } from '@/contexts';
import { useGetLaunchIdProposalPropId } from '@/api/generated/proposals/proposals';

/**
 * Deep-linkable, read-only detail for a single proposal
 * (GET /launch/{id}/proposal/{propId}). Visibility-gated by coordd (committee ∪ members), so a
 * non-member sees a not-found message. Sign/veto actions live on the launch page, not here.
 */
export default function ProposalDetailPage() {
  const router = useRouter();
  const launchId = router.query.id as string;
  const propId = router.query.propId as string;
  const { isAuthenticated } = useAuth();

  if (!launchId || !propId) return null;

  return (
    <Box maxWidth="800px" mx="auto" mt="40px" px="16px">
      <Box attributes={{ mb: '16px' }}>
        <Link href={`/launch/${launchId}`}>
          <Text fontSize="$sm" color="$textSecondary">← Back to launch</Text>
        </Link>
      </Box>
      {!isAuthenticated ? (
        <Text fontSize="$sm" color="$textSecondary">
          Sign in with your committee wallet to view this proposal.
        </Text>
      ) : (
        <ProposalDetail launchId={launchId} propId={propId} />
      )}
    </Box>
  );
}

function ProposalDetail({ launchId, propId }: { launchId: string; propId: string }) {
  const { data: proposal, isLoading, error } = useGetLaunchIdProposalPropId(launchId, propId, {
    query: { retry: false },
  });

  if (isLoading) {
    return <Text fontSize="$sm" color="$textSecondary">Loading…</Text>;
  }
  if (error || !proposal) {
    return (
      <Text fontSize="$sm" color="$textDanger">
        {error?.error?.message ?? 'Proposal not found, or not visible to you.'}
      </Text>
    );
  }

  const signatures = proposal.signatures ?? [];

  return (
    <Box display="flex" flexDirection="column" gap="12px">
      <Text fontSize="$lg" fontWeight="$semibold">{proposal.action_type ?? 'Proposal'}</Text>

      <DetailRow label="Status" value={proposal.status ?? '—'} />
      <DetailRow label="Proposed by" value={proposal.proposed_by ?? '—'} mono />
      {proposal.proposed_at && (
        <DetailRow label="Proposed" value={new Date(proposal.proposed_at).toLocaleString()} />
      )}
      {proposal.ttl_expires && (
        <DetailRow label="Expires" value={new Date(proposal.ttl_expires).toLocaleString()} />
      )}

      <Box>
        <Text fontSize="$xs" color="$textSecondary" attributes={{ mb: '4px' }}>Payload</Text>
        <pre
          style={{
            margin: 0,
            padding: '12px',
            borderRadius: '6px',
            border: '1px solid var(--chakra-colors-divider, #e2e8f0)',
            overflowX: 'auto',
            fontSize: '12px',
          }}
        >
          {JSON.stringify(proposal.payload ?? {}, null, 2)}
        </pre>
      </Box>

      <Box>
        <Text fontSize="$xs" color="$textSecondary" attributes={{ mb: '4px' }}>
          Signatures ({signatures.length})
        </Text>
        {signatures.length === 0 ? (
          <Text fontSize="$xs" color="$textSecondary">No signatures yet.</Text>
        ) : (
          <Box display="flex" flexDirection="column" gap="2px">
            {signatures.map((s, i) => (
              <Text key={s.member_address ?? i} fontSize="$xs" fontFamily="monospace">
                {s.decision === 'SIGN' ? '✓' : '✗'} {s.member_address ?? ''}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box display="flex" gap="8px" alignItems="baseline">
      <Text fontSize="$xs" color="$textSecondary" attributes={{ minWidth: '120px', flexShrink: '0' }}>
        {label}
      </Text>
      <Text fontSize="$sm" fontFamily={mono ? 'monospace' : undefined}>{value}</Text>
    </Box>
  );
}
