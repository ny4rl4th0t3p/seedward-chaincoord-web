import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ValidatorPanel } from '@/components/ValidatorPanel';
import { buildSignedAction } from '@/utils/signedAction';
import type {
  ApiLaunchJSON,
  ApiDashboardJSON,
  ApiValidatorReadinessJSON,
} from '@/api/generated/model';

// ── ESM shims ────────────────────────────────────────────────────────────────
// interchain-kit/-ui pull in WalletConnect + a heavy component tree that jsdom
// can't load; stub them to the minimum the panel touches.

jest.mock('@interchain-kit/core', () => ({ CosmosWallet: class CosmosWallet {} }));
jest.mock('@interchain-kit/react/store/stateful-wallet', () => ({
  StatefulWallet: class StatefulWallet {},
}));

jest.mock('@interchain-ui/react', () => ({
  Box: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  useColorModeValue: (light: unknown) => light,
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

// ── buildSignedAction mock ───────────────────────────────────────────────────
// The signature payload shape is verified separately in signedAction.test.ts.

jest.mock('@/utils/signedAction', () => ({
  buildSignedAction: jest.fn(),
}));

const mockSign = buildSignedAction as jest.MockedFunction<typeof buildSignedAction>;

// ── react-query harness ───────────────────────────────────────────────────────
// Every panel request now flows through generated react-query hooks → the orval
// `authFetchMutator` → `global.fetch`. So we render under a fresh QueryClient and
// mock `global.fetch`, instead of injecting an `authFetch` prop.
//
// @tanstack/react-query is 4.x here, so the option name is `cacheTime` (v5 renamed
// it to `gcTime`) and loading flag is `isLoading` (v5 adds `isPending`).

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    // v4 logs every query/mutation error to console.error by default; the error-path tests
    // exercise failures on purpose, so mute it (option removed in v5).
    logger: { log() {}, warn() {}, error() {} },
    defaultOptions: {
      queries: { retry: false, cacheTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

// ── fetch mock ─────────────────────────────────────────────────────────────────
// A tiny router: the first route whose (method, url-substring) matches wins; an
// unmatched request falls through to `200 {}`. On non-2xx the body must be coordd's
// *nested* envelope `{ error: { code, message, invariants } }` — that's exactly what
// the mutator throws and every consumer reads via `err.error?.message`.

interface Route {
  method?: string;
  match: string | RegExp;
  status?: number;
  body?: unknown;
  arrayBuffer?: ArrayBuffer;
}

function makeResponse(route: Route | undefined) {
  const status = route?.status ?? 200;
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    json: async () => route?.body ?? {},
    text: async () => JSON.stringify(route?.body ?? {}),
    arrayBuffer: async () => route?.arrayBuffer ?? new ArrayBuffer(0),
  };
}

function mockFetch(routes: Route[] = []) {
  const fn = jest.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const route = routes.find((r) => {
      if (r.method && r.method.toUpperCase() !== method) return false;
      return typeof r.match === 'string' ? url.includes(r.match) : r.match.test(url);
    });
    return makeResponse(route);
  });
  (global as unknown as { fetch: jest.Mock }).fetch = fn;
  return fn;
}

function envelope(message: string, extra?: Record<string, unknown>) {
  return { error: { message, ...extra } };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const LAUNCH_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const HINT = {
  chain_id: 'mychain-1',
  chain_name: 'mychain',
  bech32_prefix: 'cosmos',
  denom: 'uatom',
};
const ADDRESS = 'cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu';
const MOCK_WALLET = {} as never; // unused — buildSignedAction is mocked

// The panels read only launch.status / launch.final_genesis_sha256 (chain metadata
// comes from `hint`), so the launch fixture stays minimal.
function makeLaunch(overrides?: Partial<ApiLaunchJSON>): ApiLaunchJSON {
  return {
    id: LAUNCH_ID,
    status: 'WINDOW_OPEN',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeDashboard(overrides?: Partial<ApiDashboardJSON>): ApiDashboardJSON {
  return {
    launch_id: LAUNCH_ID,
    chain_id: 'mychain-1',
    status: 'WINDOW_OPEN',
    total_approved: 0,
    confirmed_ready: 0,
    voting_power_confirmed: 0,
    threshold_status: 'below',
    validators: [],
    ...overrides,
  };
}

function approvedValidator(overrides?: Partial<ApiValidatorReadinessJSON>): ApiValidatorReadinessJSON {
  return {
    join_request_id: 'r1',
    operator_address: ADDRESS,
    moniker: '',
    voting_power_pct: 0,
    is_ready: false,
    ...overrides,
  };
}

function defaultProps(overrides?: {
  launch?: Partial<ApiLaunchJSON>;
  dashboard?: Partial<ApiDashboardJSON> | null;
}) {
  return {
    launchId: LAUNCH_ID,
    hint: HINT,
    address: ADDRESS,
    wallet: MOCK_WALLET,
    signingChainId: HINT.chain_id,
    launch: makeLaunch(overrides?.launch),
    dashboard: overrides?.dashboard === null ? null : makeDashboard(overrides?.dashboard ?? {}),
  };
}

function mockSignedResult(extra?: object) {
  mockSign.mockResolvedValue({
    operator_address: ADDRESS,
    timestamp: '2026-01-01T00:00:00Z',
    nonce: 'test-nonce',
    pubkey_b64: 'testpubkey==',
    signature: 'testsig==',
    ...extra,
  } as never);
}

const VALID_GENTX = '{"body":{"messages":[{"@type":"/cosmos.staking.v1beta1.MsgCreateValidator"}]}}';

async function fillAndSubmitJoinForm() {
  fireEvent.change(screen.getByPlaceholderText(/\{"body"/), {
    target: { value: VALID_GENTX },
  });
  fireEvent.change(screen.getByPlaceholderText(/1\.2\.3\.4:26656/), {
    target: { value: '5.6.7.8:26656' },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Submit Join Request/ }));
  });
}

// ── Routing tests ─────────────────────────────────────────────────────────────

describe('ValidatorPanel — routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignedResult();
    mockFetch();
  });

  it('shows join form when validator is not in dashboard validators', () => {
    renderWithClient(<ValidatorPanel {...defaultProps()} />);
    expect(screen.getByRole('button', { name: /Submit Join Request/ })).toBeInTheDocument();
  });

  it('shows approved banner when validator address is in dashboard.validators', () => {
    const dashboard = makeDashboard({ validators: [approvedValidator({ moniker: 'mynode' })] });
    renderWithClient(<ValidatorPanel {...defaultProps()} dashboard={dashboard} />);
    expect(screen.getByText(/Your join request has been approved/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit Join Request/ })).not.toBeInTheDocument();
  });

  it('shows genesis section only when launch has final_genesis_sha256 and is approved', () => {
    const dashboard = makeDashboard({ validators: [approvedValidator()] });
    const launch = makeLaunch({ final_genesis_sha256: 'abc123deadbeef' });
    renderWithClient(<ValidatorPanel {...defaultProps()} launch={launch} dashboard={dashboard} />);
    expect(screen.getByRole('button', { name: /Download genesis/ })).toBeInTheDocument();
  });

  it('hides genesis section when launch has no final_genesis_sha256', () => {
    const dashboard = makeDashboard({ validators: [approvedValidator()] });
    renderWithClient(<ValidatorPanel {...defaultProps()} launch={makeLaunch()} dashboard={dashboard} />);
    expect(screen.queryByRole('button', { name: /Download genesis/ })).not.toBeInTheDocument();
  });

  it('shows readiness form when approved, not ready, and genesis exists', () => {
    const dashboard = makeDashboard({ validators: [approvedValidator({ is_ready: false })] });
    const launch = makeLaunch({ final_genesis_sha256: 'abc123deadbeef' });
    renderWithClient(<ValidatorPanel {...defaultProps()} launch={launch} dashboard={dashboard} />);
    expect(screen.getByRole('button', { name: /Confirm Readiness/ })).toBeInTheDocument();
  });

  it('shows confirmed banner instead of readiness form when is_ready=true', () => {
    const dashboard = makeDashboard({ validators: [approvedValidator({ is_ready: true })] });
    const launch = makeLaunch({ final_genesis_sha256: 'abc123deadbeef' });
    renderWithClient(<ValidatorPanel {...defaultProps()} launch={launch} dashboard={dashboard} />);
    expect(screen.queryByRole('button', { name: /Confirm Readiness/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Readiness confirmed/)).toBeInTheDocument();
  });
});

// ── JoinSection tests ─────────────────────────────────────────────────────────

describe('ValidatorPanel — JoinSection (H.3 / H.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignedResult();
  });

  it('hides the join form when the window is not open', () => {
    mockFetch();
    renderWithClient(
      <ValidatorPanel {...defaultProps()} launch={makeLaunch({ status: 'WINDOW_CLOSED' })} />,
    );
    expect(screen.queryByRole('button', { name: /Submit Join Request/ })).not.toBeInTheDocument();
    expect(screen.getByText(/application window is not open/i)).toBeInTheDocument();
  });

  it('submit shows error for missing peer address', async () => {
    mockFetch();
    renderWithClient(<ValidatorPanel {...defaultProps()} />);
    fireEvent.change(screen.getByPlaceholderText(/\{"body"/), { target: { value: VALID_GENTX } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Submit Join Request/ }));
    });
    expect(screen.getByText(/Peer address is required/)).toBeInTheDocument();
  });

  it('shows validation error for invalid gentx JSON', async () => {
    mockFetch();
    renderWithClient(<ValidatorPanel {...defaultProps()} />);
    fireEvent.change(screen.getByPlaceholderText(/1\.2\.3\.4:26656/), { target: { value: '5.6.7.8:26656' } });
    fireEvent.change(screen.getByPlaceholderText(/\{"body"/), { target: { value: 'not-valid-json' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Submit Join Request/ }));
    });
    expect(screen.getByText(/gentx must be valid JSON/)).toBeInTheDocument();
  });

  it('calls buildSignedAction with the correct payload shape', async () => {
    mockFetch([
      { method: 'POST', match: `/launch/${LAUNCH_ID}/join`, body: { id: 'req-123', status: 'PENDING' } },
    ]);
    renderWithClient(<ValidatorPanel {...defaultProps()} />);
    await fillAndSubmitJoinForm();

    expect(mockSign).toHaveBeenCalledTimes(1);
    const [payload, , chainId, addr] = mockSign.mock.calls[0];
    expect(chainId).toBe('mychain-1');
    expect(addr).toBe(ADDRESS);
    expect(payload).toMatchObject({
      chain_id: 'mychain-1',
      operator_address: ADDRESS,
      peer_address: '5.6.7.8:26656',
    });
    // gentx must be the parsed object, not the raw string
    expect(typeof (payload as { gentx: unknown }).gentx).toBe('object');
  });

  it('POSTs the signed body to /launch/{id}/join through the mutator', async () => {
    const fetchMock = mockFetch([
      { method: 'POST', match: `/launch/${LAUNCH_ID}/join`, body: { id: 'req-123', status: 'PENDING' } },
    ]);
    renderWithClient(<ValidatorPanel {...defaultProps()} />);
    await fillAndSubmitJoinForm();

    const call = fetchMock.mock.calls.find(
      ([url, init]) => url === `/launch/${LAUNCH_ID}/join` && (init as RequestInit)?.method === 'POST',
    );
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.nonce).toBe('test-nonce');
    expect(body.signature).toBe('testsig==');
  });

  it('shows status card with join request ID + PENDING after successful submit', async () => {
    mockFetch([
      { method: 'POST', match: `/launch/${LAUNCH_ID}/join`, body: { id: 'req-abc-123', status: 'PENDING' } },
    ]);
    renderWithClient(<ValidatorPanel {...defaultProps()} />);
    await fillAndSubmitJoinForm();

    await waitFor(() => {
      expect(screen.getByText(/req-abc-123/)).toBeInTheDocument();
    });
    expect(screen.getAllByText(/PENDING/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Submit Join Request/ })).not.toBeInTheDocument();
  });

  it('shows the conflict message on a 409 response', async () => {
    mockFetch([
      { method: 'POST', match: `/launch/${LAUNCH_ID}/join`, status: 409, body: envelope('duplicate join request') },
    ]);
    renderWithClient(<ValidatorPanel {...defaultProps()} />);
    await fillAndSubmitJoinForm();

    await waitFor(() => {
      expect(screen.getByText(/already have a pending join request/)).toBeInTheDocument();
    });
  });

  it('shows the server error message on a non-409 failure', async () => {
    mockFetch([
      { method: 'POST', match: `/launch/${LAUNCH_ID}/join`, status: 400, body: envelope('invalid peer address') },
    ]);
    renderWithClient(<ValidatorPanel {...defaultProps()} />);
    await fillAndSubmitJoinForm();

    await waitFor(() => {
      expect(screen.getByText('invalid peer address')).toBeInTheDocument();
    });
  });

  // ── Workstream C — per-invariant gentx breakdown (headline feature) ──────────
  it('renders the failed invariants and hides the passing ones on a gentx_invalid 400', async () => {
    mockFetch([
      {
        method: 'POST',
        match: `/launch/${LAUNCH_ID}/join`,
        status: 400,
        body: {
          error: {
            code: 'gentx_invalid',
            message: 'gentx failed',
            invariants: [
              { invariant: 'self_delegation_floor', ok: false, reason: 'below minimum' },
              { invariant: 'well_formed', ok: true },
            ],
          },
        },
      },
    ]);
    renderWithClient(<ValidatorPanel {...defaultProps()} />);
    await fillAndSubmitJoinForm();

    await waitFor(() => {
      expect(screen.getByText(/self_delegation_floor/)).toBeInTheDocument();
    });
    expect(screen.getByText(/below minimum/)).toBeInTheDocument();
    // The passing invariant must NOT be rendered — only failed checks are surfaced.
    expect(screen.queryByText(/well_formed/)).not.toBeInTheDocument();
  });

  it('polls GET /launch/{id}/join/{req_id} and shows the updated status', async () => {
    mockFetch([
      { method: 'POST', match: `/launch/${LAUNCH_ID}/join`, body: { id: 'req-poll-1', status: 'PENDING' } },
      { method: 'GET', match: `/launch/${LAUNCH_ID}/join/req-poll-1`, body: { id: 'req-poll-1', status: 'APPROVED' } },
    ]);
    renderWithClient(<ValidatorPanel {...defaultProps()} />);
    await fillAndSubmitJoinForm();

    await waitFor(() => {
      expect(
        (global as unknown as { fetch: jest.Mock }).fetch,
      ).toHaveBeenCalledWith(`/launch/${LAUNCH_ID}/join/req-poll-1`, expect.anything());
    });
    await waitFor(() => {
      expect(screen.getByText(/APPROVED/)).toBeInTheDocument();
    });
  });
});

// ── GenesisSection tests ──────────────────────────────────────────────────────
// Genesis download uses the raw `authedFetch` (needs exact bytes for SHA-256), not a
// generated JSON hook — but it still lands on `global.fetch`, and reads r.ok /
// r.arrayBuffer() / r.json().

describe('ValidatorPanel — GenesisSection (H.5)', () => {
  const GENESIS_SHA256 = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

  let anchorClickSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // Force crypto.subtle.digest to yield bytes matching GENESIS_SHA256.
    const hashBytes = new Uint8Array(GENESIS_SHA256.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
    Object.defineProperty(global, 'crypto', {
      value: {
        subtle: { digest: jest.fn().mockResolvedValue(hashBytes.buffer) },
        randomUUID: crypto.randomUUID.bind(crypto),
      },
      writable: true,
    });
    global.URL.createObjectURL = jest.fn().mockReturnValue('blob:fake');
    global.URL.revokeObjectURL = jest.fn();
    anchorClickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    anchorClickSpy.mockRestore();
  });

  function approvedProps() {
    const dashboard = makeDashboard({ validators: [approvedValidator()] });
    return defaultProps({ launch: { final_genesis_sha256: GENESIS_SHA256 }, dashboard });
  }

  it('renders the expected SHA-256 hash', () => {
    mockFetch();
    renderWithClient(<ValidatorPanel {...approvedProps()} />);
    expect(screen.getByText(GENESIS_SHA256)).toBeInTheDocument();
  });

  it('fetches GET /launch/{id}/genesis on download click', async () => {
    const fetchMock = mockFetch([
      { method: 'GET', match: `/launch/${LAUNCH_ID}/genesis`, arrayBuffer: new ArrayBuffer(8) },
    ]);
    renderWithClient(<ValidatorPanel {...approvedProps()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Download genesis/ }));
    });

    expect(fetchMock).toHaveBeenCalledWith(`/launch/${LAUNCH_ID}/genesis`, expect.anything());
  });

  it('shows the hash-match confirmation after a successful download', async () => {
    mockFetch([{ method: 'GET', match: `/launch/${LAUNCH_ID}/genesis`, arrayBuffer: new ArrayBuffer(32) }]);
    renderWithClient(<ValidatorPanel {...approvedProps()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Download genesis/ }));
    });

    await waitFor(() => {
      expect(screen.getByText(/✓ match/)).toBeInTheDocument();
    });
  });

  it('shows the mismatch warning when the hashes differ', async () => {
    // digest now returns all-zero bytes → differs from GENESIS_SHA256
    (crypto.subtle.digest as jest.Mock).mockResolvedValue(new ArrayBuffer(32));
    mockFetch([{ method: 'GET', match: `/launch/${LAUNCH_ID}/genesis`, arrayBuffer: new ArrayBuffer(32) }]);
    renderWithClient(<ValidatorPanel {...approvedProps()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Download genesis/ }));
    });

    await waitFor(() => {
      expect(screen.getByText(/✗ mismatch/)).toBeInTheDocument();
    });
  });

  it('shows the error message when the genesis fetch fails', async () => {
    mockFetch([
      { method: 'GET', match: `/launch/${LAUNCH_ID}/genesis`, status: 404, body: envelope('genesis not found') },
    ]);
    renderWithClient(<ValidatorPanel {...approvedProps()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Download genesis/ }));
    });

    await waitFor(() => {
      expect(screen.getByText('genesis not found')).toBeInTheDocument();
    });
  });
});

// ── ReadinessSection tests ────────────────────────────────────────────────────

describe('ValidatorPanel — ReadinessSection (H.6)', () => {
  const GENESIS_SHA256 = 'deadbeef00000000deadbeef00000000deadbeef00000000deadbeef00000000';

  beforeEach(() => {
    jest.clearAllMocks();
    mockSignedResult();
  });

  function approvedProps() {
    const dashboard = makeDashboard({ validators: [approvedValidator({ is_ready: false })] });
    return defaultProps({ launch: { final_genesis_sha256: GENESIS_SHA256 }, dashboard });
  }

  it('pre-fills the genesis hash field', () => {
    mockFetch();
    renderWithClient(<ValidatorPanel {...approvedProps()} />);
    expect(screen.getAllByDisplayValue(GENESIS_SHA256).length).toBeGreaterThan(0);
  });

  it('shows a validation error when the binary hash is empty', async () => {
    mockFetch();
    renderWithClient(<ValidatorPanel {...approvedProps()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm Readiness/ }));
    });
    expect(screen.getByText(/Binary SHA-256 hash is required/)).toBeInTheDocument();
  });

  it('signs with the genesis + binary hashes and POSTs /launch/{id}/ready', async () => {
    const fetchMock = mockFetch([
      { method: 'POST', match: `/launch/${LAUNCH_ID}/ready`, body: {} },
    ]);
    renderWithClient(<ValidatorPanel {...approvedProps()} />);

    fireEvent.change(screen.getByPlaceholderText(/sha256sum output/), { target: { value: 'binaryhash1234' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm Readiness/ }));
    });

    expect(mockSign).toHaveBeenCalledTimes(1);
    const [payload] = mockSign.mock.calls[0];
    expect(payload).toMatchObject({
      genesis_hash_confirmed: GENESIS_SHA256,
      binary_hash_confirmed: 'binaryhash1234',
      operator_address: ADDRESS,
    });
    const call = fetchMock.mock.calls.find(
      ([url, init]) => url === `/launch/${LAUNCH_ID}/ready` && (init as RequestInit)?.method === 'POST',
    );
    expect(call).toBeDefined();
  });

  it('shows the confirmed state after a successful submission', async () => {
    mockFetch([{ method: 'POST', match: `/launch/${LAUNCH_ID}/ready`, body: {} }]);
    renderWithClient(<ValidatorPanel {...approvedProps()} />);

    fireEvent.change(screen.getByPlaceholderText(/sha256sum output/), { target: { value: 'binaryhash1234' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm Readiness/ }));
    });

    await waitFor(() => {
      expect(screen.getByText(/Readiness confirmed — the committee/)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Confirm Readiness/ })).not.toBeInTheDocument();
  });

  it('shows the server error message on failure', async () => {
    mockFetch([
      { method: 'POST', match: `/launch/${LAUNCH_ID}/ready`, status: 409, body: envelope('already confirmed readiness') },
    ]);
    renderWithClient(<ValidatorPanel {...approvedProps()} />);

    fireEvent.change(screen.getByPlaceholderText(/sha256sum output/), { target: { value: 'binaryhash1234' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm Readiness/ }));
    });

    await waitFor(() => {
      expect(screen.getByText('already confirmed readiness')).toBeInTheDocument();
    });
  });
});
