import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RehearsalResetButton } from '@/components/RehearsalResetButton';

jest.mock('@interchain-ui/react', () => ({
  Box: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('@/components', () => ({
  Button: ({
    children,
    onClick,
    isLoading,
    disabled,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    isLoading?: boolean;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled ?? isLoading}>
      {children}
    </button>
  ),
}));

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
    const ok = status >= 200 && status < 300;
    return { ok, status, json: async () => route?.body ?? {}, text: async () => JSON.stringify(route?.body ?? {}) };
  });
  (global as unknown as { fetch: jest.Mock }).fetch = fn;
  return fn;
}

function envelope(message: string) {
  return { error: { message } };
}

const LAUNCH_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const ATTEMPT_ID = 'attempt-123';
const RESET_URL = `/launch/${LAUNCH_ID}/rehearsal/${ATTEMPT_ID}/reset`;

describe('RehearsalResetButton', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the Reset attempt button and no confirmation initially', () => {
    mockFetch();
    renderWithClient(<RehearsalResetButton launchId={LAUNCH_ID} attemptId={ATTEMPT_ID} />);
    expect(screen.getByRole('button', { name: 'Reset attempt' })).toBeInTheDocument();
    expect(screen.queryByText('Reset this rehearsal attempt?')).not.toBeInTheDocument();
  });

  it('first click asks for confirmation and fires no request', () => {
    const fetchMock = mockFetch();
    renderWithClient(<RehearsalResetButton launchId={LAUNCH_ID} attemptId={ATTEMPT_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset attempt' }));
    expect(screen.getByText('Reset this rehearsal attempt?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm reset' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the reset and calls onDone after confirmation', async () => {
    mockFetch([{ method: 'POST', match: RESET_URL, body: {} }]);
    const onDone = jest.fn();
    renderWithClient(<RehearsalResetButton launchId={LAUNCH_ID} attemptId={ATTEMPT_ID} onDone={onDone} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset attempt' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm reset' }));
    });

    const call = (global as unknown as { fetch: jest.Mock }).fetch.mock.calls.find(
      ([url, init]: [string, RequestInit]) => url === RESET_URL && init?.method === 'POST',
    );
    expect(call).toBeDefined();
    expect(onDone).toHaveBeenCalled();
  });

  it('surfaces the error envelope and does not call onDone on failure', async () => {
    mockFetch([{ method: 'POST', match: RESET_URL, status: 409, body: envelope('attempt is in progress') }]);
    const onDone = jest.fn();
    renderWithClient(<RehearsalResetButton launchId={LAUNCH_ID} attemptId={ATTEMPT_ID} onDone={onDone} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset attempt' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm reset' }));
    });

    await waitFor(() => expect(screen.getByText('attempt is in progress')).toBeInTheDocument());
    expect(onDone).not.toHaveBeenCalled();
  });

  it('Cancel returns to the initial state and fires no request', () => {
    const fetchMock = mockFetch();
    renderWithClient(<RehearsalResetButton launchId={LAUNCH_ID} attemptId={ATTEMPT_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset attempt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Reset attempt' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
