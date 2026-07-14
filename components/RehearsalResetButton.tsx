import { useState } from 'react';
import { Box, Text } from '@interchain-ui/react';
import { Button } from '@/components';
import { usePostLaunchIdRehearsalAttemptIdReset } from '@/api/generated/rehearsal/rehearsal';
import type { ApiErrorEnvelope } from '@/api/generated/model';

interface RehearsalResetButtonProps {
  launchId: string;
  attemptId: string;
  /** Called after a successful reset — the card passes its rehearsal-query `refetch`. */
  onDone?: () => void;
}

/**
 * Committee-only action to reset a rehearsal attempt (POST /launch/{id}/rehearsal/{attemptId}/reset).
 * Rendered inside the (committee-gated) rehearsal status card, so no gating of its own. Two-step
 * confirm to avoid an accidental reset; surfaces coordd's error envelope on failure.
 */
export function RehearsalResetButton({ launchId, attemptId, onDone }: RehearsalResetButtonProps) {
  const reset = usePostLaunchIdRehearsalAttemptIdReset();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async () => {
    setError(null);
    try {
      await reset.mutateAsync({ id: launchId, attemptId });
      setConfirming(false);
      onDone?.();
    } catch (err) {
      const env = err as ApiErrorEnvelope;
      setError(env.error?.message ?? (err instanceof Error ? err.message : 'Reset failed'));
    }
  };

  return (
    <Box display="flex" flexDirection="column" gap="8px" attributes={{ mt: '8px' }}>
      {error && <Text fontSize="$xs" color="$textDanger">{error}</Text>}
      {!confirming ? (
        <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
          Reset attempt
        </Button>
      ) : (
        <Box display="flex" gap="8px" alignItems="center">
          <Text fontSize="$xs" color="$textDanger">Reset this rehearsal attempt?</Text>
          <Button
            variant="primary"
            size="sm"
            onClick={handleReset}
            isLoading={reset.isLoading}
            disabled={reset.isLoading}
          >
            {reset.isLoading ? 'Resetting…' : 'Confirm reset'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirming(false)}
            disabled={reset.isLoading}
          >
            Cancel
          </Button>
        </Box>
      )}
    </Box>
  );
}
