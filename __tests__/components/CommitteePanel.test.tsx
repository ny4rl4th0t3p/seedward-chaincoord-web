import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommitteePanel } from '@/components/CommitteePanel';
import { buildSignedAction } from '@/utils/signedAction';
import type {
  ApiLaunchJSON,
  ApiCommitteeJSON,
  ApiJoinRequestJSON,
  ApiProposalJSON,
} from '@/api/generated/model';

// ── ESM shims ────────────────────────────────────────────────────────────────

jest.mock('@interchain-kit/core', () => ({ CosmosWallet: class CosmosWallet {} }));
jest.mock('@interchain-kit/react/store/stateful-wallet', () => ({
  StatefulWallet: class StatefulWallet {},
}));

jest.mock('@interchain-ui/react', () => ({
  Box: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

// ProposalListSection renders a next/link permalink; mock it to avoid a router-context dependency.
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
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

jest.mock('@/utils/signedAction', () => ({
  buildSignedAction: jest.fn(),
  buildCanonicalActionPayload: jest.fn(() => '{}'),
}));

const mockSign = buildSignedAction as jest.MockedFunction<typeof buildSignedAction>;

// ── react-query harness ───────────────────────────────────────────────────────
// The panel drives generated react-query hooks → the orval `authFetchMutator` →
// `global.fetch`, so we mock `global.fetch` and render under a fresh QueryClient.
// @tanstack/react-query is 4.x: option is `cacheTime` (v5: `gcTime`).

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
// First (method, url-substring) match wins; unmatched → `200 {}`. Order specific
// routes first. On non-2xx the body is coordd's *nested* envelope
// `{ error: { message } }` — what the mutator throws and consumers read.

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
    return {
      ok,
      status,
      json: async () => route?.body ?? {},
      text: async () => JSON.stringify(route?.body ?? {}),
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  });
  (global as unknown as { fetch: jest.Mock }).fetch = fn;
  return fn;
}

function envelope(message: string) {
  return { error: { message } };
}

// The two list queries the panel fires on mount. Callers prepend more specific
// routes; anything else falls through to an empty list.
function listRoutes(opts?: { joinItems?: ApiJoinRequestJSON[]; proposalItems?: ApiProposalJSON[] }): Route[] {
  return [
    { method: 'GET', match: '/proposals', body: { items: opts?.proposalItems ?? [] } },
    { method: 'GET', match: '/join', body: { items: opts?.joinItems ?? [] } },
  ];
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const LAUNCH_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const PROP_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const JR_ID = 'cccccccc-0000-0000-0000-000000000003';

const HINT = {
  chain_id: 'mychain-1',
  chain_name: 'mychain',
  bech32_prefix: 'cosmos',
  denom: 'uatom',
};
const ADDRESS = 'cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu';
const OTHER_COORD = 'cosmos1othercoordinator00000000000000000000000';
const MOCK_WALLET = {} as never;

function makeLaunch(overrides?: Partial<ApiLaunchJSON>): ApiLaunchJSON {
  return {
    id: LAUNCH_ID,
    status: 'WINDOW_OPEN',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeCommittee(overrides?: Partial<ApiCommitteeJSON>): ApiCommitteeJSON {
  return {
    id: 'dddddddd-0000-0000-0000-000000000004',
    members: [{ address: ADDRESS, moniker: 'lead', pub_key_b64: 'testpubkey==' }],
    threshold_m: 1,
    total_n: 1,
    lead_address: ADDRESS,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeJoinRequest(overrides?: Partial<ApiJoinRequestJSON>): ApiJoinRequestJSON {
  return {
    id: JR_ID,
    launch_id: LAUNCH_ID,
    operator_address: 'cosmos1validator000000000000000000000000000000',
    gentx: {},
    peer_address: '1.2.3.4:26656',
    rpc_endpoint: '',
    memo: 'my node',
    submitted_at: '2026-05-01T00:00:00Z',
    status: 'PENDING',
    ...overrides,
  };
}

function makeProposal(overrides?: Partial<ApiProposalJSON>): ApiProposalJSON {
  return {
    id: PROP_ID,
    launch_id: LAUNCH_ID,
    action_type: 'APPROVE_VALIDATOR',
    payload: { join_request_id: JR_ID, operator_address: ADDRESS },
    proposed_by: ADDRESS,
    proposed_at: '2026-05-01T00:00:00Z',
    ttl_expires: '2026-05-08T00:00:00Z',
    status: 'PENDING_SIGNATURES',
    signatures: [],
    ...overrides,
  };
}

function defaultProps(overrides?: {
  launch?: Partial<ApiLaunchJSON>;
  committee?: Partial<ApiCommitteeJSON>;
  isLead?: boolean;
}) {
  return {
    launchId: LAUNCH_ID,
    hint: HINT,
    address: ADDRESS,
    wallet: MOCK_WALLET,
    signingChainId: HINT.chain_id,
    launch: makeLaunch(overrides?.launch),
    committee: makeCommittee(overrides?.committee),
    isLead: overrides?.isLead ?? true,
  };
}

// Signed payloads are passed through: the signed request body carries the original
// fields (e.g. `decision`) plus the signature envelope.
function mockSignedResult() {
  mockSign.mockImplementation(async (payload: Record<string, unknown>) => ({
    ...payload,
    timestamp: '2026-01-01T00:00:00Z',
    nonce: 'test-nonce',
    pubkey_b64: 'testpubkey==',
    signature: 'testsig==',
  }) as never);
}

// ── H.7 — Join queue ──────────────────────────────────────────────────────────

describe('CommitteePanel — JoinQueueSection (H.7)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignedResult();
  });

  it('shows the empty state when there are no join requests', async () => {
    mockFetch(listRoutes());
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText(/No join requests yet/)).toBeInTheDocument();
    });
  });

  it('renders operator + memo and Approve/Reject for a PENDING request', async () => {
    const jr = makeJoinRequest({ memo: 'fast-node', status: 'PENDING' });
    mockFetch(listRoutes({ joinItems: [jr] }));
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText(/fast-node/)).toBeInTheDocument();
    });
    expect(screen.getByText(new RegExp(jr.operator_address!.slice(0, 12)))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('shows no action buttons for an APPROVED request', async () => {
    mockFetch(listRoutes({ joinItems: [makeJoinRequest({ status: 'APPROVED' })] }));
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText(/my node/)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });

  it('shows the fetch error when the join queue request fails', async () => {
    mockFetch([
      { method: 'GET', match: '/proposals', body: { items: [] } },
      { method: 'GET', match: '/join', status: 500, body: envelope('internal error') },
    ]);
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText('internal error')).toBeInTheDocument();
    });
  });
});

// ── H.8 — Raise proposal ──────────────────────────────────────────────────────

describe('CommitteePanel — ProposalForm (H.8)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignedResult();
  });

  async function openApproveForm(routes: Route[]) {
    mockFetch(routes);
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => screen.getByRole('button', { name: 'Approve' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    });
  }

  it('opens the APPROVE_VALIDATOR form when Approve is clicked', async () => {
    await openApproveForm(listRoutes({ joinItems: [makeJoinRequest()] }));
    expect(screen.getByText('Approve Validator')).toBeInTheDocument();
  });

  it('shows the reason field for Reject but not for Approve', async () => {
    mockFetch(listRoutes({ joinItems: [makeJoinRequest()] }));
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => screen.getByRole('button', { name: 'Reject' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    });
    expect(screen.getByPlaceholderText(/Reason for rejection/)).toBeInTheDocument();
  });

  it('signs and POSTs /launch/{id}/proposal, then shows the raised feedback', async () => {
    const routes: Route[] = [
      { method: 'POST', match: `/launch/${LAUNCH_ID}/proposal`, body: makeProposal() },
      ...listRoutes({ joinItems: [makeJoinRequest()] }),
    ];
    await openApproveForm(routes);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sign & Raise Approve/ }));
    });

    // buildSignedAction received the correct proposal payload
    expect(mockSign).toHaveBeenCalled();
    const [payload, , chainId, addr] = mockSign.mock.calls[0];
    expect(chainId).toBe('mychain-1');
    expect(addr).toBe(ADDRESS);
    expect(payload).toMatchObject({
      action_type: 'APPROVE_VALIDATOR',
      coordinator_address: ADDRESS,
      payload: { join_request_id: JR_ID },
    });

    // the POST hit the proposal endpoint with the signed body
    const call = (global as unknown as { fetch: jest.Mock }).fetch.mock.calls.find(
      ([url, init]: [string, RequestInit]) => url === `/launch/${LAUNCH_ID}/proposal` && init?.method === 'POST',
    );
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.action_type).toBe('APPROVE_VALIDATOR');
    expect(body.signature).toBe('testsig==');

    await waitFor(() => {
      expect(screen.getByText(/Proposal raised/)).toBeInTheDocument();
    });
  });

  it('shows the server error on a failed raise', async () => {
    const routes: Route[] = [
      { method: 'POST', match: `/launch/${LAUNCH_ID}/proposal`, status: 403, body: envelope('not a committee member') },
      ...listRoutes({ joinItems: [makeJoinRequest()] }),
    ];
    await openApproveForm(routes);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sign & Raise Approve/ }));
    });

    await waitFor(() => {
      expect(screen.getByText('not a committee member')).toBeInTheDocument();
    });
  });

  it('Cancel dismisses the proposal form', async () => {
    await openApproveForm(listRoutes({ joinItems: [makeJoinRequest()] }));
    expect(screen.getByText('Approve Validator')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(screen.queryByText('Approve Validator')).not.toBeInTheDocument();
  });
});

// ── H.9 — Proposal list + sign/veto ──────────────────────────────────────────

describe('CommitteePanel — ProposalListSection (H.9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignedResult();
  });

  it('shows the empty state when there are no proposals', async () => {
    mockFetch(listRoutes());
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText(/No proposals yet/)).toBeInTheDocument();
    });
  });

  it('renders the action type + PENDING_SIGNATURES status and Sign/Veto buttons', async () => {
    mockFetch(listRoutes({ proposalItems: [makeProposal({ signatures: [] })] }));
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText('APPROVE VALIDATOR')).toBeInTheDocument();
    });
    expect(screen.getByText('PENDING_SIGNATURES')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Veto' })).toBeInTheDocument();
  });

  it('renders a ✓ for a signature with decision SIGN', async () => {
    const proposal = makeProposal({
      signatures: [{ coordinator_address: OTHER_COORD, decision: 'SIGN', timestamp: '2026-05-01T00:00:00Z' }],
    });
    mockFetch(listRoutes({ proposalItems: [proposal] }));
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText(/✓/)).toBeInTheDocument();
    });
    // A signature from another coordinator leaves our Sign/Veto available.
    expect(screen.getByRole('button', { name: 'Sign' })).toBeInTheDocument();
  });

  it('hides Sign/Veto once the coordinator has already signed', async () => {
    const proposal = makeProposal({
      signatures: [{ coordinator_address: ADDRESS, decision: 'SIGN', timestamp: '2026-05-01T00:00:00Z' }],
    });
    mockFetch(listRoutes({ proposalItems: [proposal] }));
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText(/You signed this proposal/)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Sign' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Veto' })).not.toBeInTheDocument();
  });

  it('hides Sign/Veto for an EXECUTED proposal', async () => {
    mockFetch(listRoutes({ proposalItems: [makeProposal({ status: 'EXECUTED' })] }));
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText('EXECUTED')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Sign' })).not.toBeInTheDocument();
  });

  it('POSTs /launch/{id}/proposal/{prop_id}/sign with decision SIGN', async () => {
    mockFetch([
      { method: 'POST', match: `/launch/${LAUNCH_ID}/proposal/${PROP_ID}/sign`, body: makeProposal() },
      ...listRoutes({ proposalItems: [makeProposal()] }),
    ]);
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => screen.getByRole('button', { name: 'Sign' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign' }));
    });

    const call = (global as unknown as { fetch: jest.Mock }).fetch.mock.calls.find(
      ([url, init]: [string, RequestInit]) =>
        url === `/launch/${LAUNCH_ID}/proposal/${PROP_ID}/sign` && init?.method === 'POST',
    );
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.decision).toBe('SIGN');
    expect(body.coordinator_address).toBe(ADDRESS);
  });

  it('POSTs decision VETO when Veto is clicked', async () => {
    mockFetch([
      { method: 'POST', match: `/launch/${LAUNCH_ID}/proposal/${PROP_ID}/sign`, body: makeProposal({ status: 'VETOED' }) },
      ...listRoutes({ proposalItems: [makeProposal()] }),
    ]);
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => screen.getByRole('button', { name: 'Veto' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Veto' }));
    });

    const call = (global as unknown as { fetch: jest.Mock }).fetch.mock.calls.find(
      ([url]: [string]) => url === `/launch/${LAUNCH_ID}/proposal/${PROP_ID}/sign`,
    );
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.decision).toBe('VETO');
  });

  it('shows the error message when signing fails', async () => {
    mockFetch([
      { method: 'POST', match: `/launch/${LAUNCH_ID}/proposal/${PROP_ID}/sign`, status: 409, body: envelope('already signed') },
      ...listRoutes({ proposalItems: [makeProposal()] }),
    ]);
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => screen.getByRole('button', { name: 'Sign' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign' }));
    });

    await waitFor(() => {
      expect(screen.getByText('already signed')).toBeInTheDocument();
    });
  });
});

// ── H.10 — Committee actions ────────────────────────────────────────────────

describe('CommitteePanel — CommitteeActionsSection (H.10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignedResult();
  });

  it('shows Open Application Window on a DRAFT launch', async () => {
    mockFetch(listRoutes());
    renderWithClient(<CommitteePanel {...defaultProps({ launch: { status: 'DRAFT' } })} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Open Application Window/ })).toBeInTheDocument();
    });
  });

  it('hides Open Application Window on a non-DRAFT launch', async () => {
    mockFetch(listRoutes());
    renderWithClient(<CommitteePanel {...defaultProps({ launch: { status: 'WINDOW_OPEN' } })} />);
    await waitFor(() => screen.getByRole('button', { name: /Set Monitor RPC/ }));
    expect(screen.queryByRole('button', { name: /Open Application Window/ })).not.toBeInTheDocument();
  });

  it('POSTs /launch/{id}/open-window on click', async () => {
    mockFetch([
      { method: 'POST', match: `/launch/${LAUNCH_ID}/open-window`, body: {} },
      ...listRoutes(),
    ]);
    renderWithClient(<CommitteePanel {...defaultProps({ launch: { status: 'DRAFT' } })} />);
    await waitFor(() => screen.getByRole('button', { name: /Open Application Window/ }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Open Application Window/ }));
    });

    const call = (global as unknown as { fetch: jest.Mock }).fetch.mock.calls.find(
      ([url, init]: [string, RequestInit]) => url === `/launch/${LAUNCH_ID}/open-window` && init?.method === 'POST',
    );
    expect(call).toBeDefined();
  });

  it('shows the error when open-window fails', async () => {
    mockFetch([
      { method: 'POST', match: `/launch/${LAUNCH_ID}/open-window`, status: 409, body: envelope('already open') },
      ...listRoutes(),
    ]);
    renderWithClient(<CommitteePanel {...defaultProps({ launch: { status: 'DRAFT' } })} />);
    await waitFor(() => screen.getByRole('button', { name: /Open Application Window/ }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Open Application Window/ }));
    });

    await waitFor(() => {
      expect(screen.getByText('already open')).toBeInTheDocument();
    });
  });

  it('pre-fills the monitor RPC field from launch.monitor_rpc_url', async () => {
    mockFetch(listRoutes());
    renderWithClient(<CommitteePanel {...defaultProps({ launch: { monitor_rpc_url: 'https://rpc.example.com' } })} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('https://rpc.example.com')).toBeInTheDocument();
    });
  });

  it('PATCHes /launch/{id} with monitor_rpc_url and shows Saved', async () => {
    mockFetch([
      { method: 'PATCH', match: `/launch/${LAUNCH_ID}`, body: makeLaunch({ monitor_rpc_url: 'https://new-rpc.example.com' }) },
      ...listRoutes(),
    ]);
    renderWithClient(<CommitteePanel {...defaultProps()} />);

    await waitFor(() => screen.getByPlaceholderText(/https:\/\/rpc\.mychain/));
    fireEvent.change(screen.getByPlaceholderText(/https:\/\/rpc\.mychain/), {
      target: { value: 'https://new-rpc.example.com' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Set Monitor RPC/ }));
    });

    const call = (global as unknown as { fetch: jest.Mock }).fetch.mock.calls.find(
      ([url, init]: [string, RequestInit]) => url === `/launch/${LAUNCH_ID}` && init?.method === 'PATCH',
    );
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.monitor_rpc_url).toBe('https://new-rpc.example.com');

    await waitFor(() => {
      expect(screen.getByText('Saved.')).toBeInTheDocument();
    });
  });

  it('POSTs /launch/{id}/genesis?type=initial and shows the saved confirmation', async () => {
    mockFetch([
      { method: 'POST', match: `/launch/${LAUNCH_ID}/genesis`, body: { sha256: 'abc123' } },
      ...listRoutes(),
    ]);
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => screen.getByPlaceholderText(/genesis\.json/));

    fireEvent.change(screen.getByPlaceholderText(/genesis\.json/), {
      target: { value: 'https://files.example.com/genesis.json' },
    });
    fireEvent.change(screen.getByPlaceholderText(/64-character hex/), {
      target: { value: 'abc123def456' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Submit Genesis Reference/ }));
    });

    const call = (global as unknown as { fetch: jest.Mock }).fetch.mock.calls.find(
      ([url, init]: [string, RequestInit]) => url === `/launch/${LAUNCH_ID}/genesis?type=initial` && init?.method === 'POST',
    );
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.url).toBe('https://files.example.com/genesis.json');
    expect(body.sha256).toBe('abc123def456');

    await waitFor(() => {
      expect(screen.getByText('Genesis reference saved.')).toBeInTheDocument();
    });
  });

  it('shows the genesis_time field only when final is selected', async () => {
    mockFetch(listRoutes());
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => screen.getByDisplayValue('initial'));
    expect(screen.queryByPlaceholderText(/2026-06-01T12/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByDisplayValue('final'));
    expect(screen.getByPlaceholderText(/2026-06-01T12/)).toBeInTheDocument();
  });

  it('requires the URL before submitting genesis', async () => {
    mockFetch(listRoutes());
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => screen.getByRole('button', { name: /Submit Genesis Reference/ }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Submit Genesis Reference/ }));
    });

    expect(screen.getByText('URL is required.')).toBeInTheDocument();
  });
});

// ── Allocation files ──────────────────────────────────────────────────────────

describe('CommitteePanel — AllocationFilesSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignedResult();
  });

  const ALLOC = `/launch/${LAUNCH_ID}/allocations`;

  it('lists registered allocation files with hash and status', async () => {
    mockFetch([
      {
        method: 'GET',
        match: ALLOC,
        body: {
          allocations: [
            { type: 'accounts', sha256: 'deadbeefcafe', status: 'APPROVED', uploaded_at: '2026-05-01T00:00:00Z' },
          ],
        },
      },
      ...listRoutes(),
    ]);
    renderWithClient(<CommitteePanel {...defaultProps()} />);

    await waitFor(() => expect(screen.getByText('deadbeefcafe')).toBeInTheDocument());
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
  });

  it('shows the empty state when no allocation files exist', async () => {
    mockFetch([{ method: 'GET', match: ALLOC, body: { allocations: [] } }, ...listRoutes()]);
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() =>
      expect(screen.getByText(/No allocation files registered yet/)).toBeInTheDocument(),
    );
  });

  it('registers an allocation file (attestor mode) with a JSON { url, sha256 } body', async () => {
    mockFetch([
      { method: 'POST', match: `${ALLOC}/accounts`, body: { sha256: 'abc' } },
      { method: 'GET', match: ALLOC, body: { allocations: [] } },
      ...listRoutes(),
    ]);
    renderWithClient(<CommitteePanel {...defaultProps()} />);

    await waitFor(() => screen.getByPlaceholderText('https://files.example.com/accounts.csv'));
    fireEvent.change(screen.getByPlaceholderText('https://files.example.com/accounts.csv'), {
      target: { value: 'https://files.example.com/a.csv' },
    });
    fireEvent.change(screen.getByPlaceholderText('64-char hex SHA-256 digest'), {
      target: { value: 'a'.repeat(64) },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Register allocation file' }));
    });

    const call = (global as unknown as { fetch: jest.Mock }).fetch.mock.calls.find(
      ([url, init]: [string, RequestInit]) => url === `${ALLOC}/accounts` && init?.method === 'POST',
    );
    expect(call).toBeDefined();
    const init = call![1] as RequestInit;
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({
      url: 'https://files.example.com/a.csv',
      sha256: 'a'.repeat(64),
    });
    await waitFor(() =>
      expect(screen.getByText('Allocation file registered.')).toBeInTheDocument(),
    );
  });

  it('surfaces the error envelope when registration fails', async () => {
    mockFetch([
      { method: 'POST', match: `${ALLOC}/accounts`, status: 403, body: envelope('not a committee member') },
      { method: 'GET', match: ALLOC, body: { allocations: [] } },
      ...listRoutes(),
    ]);
    renderWithClient(<CommitteePanel {...defaultProps()} />);

    await waitFor(() => screen.getByPlaceholderText('https://files.example.com/accounts.csv'));
    fireEvent.change(screen.getByPlaceholderText('https://files.example.com/accounts.csv'), {
      target: { value: 'https://x/a.csv' },
    });
    fireEvent.change(screen.getByPlaceholderText('64-char hex SHA-256 digest'), {
      target: { value: 'a'.repeat(64) },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Register allocation file' }));
    });

    await waitFor(() =>
      expect(screen.getByText('not a committee member')).toBeInTheDocument(),
    );
  });

  it('requires the URL before submitting', async () => {
    mockFetch([{ method: 'GET', match: ALLOC, body: { allocations: [] } }, ...listRoutes()]);
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => screen.getByRole('button', { name: 'Register allocation file' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Register allocation file' }));
    });
    expect(screen.getByText('URL is required.')).toBeInTheDocument();
  });

  it('downloads an allocation file via authedFetch (GET .../allocations/{type})', async () => {
    mockFetch([
      { method: 'GET', match: `${ALLOC}/accounts`, body: {} },
      {
        method: 'GET',
        match: ALLOC,
        body: {
          allocations: [
            { type: 'accounts', sha256: 'deadbeefcafe', status: 'APPROVED', uploaded_at: '2026-05-01T00:00:00Z' },
          ],
        },
      },
      ...listRoutes(),
    ]);
    const createObjectURL = jest.fn(() => 'blob:mock');
    const revokeObjectURL = jest.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
    // Anchor.click() would make jsdom attempt a real navigation ("not implemented"); no-op it.
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => screen.getByRole('button', { name: 'Download' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    });

    const call = (global as unknown as { fetch: jest.Mock }).fetch.mock.calls.find(
      ([url]: [string]) => url === `${ALLOC}/accounts`,
    );
    expect(call).toBeDefined();
    expect(createObjectURL).toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});

// ── Members allowlist ─────────────────────────────────────────────────────────

describe('CommitteePanel — MembersSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignedResult();
  });

  const MEMBERS = `/launch/${LAUNCH_ID}/members`;
  const MEMBER = 'cosmos1memberaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  it('lists members with their label', async () => {
    mockFetch([
      {
        method: 'GET',
        match: MEMBERS,
        body: [{ address: MEMBER, label: 'Acme Validators', added_by: ADDRESS, added_at: '2026-05-01T00:00:00Z' }],
      },
      ...listRoutes(),
    ]);
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => expect(screen.getByText('Acme Validators')).toBeInTheDocument());
  });

  it('shows the empty state when no members exist', async () => {
    mockFetch([{ method: 'GET', match: MEMBERS, body: [] }, ...listRoutes()]);
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() =>
      expect(screen.getByText(/No members on the allowlist yet/)).toBeInTheDocument(),
    );
  });

  it('adds a member with a JSON { address, label } body', async () => {
    mockFetch([
      { method: 'POST', match: MEMBERS, body: {} },
      { method: 'GET', match: MEMBERS, body: [] },
      ...listRoutes(),
    ]);
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => screen.getByPlaceholderText('cosmos1… hot address'));

    fireEvent.change(screen.getByPlaceholderText('cosmos1… hot address'), { target: { value: MEMBER } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Acme Validators (optional)'), {
      target: { value: 'Acme' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    });

    const call = (global as unknown as { fetch: jest.Mock }).fetch.mock.calls.find(
      ([url, init]: [string, RequestInit]) => url === MEMBERS && init?.method === 'POST',
    );
    expect(call).toBeDefined();
    expect(JSON.parse(call![1].body as string)).toEqual({ address: MEMBER, label: 'Acme' });
  });

  it('surfaces the error envelope when adding a member fails', async () => {
    mockFetch([
      { method: 'POST', match: MEMBERS, status: 409, body: envelope('already a member') },
      { method: 'GET', match: MEMBERS, body: [] },
      ...listRoutes(),
    ]);
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => screen.getByPlaceholderText('cosmos1… hot address'));
    fireEvent.change(screen.getByPlaceholderText('cosmos1… hot address'), { target: { value: MEMBER } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    });
    await waitFor(() => expect(screen.getByText('already a member')).toBeInTheDocument());
  });

  it('requires an address before adding', async () => {
    mockFetch([{ method: 'GET', match: MEMBERS, body: [] }, ...listRoutes()]);
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => screen.getByRole('button', { name: 'Add member' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    });
    expect(screen.getByText('Address is required.')).toBeInTheDocument();
  });

  it('removes a member only after a confirm step (DELETE .../members/{address})', async () => {
    mockFetch([
      { method: 'DELETE', match: `${MEMBERS}/`, body: {} },
      {
        method: 'GET',
        match: MEMBERS,
        body: [{ address: MEMBER, label: 'Acme', added_by: ADDRESS, added_at: '2026-05-01T00:00:00Z' }],
      },
      ...listRoutes(),
    ]);
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => screen.getByRole('button', { name: 'Remove' }));

    // First click only asks for confirmation — no DELETE yet.
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('Remove?')).toBeInTheDocument();
    expect(
      (global as unknown as { fetch: jest.Mock }).fetch.mock.calls.find(
        ([, init]: [string, RequestInit]) => init?.method === 'DELETE',
      ),
    ).toBeUndefined();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    });

    const call = (global as unknown as { fetch: jest.Mock }).fetch.mock.calls.find(
      ([url, init]: [string, RequestInit]) => url === `${MEMBERS}/${MEMBER}` && init?.method === 'DELETE',
    );
    expect(call).toBeDefined();
  });
});

// ── Join queue: grouped-by-submitter view ──────────────────────────────────────

describe('CommitteePanel — JoinQueueSection grouped view', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignedResult();
  });

  it('toggles to a grouped-by-submitter view (label, count, self-delegation)', async () => {
    mockFetch([
      {
        method: 'GET',
        match: '/join/grouped',
        body: [
          {
            submitter_address: 'cosmos1submitteraaaaaaaaaaaaaaaaaaaaaaaaaa',
            label: 'Acme Group',
            request_count: 2,
            total_self_delegation: '1000000',
            requests: [
              { id: 'jr1', operator_address: 'cosmos1valaaaa', status: 'PENDING' },
              { id: 'jr2', operator_address: 'cosmos1valbbbb', status: 'APPROVED' },
            ],
          },
        ],
      },
      ...listRoutes({ joinItems: [makeJoinRequest()] }),
    ]);
    renderWithClient(<CommitteePanel {...defaultProps()} />);

    await waitFor(() => screen.getByRole('button', { name: 'Group by submitter' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Group by submitter' }));
    });

    await waitFor(() => expect(screen.getByText('Acme Group')).toBeInTheDocument());
    expect(screen.getByText(/self-delegation/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Flat list' })).toBeInTheDocument();
  });

  it('shows the grouped empty state and does not fetch grouped until toggled', async () => {
    const fetchMock = mockFetch([
      { method: 'GET', match: '/join/grouped', body: [] },
      ...listRoutes({ joinItems: [makeJoinRequest()] }),
    ]);
    renderWithClient(<CommitteePanel {...defaultProps()} />);
    await waitFor(() => screen.getByRole('button', { name: 'Group by submitter' }));

    // Grouped endpoint must not be hit while the flat view is showing.
    expect(fetchMock.mock.calls.some(([url]: [string, RequestInit?]) => url.includes('/join/grouped'))).toBe(false);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Group by submitter' }));
    });
    await waitFor(() => expect(screen.getByText(/No join requests yet/)).toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([url]: [string, RequestInit?]) => url.includes('/join/grouped'))).toBe(true);
  });
});
