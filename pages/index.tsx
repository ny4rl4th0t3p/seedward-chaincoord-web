import { useState } from 'react';
import Link from 'next/link';
import { Box, Text } from '@interchain-ui/react';
import { Button } from '@/components';
import { useAuth } from '@/contexts';
import { useGetLaunches } from '@/api/generated/launches/launches';

// Keys are coordd's on-the-wire status values (uppercase — see bridge-contract §2).
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  WINDOW_OPEN: 'Window Open',
  WINDOW_CLOSED: 'Window Closed',
  GENESIS_READY: 'Genesis Ready',
  LAUNCHED: 'Launched',
  CANCELED: 'Canceled',
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: '$textSecondary',
  PUBLISHED: '$text',
  WINDOW_OPEN: '$textSuccess',
  WINDOW_CLOSED: '$text',
  GENESIS_READY: '$textSuccess',
  LAUNCHED: '$purple600',
  CANCELED: '$textDanger',
};

export default function LaunchList() {
  const { isAuthenticated, isCoordinator } = useAuth();
  const [page, setPage] = useState(1);
  const perPage = 20;

  const { data, isLoading, error } = useGetLaunches({ page, per_page: perPage });

  const launches = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / perPage);

  return (
    <Box maxWidth="900px" mx="auto" mt="40px">
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" attributes={{ mb: '8px' }}>
        <Text fontSize="28px" fontWeight="600">
          Chain Launches
        </Text>
        {isAuthenticated && isCoordinator && (
          <Link href="/launch/new">
            <Button variant="primary" size="sm">New Launch</Button>
          </Link>
        )}
      </Box>
      <Text fontSize="$sm" color="$textSecondary" attributes={{ mb: '32px' }}>
        {total > 0 ? `${total} launch${total === 1 ? '' : 'es'}` : ''}
      </Text>

      {isLoading && (
        <Text color="$textSecondary" fontSize="$sm">
          Loading…
        </Text>
      )}

      {error && (
        <Text color="$textDanger" fontSize="$sm">
          {error.error?.message ?? 'Failed to load launches'}
        </Text>
      )}

      {!isLoading && !error && launches.length === 0 && (
        <Box
          borderRadius="8px"
          border="1px solid"
          borderColor="$divider"
          p="32px"
          textAlign="center"
        >
          <Text color="$textSecondary" fontSize="$sm">
            No launches yet.
          </Text>
        </Box>
      )}

      {launches.length > 0 && (
        <Box
          borderRadius="8px"
          border="1px solid"
          borderColor="$divider"
          overflow="hidden"
        >
          {/* Header row */}
          <Box
            display="grid"
            attributes={{
              style: {
                gridTemplateColumns: '2fr 1.5fr 1fr 1fr',
                borderBottom: '1px solid var(--interchain-divider)',
              },
            }}
            px="16px"
            py="10px"
            backgroundColor="$cardBg"
            borderColor="$divider"
          >
            {['Chain', 'Chain ID', 'Type', 'Status'].map((h) => (
              <Text key={h} fontSize="$xs" fontWeight="$semibold" color="$textSecondary">
                {h}
              </Text>
            ))}
          </Box>

          {/* Data rows */}
          {launches.map((l, i) => (
            <Link key={l.id} href={`/launch/${l.id}`}>
              <Box
                display="grid"
                attributes={{
                  style: {
                    gridTemplateColumns: '2fr 1.5fr 1fr 1fr',
                    borderBottom: i < launches.length - 1 ? '1px solid var(--interchain-divider)' : undefined,
                  },
                }}
                px="16px"
                py="14px"
                borderColor="$divider"
                backgroundColor={{ hover: '$cardBg', base: 'transparent' }}
                cursor="pointer"
              >
                <Box>
                  <Text fontSize="$sm" fontWeight="$medium">
                    {l.record?.chain_name}
                  </Text>
                  <Text fontSize="$xs" color="$textSecondary">
                    {l.record?.denom}
                  </Text>
                </Box>
                <Text fontSize="$sm" color="$textSecondary" fontFamily="monospace">
                  {l.record?.chain_id}
                </Text>
                <Text fontSize="$sm" color="$textSecondary">
                  {l.launch_type}
                </Text>
                <Text
                  fontSize="$sm"
                  fontWeight="$medium"
                  color={STATUS_COLOR[l.status ?? ''] ?? '$text'}
                >
                  {STATUS_LABEL[l.status ?? ''] ?? l.status}
                </Text>
              </Box>
            </Link>
          ))}
        </Box>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Box display="flex" justifyContent="center" gap="8px" mt="24px">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            style={{ padding: '6px 14px', cursor: page <= 1 ? 'default' : 'pointer' }}
          >
            ← Prev
          </button>
          <Text fontSize="$sm" color="$textSecondary" attributes={{ lineHeight: '32px' }}>
            {page} / {totalPages}
          </Text>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={{ padding: '6px 14px', cursor: page >= totalPages ? 'default' : 'pointer' }}
          >
            Next →
          </button>
        </Box>
      )}
    </Box>
  );
}
