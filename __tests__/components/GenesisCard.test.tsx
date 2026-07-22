import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { GenesisCard } from '@/components/GenesisCard';

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

const LAUNCH_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const INITIAL_SHA = 'a'.repeat(64);
const FINAL_SHA = 'b'.repeat(64);

interface Route {
  match: string;
  arrayBuffer?: ArrayBuffer;
  status?: number;
}

function mockFetch(routes: Route[] = []) {
  const fn = jest.fn(async (url: string) => {
    const route = routes.find((r) => url.includes(r.match));
    const status = route?.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      arrayBuffer: async () => route?.arrayBuffer ?? new ArrayBuffer(0),
      json: async () => ({}),
    };
  });
  (global as unknown as { fetch: jest.Mock }).fetch = fn;
  return fn;
}

describe('GenesisCard', () => {
  let anchorClickSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // digest → bytes matching INITIAL_SHA (so an initial download reports a match by default).
    const hashBytes = new Uint8Array(INITIAL_SHA.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
    Object.defineProperty(global, 'crypto', {
      value: { subtle: { digest: jest.fn().mockResolvedValue(hashBytes.buffer) } },
      writable: true,
    });
    global.URL.createObjectURL = jest.fn().mockReturnValue('blob:fake');
    global.URL.revokeObjectURL = jest.fn();
    anchorClickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => anchorClickSpy.mockRestore());

  it('renders nothing when no genesis exists', () => {
    const { container } = render(<GenesisCard launchId={LAUNCH_ID} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows only the initial row before a final is published', () => {
    mockFetch();
    render(<GenesisCard launchId={LAUNCH_ID} initialSha256={INITIAL_SHA} />);
    expect(screen.getByRole('button', { name: /download genesis-initial/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download genesis-final/i })).not.toBeInTheDocument();
  });

  it('shows both rows once a final exists', () => {
    mockFetch();
    render(<GenesisCard launchId={LAUNCH_ID} initialSha256={INITIAL_SHA} finalSha256={FINAL_SHA} />);
    expect(screen.getByRole('button', { name: /download genesis-initial/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download genesis-final/i })).toBeInTheDocument();
  });

  it('downloads the initial via ?type=initial and confirms the hash match', async () => {
    const fetchMock = mockFetch([
      { match: `/launch/${LAUNCH_ID}/genesis?type=initial`, arrayBuffer: new ArrayBuffer(32) },
    ]);
    render(<GenesisCard launchId={LAUNCH_ID} initialSha256={INITIAL_SHA} finalSha256={FINAL_SHA} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /download genesis-initial/i }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/launch/${LAUNCH_ID}/genesis?type=initial`),
      expect.anything(),
    );
    await waitFor(() => expect(screen.getByText(/✓ match/)).toBeInTheDocument());
  });

  it('warns on a hash mismatch (final download while digest matches the initial)', async () => {
    // digest is stubbed to the INITIAL hash, so downloading the FINAL yields a mismatch.
    mockFetch([{ match: `/launch/${LAUNCH_ID}/genesis?type=final`, arrayBuffer: new ArrayBuffer(32) }]);
    render(<GenesisCard launchId={LAUNCH_ID} initialSha256={INITIAL_SHA} finalSha256={FINAL_SHA} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /download genesis-final/i }));
    });

    await waitFor(() => expect(screen.getByText(/mismatch — do not use this file/i)).toBeInTheDocument());
  });
});
