import React from 'react';
import { render, screen } from '@testing-library/react';
import { Footer } from '@/components/common/Footer';

// The footer pulls in the interchain-ui primitives, next/link, an icon, and useDetectBreakpoints
// (which reads window.matchMedia, absent in jsdom) — stub them so the component renders in isolation.
jest.mock('@interchain-ui/react', () => ({
  Box: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Icon: () => <i />,
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
jest.mock('react-icons/fa6', () => ({ FaXTwitter: () => <i /> }));
jest.mock('@/hooks', () => ({ useDetectBreakpoints: () => ({ isMobile: false }) }));

describe('Footer — app version badge', () => {
  const prev = process.env.NEXT_PUBLIC_APP_VERSION;
  afterEach(() => {
    if (prev === undefined) {
      delete process.env.NEXT_PUBLIC_APP_VERSION;
    } else {
      process.env.NEXT_PUBLIC_APP_VERSION = prev;
    }
  });

  it('renders v<version> when NEXT_PUBLIC_APP_VERSION is set', () => {
    process.env.NEXT_PUBLIC_APP_VERSION = '1.2.3';
    render(<Footer />);
    expect(screen.getByText('v1.2.3')).toBeInTheDocument();
  });

  it('renders no version badge when NEXT_PUBLIC_APP_VERSION is unset', () => {
    delete process.env.NEXT_PUBLIC_APP_VERSION;
    render(<Footer />);
    expect(screen.queryByText(/^v\d/)).not.toBeInTheDocument();
  });
});
