import Link from 'next/link';
import { Box, Icon, Text } from '@interchain-ui/react';

import { useDetectBreakpoints } from '@/hooks';

export const Footer = () => {
  const { isMobile } = useDetectBreakpoints();

  return (
    <Box mt="100px">
      {isMobile && (
        <Box display="flex" justifyContent="center" mb="10px">
          <SocialLinks />
        </Box>
      )}
      <Box
        display="flex"
        justifyContent={isMobile ? 'center' : 'space-between'}
        alignItems="center"
        gap="4px"
      >
        <Text color="$blackAlpha500" fontSize="12px" fontWeight="500">
          © {new Date().getFullYear()} ny4rl4th0t3p
        </Text>
        {isMobile ? <TextDivider /> : <SocialLinks />}
        <Link href="/disclaimer">
          <Text color="$blackAlpha500" fontSize="12px" fontWeight="500">
            Disclaimer
          </Text>
        </Link>
      </Box>
      {/* App version — inlined at build (NEXT_PUBLIC_APP_VERSION); absent in local `yarn dev`. */}
      {process.env.NEXT_PUBLIC_APP_VERSION && (
        <Box display="flex" justifyContent="center" mt="8px">
          <Text color="$blackAlpha400" fontSize="11px" fontWeight="500">
            v{process.env.NEXT_PUBLIC_APP_VERSION}
          </Text>
        </Box>
      )}
    </Box>
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
