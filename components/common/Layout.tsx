import Head from 'next/head';
import { Box, useColorModeValue } from '@interchain-ui/react';

import { Header } from './Header';
import { Footer } from './Footer';
import { Sidebar } from './Sidebar';
import { useDisclosure } from '@/hooks';
import { useAuth } from '@/contexts';
import { AuthWall } from '@/components/AuthWall';
import styles from '@/styles/layout.module.css';

export function Layout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, initialized } = useAuth();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const bg = useColorModeValue('$white', '$background');

  // Until the session is restored, render a blank shell — never flash the wall at a returning user.
  if (!initialized) {
    return <Box backgroundColor={bg} minHeight="100vh" />;
  }

  // Unauthenticated → ONLY the auth wall. The page component (and all its data fetching) never
  // mounts, so nothing unauthorized loads or renders — not even in the background / scrapeable DOM.
  if (!isAuthenticated) {
    return (
      <Box backgroundColor={bg} minHeight="100vh">
        <Head>
          <title>chaincoord</title>
          <link rel="icon" href="/images/favicon.ico" />
        </Head>
        <AuthWall />
      </Box>
    );
  }

  return (
    <Box backgroundColor={bg} className={styles.layout}>
      <Box maxWidth="1440px" width="$full" mx="$auto" display="flex">
        <Head>
          <title>chaincoord</title>
          <meta name="description" content="Chain launch coordination" />
          <link rel="icon" href="/images/favicon.ico" />
        </Head>
        <Sidebar isOpen={isOpen} onClose={onClose} />
        <Box p="30px" width="$full" minHeight="100vh" display="flex" flexDirection="column">
          <Header onOpenSidebar={onOpen} />
          <Box flex="1">{children}</Box>
          <Footer />
        </Box>
      </Box>
    </Box>
  );
}
