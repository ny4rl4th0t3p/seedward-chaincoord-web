import { authFetchMutator } from '@/api/mutator/authFetch';

function mockFetchResponse(res: Partial<Response> & { json: () => Promise<unknown> }) {
  const fn = jest.fn(async (_url: string, _init?: RequestInit) => res as unknown as Response);
  (global as unknown as { fetch: jest.Mock }).fetch = fn;
  return fn;
}

describe('authFetchMutator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  it('returns the parsed JSON body on success', async () => {
    mockFetchResponse({ ok: true, status: 200, json: async () => ({ hello: 'world' }) });
    await expect(authFetchMutator('/x')).resolves.toEqual({ hello: 'world' });
  });

  it('returns undefined for 204 No Content (no body parse)', async () => {
    mockFetchResponse({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error('should not be called');
      },
    });
    await expect(authFetchMutator('/x')).resolves.toBeUndefined();
  });

  it('attaches the Bearer token from sessionStorage when present', async () => {
    sessionStorage.setItem('coord_auth_token', 'tok123');
    const fetchMock = mockFetchResponse({ ok: true, status: 200, json: async () => ({}) });
    await authFetchMutator('/x');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok123');
  });

  it('throws coordd’s error envelope with the HTTP status on non-2xx', async () => {
    mockFetchResponse({ ok: false, status: 409, json: async () => ({ error: { message: 'conflict' } }) });
    await expect(authFetchMutator('/x')).rejects.toMatchObject({
      error: { message: 'conflict' },
      status: 409,
    });
  });

  it('on 401 clears the session and dispatches coord:unauthorized', async () => {
    sessionStorage.setItem('coord_auth_token', 'tok');
    const dispatch = jest.spyOn(window, 'dispatchEvent');
    mockFetchResponse({ ok: false, status: 401, json: async () => ({ error: { message: 'unauth' } }) });

    await expect(authFetchMutator('/x')).rejects.toBeTruthy();
    expect(sessionStorage.getItem('coord_auth_token')).toBeNull();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'coord:unauthorized' }));
  });
});
