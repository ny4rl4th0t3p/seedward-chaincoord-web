import Link from 'next/link';
import { Box, Icon, Text } from '@interchain-ui/react';

import { useDetectBreakpoints } from '@/hooks';

export const Footer = () => {
  const { isMobile } = useDetectBreakpoints();

  // Build-time inlined (NEXT_PUBLIC_APP_VERSION); absent in local `yarn dev`. CI passes the bare
  // semver (metadata-action strips the leading v) but local Makefile builds pass `git describe`
  // (v-prefixed) — normalize so the rendered "v…" never doubles. Read at render (not module load)
  // so the value tracks the env at use time.
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION?.replace(/^v/, '');

  return (
    <Box mt="100px">
      {isMobile ? (
        <>
          <Box display="flex" justifyContent="center" mb="10px">
            <SocialLinks />
          </Box>
          <Box display="flex" justifyContent="center" alignItems="center" gap="4px">
            <Copyright />
            <TextDivider />
            <DisclaimerLink />
          </Box>
        </>
      ) : (
        // Equal-flex side columns keep the GitHub link truly centered regardless of how wide the
        // copyright / disclaimer texts are (space-between alone drifts it toward the shorter side).
        <Box display="flex" alignItems="center" gap="4px">
          <Box flex="1">
            <Copyright />
          </Box>
          <SocialLinks />
          <Box flex="1" display="flex" justifyContent="flex-end">
            <DisclaimerLink />
          </Box>
        </Box>
      )}
      {appVersion && (
        <Box display="flex" justifyContent="center" mt="8px">
          <Text color="$blackAlpha400" fontSize="11px" fontWeight="500">
            v{appVersion}
          </Text>
        </Box>
      )}
    </Box>
  );
};

const Copyright = () => {
  return (
    <Text color="$blackAlpha500" fontSize="12px" fontWeight="500">
      © {new Date().getFullYear()} ny4rl4th0t3p
    </Text>
  );
};

const DisclaimerLink = () => {
  return (
    <Link href="/disclaimer">
      <Text color="$blackAlpha500" fontSize="12px" fontWeight="500">
        Disclaimer
      </Text>
    </Link>
  );
};

const TextDivider = () => {
  return (
    <Text color="$blackAlpha200" fontSize="12px" fontWeight="500">
      |
    </Text>
  );
};

const socialLinks = [
  {
    icon: <Icon name="github" color="$blackAlpha600" />,
    href: 'https://github.com/ny4rl4th0t3p/seedward-suite',
  },
];

const SocialLinks = () => {
  return (
    <Box display="flex" alignItems="center" gap="16px">
      {socialLinks.map(({ icon, href }) => (
        <Link href={href} target="_blank" key={href}>
          {icon}
        </Link>
      ))}
    </Box>
  );
};
