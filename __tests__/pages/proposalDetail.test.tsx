import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts';
import ProposalDetailPage from '@/pages/launch/[id]/proposal/[propId]';

jest.mock('next/router', () => ({ useRouter: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@interchain-ui/react', () => ({
  Box: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@/contexts', () => ({ useAuth: jest.fn() }));

const mockRouter = useRouter as jest.Mock;
const mockAuth = useAuth as jest.Mock;

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    logger: { log() {}, warn() {}, error() {} },
    defaultOptions: { queries: { retry: false, cacheTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

interface Route {
  method?: string;
  match: string | RegExp;
  status?: number;
  body?: unknown;
}

function mockFetch(routes: Route[] = []) {
  const fn = jest.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const route = routes.find((r) => {
      if (r.method && r.method.toUpperCase() !== method) return false;
      return typeof r.match === 'string' ? url.includes(r.match) : r.match.test(url);
    });
    const status = route?.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => route?.body ?? {},
      text: async () => JSON.stringify(route?.body ?? {}),
    };
  });
  (global as unknown as { fetch: jest.Mock }).fetch = fn;
  return fn;
}

function envelope(message: string) {
  return { error: { message } };
}

const LAUNCH_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const PROP_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const DETAIL_URL = `/launch/${LAUNCH_ID}/proposal/${PROP_ID}`;

describe('ProposalDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter.mockReturnValue({ query: { id: LAUNCH_ID, propId: PROP_ID } });
  });

  it('prompts to sign in when unauthenticated', () => {
    mockAuth.mockReturnValue({ isAuthenticated: false });
    mockFetch();
    renderWithClient(<ProposalDetailPage />);
    expect(screen.getByText(/Sign in with your committee wallet/)).toBeInTheDocument();
  });

  it('renders the proposal detail when authenticated', async () => {
    mockAuth.mockReturnValue({ isAuthenticated: true });
    mockFetch([
      {
        method: 'GET',
        match: DETAIL_URL,
        body: {
          id: PROP_ID,
          action_type: 'APPROVE_VALIDATOR',
          status: 'PENDING_SIGNATURES',
          proposed_by: 'cosmos1proposer',
          proposed_at: '2026-05-01T00:00:00Z',
          payload: { join_request_id: 'jr1' },
          signatures: [{ coordinator_address: 'cosmos1signer', decision: 'SIGN' }],
        },
      },
    ]);
    renderWithClient(<ProposalDetailPage />);

    await waitFor(() => expect(screen.getByText('APPROVE_VALIDATOR')).toBeInTheDocument());
    expect(screen.getByText('PENDING_SIGNATURES')).toBeInTheDocument();
    expect(screen.getByText(/Signatures \(1\)/)).toBeInTheDocument();
  });

  it('shows a not-found message when the proposal is not visible', async () => {
    mockAuth.mockReturnValue({ isAuthenticated: true });
    mockFetch([{ method: 'GET', match: DETAIL_URL, status: 404, body: envelope('not found') }]);
    renderWithClient(<ProposalDetailPage />);
    await waitFor(() => expect(screen.getByText('not found')).toBeInTheDocument());
  });
});
