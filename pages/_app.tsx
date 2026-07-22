import '../styles/globals.css';
import '@interchain-ui/react/styles';

import { useEffect, useState } from 'react';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import { ChainProvider } from '@interchain-kit/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { Box, Toaster, useTheme } from '@interchain-ui/react';
// import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { CustomThemeProvider, Layout } from '@/components';
import { wallets, chains, assetLists } from '@/config';
import { AuthProvider } from '@/contexts';

const InterchainWalletModal = dynamic(
  () => import('@interchain-kit/react').then((m) => m.InterchainWalletModal),
  { ssr: false },
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnMount: false,
      // Revalidate on tab focus so a session revoked/expired server-side is detected on return: the
      // refetch 401s → the mutator dispatches coord:unauthorized → AuthProvider logs out → AuthWall.
      // Without this a stale-but-cached view lingers until the next manual action ("go to sign-in
      // from anywhere"). Also keeps launch state fresh when switching back to the tab.
      refetchOnWindowFocus: true,
    },
  },
});

function CreateInterchainApp({ Component, pageProps }: AppProps) {
  const { themeClass } = useTheme();

  // interchain-kit's store (zustand `persist`) reads localStorage at creation time, which throws
  // during SSR — fatal on Node 24, whose non-functional localStorage global defeats the library's
  // guard and takes down hydration (every click dead). Pages are fully client-rendered, so mount the
  // wallet provider tree in the browser only. Server + first client render are both null → no mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <CustomThemeProvider>
      <ChainProvider chains={chains} assetLists={assetLists} wallets={wallets}
        walletModal={() => <InterchainWalletModal />}
      >
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Box className={themeClass}>
              <Layout>
                <Component {...pageProps} />
                <Toaster position="top-right" closeButton={true} />
              </Layout>
            </Box>
          {/* <ReactQueryDevtools /> */}
          </AuthProvider>
        </QueryClientProvider>
      </ChainProvider>
    </CustomThemeProvider>
  );
}

export default CreateInterchainApp;
