import { useColorModeValue } from '@interchain-ui/react';

/**
 * Theme-aware text color for the app's native `<input>`/`<textarea>` fields. Native form controls
 * don't inherit the interchain-ui theme text color, so a plain `color: inherit` renders as
 * black-on-dark in night mode (unreadable). Use this for an explicit, mode-appropriate field color.
 */
export function useInputColor(): string {
  return useColorModeValue('#1a1a1a', '#e6e6e6');
}
