import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuditLogSection } from '@/components/AuditLogSection';

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
const AUDIT = `/launch/${LAUNCH_ID}/audit`;

describe('AuditLogSection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows a Load button and fetches nothing until clicked', () => {
    const fetchMock = mockFetch();
    renderWithClient(<AuditLogSection launchId={LAUNCH_ID} />);
    expect(screen.getByRole('button', { name: 'Load Audit Log' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads entries and the server pubkey on click', async () => {
    mockFetch([
      { method: 'GET', match: '/audit/pubkey', body: { public_key: 'auditpubkey123' } },
      {
        method: 'GET',
        match: AUDIT,
        body: { entries: [{ occurred_at: '2026-05-01T00:00:00Z', event_name: 'LaunchCreated', payload: { a: 1 } }] },
      },
    ]);
    renderWithClient(<AuditLogSection launchId={LAUNCH_ID} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Load Audit Log' }));
    });

    await waitFor(() => expect(screen.getByText('LaunchCreated')).toBeInTheDocument());
    expect(screen.getByText('Server audit pubkey')).toBeInTheDocument();
    expect(screen.getByText('auditpubkey123')).toBeInTheDocument();
  });

  it('shows the empty state when there are no entries', async () => {
    mockFetch([
      { method: 'GET', match: '/audit/pubkey', body: {} },
      { method: 'GET', match: AUDIT, body: { entries: [] } },
    ]);
    renderWithClient(<AuditLogSection launchId={LAUNCH_ID} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Load Audit Log' }));
    });
    await waitFor(() => expect(screen.getByText(/No audit entries yet/)).toBeInTheDocument());
  });

  it('shows an error when the audit fetch fails', async () => {
    mockFetch([
      { method: 'GET', match: '/audit/pubkey', body: {} },
      { method: 'GET', match: AUDIT, status: 500, body: envelope('boom') },
    ]);
    renderWithClient(<AuditLogSection launchId={LAUNCH_ID} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Load Audit Log' }));
    });
    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
  });

  it('renders entries even when the pubkey fetch fails (best-effort)', async () => {
    mockFetch([
      { method: 'GET', match: '/audit/pubkey', status: 500, body: envelope('no pubkey') },
      {
        method: 'GET',
        match: AUDIT,
        body: { entries: [{ occurred_at: '2026-05-01T00:00:00Z', event_name: 'CommitteeSet', payload: {} }] },
      },
    ]);
    renderWithClient(<AuditLogSection launchId={LAUNCH_ID} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Load Audit Log' }));
    });
    await waitFor(() => expect(screen.getByText('CommitteeSet')).toBeInTheDocument());
    expect(screen.queryByText('Server audit pubkey')).not.toBeInTheDocument();
  });
});
