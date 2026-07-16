import { renderHook, waitFor } from '@testing-library/react';
import { useLaunchEventStream } from '@/hooks/useLaunchEventStream';

// A minimal ReadableStream stub: yields each frame once, then closes the stream.
function streamOf(...frames: string[]) {
  const enc = new TextEncoder();
  let i = 0;
  return {
    getReader: () => ({
      read: () => {
        if (i < frames.length) {
          const value = enc.encode(frames[i]);
          i += 1;
          return Promise.resolve({ value, done: false });
        }
        return Promise.resolve({ value: undefined, done: true });
      },
      cancel: () => Promise.resolve(),
    }),
  };
}

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe('useLaunchEventStream', () => {
  it('sends the Bearer token + Accept header and appends pushed events', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      body: streamOf('event: WindowOpened\ndata: {"status":"WINDOW_OPEN"}\n\n'),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useLaunchEventStream('launch-1', 'tok-123'));

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]).toContain('{"status":"WINDOW_OPEN"}');

    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/launch/launch-1/events');
    const headers = opts.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok-123');
    expect(headers.Accept).toBe('text/event-stream');
  });

  it('dispatches coord:unauthorized on 401', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ status: 401, ok: false, body: null }) as unknown as typeof fetch;
    const dispatch = jest.spyOn(window, 'dispatchEvent');

    renderHook(() => useLaunchEventStream('launch-1', 'tok'));

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'coord:unauthorized' }),
      ),
    );
  });

  it('stops without reconnecting or logging out on a 404 (not visible / gone)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ status: 404, ok: false, body: null });
    global.fetch = fetchMock as unknown as typeof fetch;
    const dispatch = jest.spyOn(window, 'dispatchEvent');

    const { result } = renderHook(() => useLaunchEventStream('launch-1', 'tok'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(result.current).toHaveLength(0);
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'coord:unauthorized' }),
    );
  });

  it('does not open a stream without a token', () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    renderHook(() => useLaunchEventStream('launch-1', null));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
