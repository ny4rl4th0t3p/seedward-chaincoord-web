import { Box } from '@interchain-ui/react';

import { NavItems } from './NavItems';

export const SidebarContent = ({ onClose }: { onClose: () => void }) => {
  return (
    <Box
      flex="1"
      display="flex"
      flexDirection="column"
      alignItems="center"
      width="100%"
    >
      <NavItems onItemClick={onClose} />
    </Box>
  );
};
