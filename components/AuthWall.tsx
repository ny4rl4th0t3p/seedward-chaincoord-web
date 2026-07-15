import { Box, Text } from '@interchain-ui/react';
import { GlobalSignIn } from '@/components/common/Header/GlobalSignIn';
import { AUTH_REQUIRED_MESSAGE } from '@/utils/messages';

/**
 * Full-viewport, centered "off-limits" wall for when an unauthenticated caller hits a gated section.
 * Deliberately minimal — the uniform message + the sign-in control, nothing else — so it reveals
 * nothing about what does or doesn't exist (coordd returns a uniform 404 to non-members). Overlays
 * the app chrome. Reuse it for every gated section so the wall is consistent and leak-free.
 */
export function AuthWall() {
  return (
    <Box
      backgroundColor="$background"
      display="flex"
      alignItems="center"
      justifyContent="center"
      attributes={{ style: { position: 'fixed', inset: 0, zIndex: 1000, padding: '24px' } }}
    >
      <Box display="flex" flexDirection="column" alignItems="center" gap="24px" maxWidth="520px">
        <Text fontSize="$xl" color="$textSecondary" textAlign="center">
          {AUTH_REQUIRED_MESSAGE}
        </Text>
        <GlobalSignIn />
      </Box>
    </Box>
  );
}
