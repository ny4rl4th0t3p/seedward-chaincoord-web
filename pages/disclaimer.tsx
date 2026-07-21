import type { ReactNode } from 'react';
import { Box, Text } from '@interchain-ui/react';

// Linked from the footer as "Disclaimer". This is not a formal Terms of Service: Seedward is
// self-hosted open-source software, so binding terms (if any) are set by whoever operates a given
// instance. This page states what the software is and the risks of using it.
export default function Disclaimer() {
  return (
    <Box maxWidth="720px" mx="auto" mt="40px" mb="40px">
      <Text fontSize="28px" fontWeight="600" attributes={{ mb: '8px' }}>
        Disclaimer
      </Text>
      <Text fontSize="$sm" color="$textSecondary" attributes={{ mb: '32px' }}>
        Seedward is open-source software for coordinating a blockchain genesis — collecting
        validator gentxs and assembling a genesis file. Please read the following before using it.
      </Text>

      <Section title="Provided “as is”">
        The software is provided without warranty of any kind, express or implied, including but not
        limited to warranties of merchantability, fitness for a particular purpose, and
        non-infringement. You use it at your own risk.
      </Section>

      <Section title="Not a security-audited system">
        Seedward has not undergone an independent security audit. Do not treat it as a source of
        trust for a high-value network without conducting your own review of the code and of the
        data it produces.
      </Section>

      <Section title="Verify everything before you launch">
        Coordinators and validators are solely responsible for independently verifying the genesis
        file, every gentx, and all chain parameters before using them to start a real network.
        Genesis mistakes can be irreversible once a chain is live. Never start a production network
        from data you have not checked yourself.
      </Section>

      <Section title="No custody of keys or funds">
        Seedward never holds your private keys or funds. Wallet signing happens client-side in your
        own wallet; the service only uses wallet signatures to authenticate you. Keep your keys and
        seed phrase safe — no one operating this software can recover them for you.
      </Section>

      <Section title="Operator responsibility">
        This instance is run by its operator, not by the authors of the software. Availability, data
        handling, and any additional terms of use are the operator&apos;s responsibility, not the
        authors&apos;. The authors are not liable for how any particular deployment is run.
      </Section>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box attributes={{ mb: '24px' }}>
      <Text fontSize="$md" fontWeight="$semibold" attributes={{ mb: '6px' }}>
        {title}
      </Text>
      <Text fontSize="$sm" color="$textSecondary" attributes={{ lineHeight: '1.6' }}>
        {children}
      </Text>
    </Box>
  );
}
