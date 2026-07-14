import { useState } from 'react';
import { Box, Text } from '@interchain-ui/react';
import { Button } from '@/components';
import { useGetLaunchIdAudit, useGetAuditPubkey } from '@/api/generated/audit/audit';

/**
 * On-demand audit-log viewer for a launch (GET /launch/{id}/audit). The server audit pubkey
 * (GET /audit/pubkey) is fetched alongside as best-effort — a failure only hides the pubkey row
 * and never blocks the entries. Both queries carry auth via the shared mutator.
 */
export function AuditLogSection({ launchId }: { launchId: string }) {
  const [loadRequested, setLoadRequested] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const { data, isLoading, error } = useGetLaunchIdAudit(launchId, {
    query: { enabled: loadRequested },
  });
  const entries = data?.entries ?? null;

  const { data: pubkeyData } = useGetAuditPubkey({
    query: { enabled: loadRequested },
  });
  const pubkey = pubkeyData?.public_key ?? null;

  return (
    <Box borderRadius="8px" border="1px solid" borderColor="$divider" p="20px">
      <Text fontSize="$md" fontWeight="$semibold" attributes={{ mb: '12px' }}>Audit Log</Text>
      {!loadRequested ? (
        <Button variant="outline" size="sm" onClick={() => setLoadRequested(true)}>
          Load Audit Log
        </Button>
      ) : isLoading ? (
        <Text fontSize="$xs" color="$textSecondary">Loading…</Text>
      ) : error ? (
        <Text fontSize="$xs" color="$textDanger">
          {error.error?.message ?? 'Failed to load audit log'}
        </Text>
      ) : (
        <Box display="flex" flexDirection="column" gap="8px">
          {pubkey && (
            <Box display="flex" gap="8px" alignItems="baseline">
              <Text fontSize="$xs" color="$textSecondary" attributes={{ minWidth: '160px', flexShrink: '0' }}>
                Server audit pubkey
              </Text>
              <Text fontSize="$sm" fontFamily="monospace">{pubkey}</Text>
            </Box>
          )}
          {(entries ?? []).length === 0 ? (
            <Text fontSize="$xs" color="$textSecondary">No audit entries yet.</Text>
          ) : (
            (entries ?? []).map((e, i) => (
              <Box key={i} display="flex" flexDirection="column" gap="4px">
                <Box
                  display="flex"
                  gap="8px"
                  alignItems="baseline"
                  attributes={{
                    style: { cursor: 'pointer' },
                    onClick: () => setExpandedIdx(expandedIdx === i ? null : i),
                  }}
                >
                  <Text fontSize="$xs" color="$textSecondary" attributes={{ minWidth: '160px', flexShrink: '0' }}>
                    {e.occurred_at ? new Date(e.occurred_at).toLocaleString() : ''}
                  </Text>
                  <Text fontSize="$sm">{e.event_name}</Text>
                  <Text fontSize="$xs" color="$textSecondary">{expandedIdx === i ? '▲' : '▼'}</Text>
                </Box>
                {expandedIdx === i && (
                  <Box
                    borderRadius="4px"
                    p="8px"
                    attributes={{ style: { background: 'var(--chakra-colors-gray-50, #f7f7f7)', overflowX: 'auto' } }}
                  >
                    <Text fontSize="$xs" fontFamily="monospace">
                      {JSON.stringify(e.payload, null, 2)}
                    </Text>
                  </Box>
                )}
              </Box>
            ))
          )}
        </Box>
      )}
    </Box>
  );
}
