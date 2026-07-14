import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@/contexts';
import AdminPage from '@/pages/admin';

jest.mock('@interchain-ui/react', () => ({
  Box: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('@/components', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    isLoading,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    isLoading?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled ?? isLoading}>
      {children}
    </button>
  ),
}));

jest.mock('@/contexts', () => ({ useAuth: jest.fn() }));

const mockAuth = useAuth as jest.Mock;

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    logger: { log() {}, warn() {}, error() {} },
    defaultOptions: { queries: { retry: false, cacheTime: 0 }, mutations: { retry: false } },
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

const COORD = '/admin/coordinators';

describe('AdminPage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('prompts to sign in when unauthenticated', () => {
    mockAuth.mockReturnValue({ isAuthenticated: false });
    mockFetch();
    renderWithClient(<AdminPage />);
    expect(screen.getByText(/Sign in to access the admin panel/)).toBeInTheDocument();
  });

  it('shows a not-an-admin message when the probe 403s', async () => {
    mockAuth.mockReturnValue({ isAuthenticated: true });
    mockFetch([{ method: 'GET', match: COORD, status: 403, body: envelope('forbidden') }]);
    renderWithClient(<AdminPage />);
    await waitFor(() => expect(screen.getByText(/You are not an admin/)).toBeInTheDocument());
  });

  it('renders the panel and lists coordinators for an admin', async () => {
    mockAuth.mockReturnValue({ isAuthenticated: true });
    mockFetch([{ method: 'GET', match: COORD, body: { items: [{ address: 'cosmos1adminaaa' }], total: 1 } }]);
    renderWithClient(<AdminPage />);
    await waitFor(() => expect(screen.getByText('Admin Panel')).toBeInTheDocument());
    expect(screen.getByText(/Coordinator Allowlist/)).toBeInTheDocument();
  });

  it('adds a coordinator to the allowlist', async () => {
    mockAuth.mockReturnValue({ isAuthenticated: true });
    mockFetch([
      { method: 'POST', match: COORD, body: {} },
      { method: 'GET', match: COORD, body: { items: [], total: 0 } },
    ]);
    renderWithClient(<AdminPage />);

    await waitFor(() => screen.getByPlaceholderText(/address to add/));
    fireEvent.change(screen.getByPlaceholderText(/address to add/), { target: { value: 'cosmos1newadmin' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    });

    const call = (global as unknown as { fetch: jest.Mock }).fetch.mock.calls.find(
      ([url, init]: [string, RequestInit]) => url === COORD && init?.method === 'POST',
    );
    expect(call).toBeDefined();
  });

  it('removes a coordinator from the allowlist', async () => {
    mockAuth.mockReturnValue({ isAuthenticated: true });
    mockFetch([
      { method: 'DELETE', match: `${COORD}/`, body: {} },
      { method: 'GET', match: COORD, body: { items: [{ address: 'cosmos1removeme' }], total: 1 } },
    ]);
    renderWithClient(<AdminPage />);

    await waitFor(() => screen.getByRole('button', { name: 'Remove' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    });

    const call = (global as unknown as { fetch: jest.Mock }).fetch.mock.calls.find(
      ([url, init]: [string, RequestInit]) => url.startsWith(`${COORD}/`) && init?.method === 'DELETE',
    );
    expect(call).toBeDefined();
  });

  it('revokes all sessions for an address', async () => {
    mockAuth.mockReturnValue({ isAuthenticated: true });
    mockFetch([
      { method: 'DELETE', match: '/admin/sessions/', body: {} },
      { method: 'GET', match: COORD, body: { items: [], total: 0 } },
    ]);
    renderWithClient(<AdminPage />);

    await waitFor(() => screen.getByPlaceholderText(/address to revoke/));
    fireEvent.change(screen.getByPlaceholderText(/address to revoke/), { target: { value: 'cosmos1revoke' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Revoke Sessions' }));
    });

    await waitFor(() =>
      expect(screen.getByText(/Sessions revoked for cosmos1revoke/)).toBeInTheDocument(),
    );
  });
});
