import { useState } from 'react';
import { Box, Text } from '@interchain-ui/react';
import { Button } from '@/components';
import { useAuth } from '@/contexts';
import { accountToBech32, bech32Prefix } from '@/utils/address';
import {
  useGetAdminCoordinators,
  usePostAdminCoordinators,
  useDeleteAdminCoordinatorsAddress,
  useDeleteAdminSessionsAddress,
} from '@/api/generated/admin/admin';
import type { ApiErrorEnvelope } from '@/api/generated/model';

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { isAuthenticated } = useAuth();

  // A cheap probe: list one coordinator. 403 ⇒ not an admin. Don't retry the 403.
  const probe = useGetAdminCoordinators(
    { page: 1, per_page: 1 },
    { query: { enabled: isAuthenticated, retry: false } },
  );

  const isAdmin: boolean | null = probe.isLoading
    ? null
    : probe.isError
    ? (probe.error as ApiErrorEnvelope & { status?: number }).status !== 403
    : true;

  if (!isAuthenticated) {
    return (
      <Box maxWidth="720px" mx="auto" mt="60px">
        <Text fontSize="$sm" color="$textSecondary">
          Sign in to access the admin panel.
        </Text>
      </Box>
    );
  }

  if (isAdmin === null) {
    return (
      <Box maxWidth="720px" mx="auto" mt="60px">
        <Text fontSize="$sm" color="$textSecondary">Checking access…</Text>
      </Box>
    );
  }

  if (!isAdmin) {
    return (
      <Box maxWidth="720px" mx="auto" mt="60px">
        <Text fontSize="$sm" color="$textDanger">
          You are not an admin. Set your address in{' '}
          <Text as="span" fontFamily="monospace" fontSize="$sm">COORD_ADMIN_ADDRESSES</Text>{' '}
          to enable admin access.
        </Text>
      </Box>
    );
  }

  return (
    <Box maxWidth="720px" mx="auto" mt="40px" pb="60px">
      <Text fontSize="28px" fontWeight="600" attributes={{ mb: '32px' }}>
        Admin Panel
      </Text>
      <CoordinatorAllowlistSection />
      <SessionRevocationSection />
    </Box>
  );
}

// ── Coordinator Allowlist ─────────────────────────────────────────────────────

function CoordinatorAllowlistSection() {
  const { operatorAddress } = useAuth();
  // The global coordinator allowlist stores canonical account hex; render it under the viewer's own
  // wallet prefix so the display matches the bech32 an admin enters (see accountToBech32).
  const viewerPrefix = bech32Prefix(operatorAddress);
  const { data, isLoading, error: listError, refetch } = useGetAdminCoordinators({
    page: 1,
    per_page: 100,
  });
  const entries = data?.items ?? [];
  const total = data?.total ?? 0;

  const addCoordinator = usePostAdminCoordinators();
  const removeCoordinator = useDeleteAdminCoordinatorsAddress();

  const [newAddress, setNewAddress] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [removingAddr, setRemovingAddr] = useState<string | null>(null);

  async function handleAdd() {
    const addr = newAddress.trim();
    if (!addr) return;
    setAddError(null);
    try {
      await addCoordinator.mutateAsync({ data: { address: addr } });
      setNewAddress('');
      refetch();
    } catch (err) {
      const env = err as ApiErrorEnvelope;
      setAddError(env.error?.message ?? (err instanceof Error ? err.message : String(err)));
    }
  }

  async function handleRemove(address: string) {
    setRemovingAddr(address);
    setActionError(null);
    try {
      await removeCoordinator.mutateAsync({ address });
    } catch (err) {
      // A 404 (already gone) is fine — fall through to refetch. Anything else surfaces.
      const env = err as ApiErrorEnvelope & { status?: number };
      if (env.status !== 404) {
        setActionError(env.error?.message ?? (err instanceof Error ? err.message : String(err)));
        setRemovingAddr(null);
        return;
      }
    }
    refetch();
    setRemovingAddr(null);
  }

  return (
    <AdminCard title={`Coordinator Allowlist${total > 0 ? ` (${total})` : ''}`}>
      {listError && (
        <Text fontSize="$xs" color="$textDanger" attributes={{ mb: '8px' }}>
          {listError.error?.message ?? 'Failed to load coordinators'}
        </Text>
      )}
      {actionError && (
        <Text fontSize="$xs" color="$textDanger" attributes={{ mb: '8px' }}>{actionError}</Text>
      )}

      {/* Add form */}
      <Box display="flex" gap="8px" alignItems="center" attributes={{ mb: '16px' }}>
        <input
          value={newAddress}
          onChange={(e) => setNewAddress(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="cosmos1… address to add"
          style={inputStyle}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={handleAdd}
          isLoading={addCoordinator.isLoading}
          disabled={addCoordinator.isLoading}
        >
          Add
        </Button>
      </Box>
      {addError && (
        <Text fontSize="$xs" color="$textDanger" attributes={{ mb: '8px' }}>{addError}</Text>
      )}

      {/* List */}
      {isLoading ? (
        <Text fontSize="$xs" color="$textSecondary">Loading…</Text>
      ) : entries.length === 0 ? (
        <Text fontSize="$xs" color="$textSecondary">No coordinators on the allowlist.</Text>
      ) : (
        <Box display="flex" flexDirection="column" gap="8px">
          {entries.map((e) => {
            const display = accountToBech32(e.address, viewerPrefix);
            return (
              <Box
                key={e.address}
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                borderRadius="6px"
                border="1px solid"
                borderColor="$divider"
                px="12px"
                py="8px"
              >
                <Box>
                  <Text fontSize="$sm" fontFamily="monospace">{display}</Text>
                  <Text fontSize="$xs" color="$textSecondary">
                    Added by {e.added_by || '—'}{e.added_at ? ` · ${new Date(e.added_at).toLocaleString()}` : ''}
                  </Text>
                </Box>
                <Button
                  variant="text"
                  size="sm"
                  onClick={() => handleRemove(display)}
                  disabled={removingAddr === display}
                >
                  {removingAddr === display ? '…' : 'Remove'}
                </Button>
              </Box>
            );
          })}
        </Box>
      )}
    </AdminCard>
  );
}

// ── Session Revocation ────────────────────────────────────────────────────────

function SessionRevocationSection() {
  const revokeSessions = useDeleteAdminSessionsAddress();
  const [targetAddress, setTargetAddress] = useState('');
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  async function handleRevoke() {
    const addr = targetAddress.trim();
    if (!addr) return;
    setMessage(null);
    try {
      await revokeSessions.mutateAsync({ address: addr });
      setTargetAddress('');
      setMessage({ text: `Sessions revoked for ${addr}`, isError: false });
    } catch (err) {
      const env = err as ApiErrorEnvelope;
      setMessage({
        text: env.error?.message ?? (err instanceof Error ? err.message : String(err)),
        isError: true,
      });
    }
  }

  return (
    <AdminCard title="Session Revocation">
      <Text fontSize="$xs" color="$textSecondary" attributes={{ mb: '12px' }}>
        Revoke all active sessions for an operator address. The user will need to sign in again.
      </Text>
      <Box display="flex" gap="8px" alignItems="center">
        <input
          value={targetAddress}
          onChange={(e) => setTargetAddress(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleRevoke(); }}
          placeholder="cosmos1… address to revoke"
          style={inputStyle}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleRevoke}
          isLoading={revokeSessions.isLoading}
          disabled={revokeSessions.isLoading || !targetAddress.trim()}
        >
          Revoke Sessions
        </Button>
      </Box>
      {message && (
        <Text
          fontSize="$xs"
          color={message.isError ? '$textDanger' : '$textSuccess'}
          attributes={{ mt: '8px' }}
        >
          {message.text}
        </Text>
      )}
    </AdminCard>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function AdminCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box
      borderRadius="8px"
      border="1px solid"
      borderColor="$divider"
      p="20px"
      attributes={{ style: { marginBottom: 20 } }}
    >
      <Text fontSize="$md" fontWeight="$semibold" attributes={{ mb: '16px' }}>
        {title}
      </Text>
      {children}
    </Box>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid var(--chakra-colors-divider, #e2e8f0)',
  background: 'transparent',
  color: 'inherit',
  fontSize: 14,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
