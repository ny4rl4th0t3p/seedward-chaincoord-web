import { useState } from 'react';
import { Box, Text } from '@interchain-ui/react';
import { Button } from '@/components';
import { authedFetch } from '@/api/authedFetch';
import { computeSha256Hex } from '@/utils/sha256';
import type { ApiErrorEnvelope } from '@/api/generated/model';

/**
 * Member-visible genesis download card for the launch detail page (any committee ∪ allowlist member —
 * the page is visibility-gated, so if it renders the caller is a member). Offers the **initial**
 * genesis once uploaded and the **final** once published, downloaded independently via
 * ?type=initial|final, each SHA-256-verified against the launch record's hash.
 *
 * The initial stays downloadable after the final is published — that is the reproduction/verification
 * input a committee member needs to rebuild and check the final before signing PUBLISH_GENESIS.
 * (The validator readiness flow keeps its own GenesisSection, which wants the final specifically.)
 */
export function GenesisCard({
  launchId,
  initialSha256,
  finalSha256,
}: {
  launchId: string;
  initialSha256?: string;
  finalSha256?: string;
}) {
  if (!initialSha256 && !finalSha256) return null;

  return (
    <Box borderRadius="8px" border="1px solid" borderColor="$divider" p="20px">
      <Text fontSize="$md" fontWeight="$semibold" attributes={{ mb: '12px' }}>Genesis Files</Text>
      <Box display="flex" flexDirection="column" gap="16px">
        {initialSha256 && (
          <GenesisRow
            launchId={launchId}
            type="initial"
            label="Initial genesis"
            hint="The pre-gentx base — download it to reproduce and verify the final before signing PUBLISH_GENESIS."
            expectedSha256={initialSha256}
          />
        )}
        {finalSha256 && (
          <GenesisRow
            launchId={launchId}
            type="final"
            label="Final genesis"
            hint="The committee-assembled genesis validators launch from."
            expectedSha256={finalSha256}
          />
        )}
      </Box>
    </Box>
  );
}

function GenesisRow({
  launchId,
  type,
  label,
  hint,
  expectedSha256,
}: {
  launchId: string;
  type: 'initial' | 'final';
  label: string;
  hint: string;
  expectedSha256: string;
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifiedHash, setVerifiedHash] = useState<string | null>(null);
  const [hashMatch, setHashMatch] = useState<boolean | null>(null);

  async function handleDownload() {
    setIsDownloading(true);
    setError(null);
    setVerifiedHash(null);
    setHashMatch(null);
    try {
      const r = await authedFetch(`/launch/${launchId}/genesis?type=${type}`);
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as ApiErrorEnvelope;
        setError(body.error?.message ?? `Server returned ${r.status}`);
        return;
      }
      const arrayBuf = await r.arrayBuffer();
      const hex = await computeSha256Hex(arrayBuf);
      setVerifiedHash(hex);
      setHashMatch(hex === expectedSha256);

      const url = URL.createObjectURL(new Blob([arrayBuf], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `genesis-${type}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Box display="flex" flexDirection="column" gap="6px">
      <Text fontSize="$sm" fontWeight="$semibold">{label}</Text>
      <Text fontSize="$xs" color="$textSecondary">{hint}</Text>
      <Box display="flex" gap="8px" alignItems="baseline">
        <Text fontSize="$xs" color="$textSecondary" attributes={{ minWidth: '140px', flexShrink: '0' }}>
          Expected SHA-256
        </Text>
        <Text fontSize="$xs" fontFamily="monospace">{expectedSha256}</Text>
      </Box>
      {verifiedHash && (
        <Box display="flex" gap="8px" alignItems="baseline">
          <Text fontSize="$xs" color="$textSecondary" attributes={{ minWidth: '140px', flexShrink: '0' }}>
            Downloaded SHA-256
          </Text>
          <Text fontSize="$xs" fontFamily="monospace" color={hashMatch ? '$textSuccess' : '$textDanger'}>
            {verifiedHash}
            {hashMatch ? ' ✓ match' : ' ✗ mismatch — do not use this file'}
          </Text>
        </Box>
      )}
      {error && <Text fontSize="$sm" color="$textDanger">{error}</Text>}
      <Box>
        <Button variant="outline" size="sm" onClick={handleDownload} isLoading={isDownloading} disabled={isDownloading}>
          {isDownloading ? 'Downloading…' : `Download genesis-${type}.json`}
        </Button>
      </Box>
    </Box>
  );
}
