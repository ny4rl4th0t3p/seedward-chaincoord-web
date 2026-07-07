import { useCallback, useEffect, useState } from 'react';
import type { ApiChainRecordJSON } from '@/api/generated/model/apiChainRecordJSON';
import type { ApiInvariantResultJSON } from '@/api/generated/model/apiInvariantResultJSON';

// Client-side advisory gentx validation via the gentxvalidate WASM build (seedward-libs).
// The blob is vendored under public/wasm/ by `yarn sync:wasm` and lazy-loaded on first need. This is
// ADVISORY only — the coordd server (RunAll, incl. the signature check) stays authoritative on submit.
// gentxvalidate.Result marshals to {invariant, ok, reason} — identical to ApiInvariantResultJSON.

// GentxParams mirrors gentxvalidate.Params (JSON tags must match exactly).
export interface GentxParams {
  chain_id: string;
  bond_denom: string;
  bech32_prefix: string;
  min_self_delegation: string;
  min_commission_rate: string;
  max_commission_rate: string;
  max_commission_change_rate: string;
  max_moniker_len: number;
}

// paramsFromRecord builds the light-check params from a launch's chain record. min_commission_rate is
// not carried on the record (empty = "not declared", which the check treats as no floor), and
// max_moniker_len 0 means the SDK default.
export function paramsFromRecord(record?: ApiChainRecordJSON): GentxParams {
  return {
    chain_id: record?.chain_id ?? '',
    bond_denom: record?.denom ?? '',
    bech32_prefix: record?.bech32_prefix ?? '',
    min_self_delegation: record?.min_self_delegation ?? '',
    min_commission_rate: '',
    max_commission_rate: record?.max_commission_rate ?? '',
    max_commission_change_rate: record?.max_commission_change_rate ?? '',
    max_moniker_len: 0,
  };
}

type RunLight = (gentxJSON: string, paramsJSON: string) => string;

const WASM_GZ_URL = '/wasm/gentxvalidate.wasm.gz';
const WASM_EXEC_URL = '/wasm/wasm_exec.js';

// The vendored blob is gzipped (the CI-size-budgeted ~2 MB artifact), served as an opaque
// application/gzip file (no Content-Encoding). Decompress it in-browser so the wire transfer is the
// gzipped size regardless of any server/CDN compression config. Unsupported browsers throw → the hook
// degrades to server-only validation.
async function fetchWasmBytes(): Promise<ArrayBuffer> {
  const res = await fetch(WASM_GZ_URL);
  if (!res.ok || !res.body) throw new Error(`fetch ${WASM_GZ_URL}: ${res.status}`);
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream unsupported — advisory gentx validation disabled');
  }
  const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

// Module-level singleton — the ~2 MB blob is fetched + instantiated at most once per page load.
let loadPromise: Promise<RunLight> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function loadValidator(): Promise<RunLight> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    await loadScript(WASM_EXEC_URL); // defines globalThis.Go
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const GoCtor = (globalThis as any).Go;
    if (typeof GoCtor !== 'function') throw new Error('wasm_exec.js did not define Go');
    const go = new GoCtor();
    const bytes = await fetchWasmBytes(); // gzipped blob → decompressed in-browser
    const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
    // main() registers the globals then parks on `select {}`; do NOT await go.run (it never resolves).
    go.run(instance);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (globalThis as any).seedwardRunLight;
    if (typeof fn !== 'function') throw new Error('seedwardRunLight was not registered');
    return fn as RunLight;
  })();
  // A failed load must not poison the singleton for a later retry.
  loadPromise.catch(() => {
    loadPromise = null;
  });
  return loadPromise;
}

export interface UseGentxValidator {
  validate: (gentxJSON: string, params: GentxParams) => ApiInvariantResultJSON[] | null;
  ready: boolean;
  error: string | null;
}

// useGentxValidator lazy-loads the validator once `enabled` is true (e.g. the gentx field is non-empty),
// keeping the blob out of the initial bundle. Load failures degrade silently to server-only validation.
export function useGentxValidator(enabled: boolean): UseGentxValidator {
  const [runLight, setRunLight] = useState<RunLight | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || runLight) return;
    let cancelled = false;
    loadValidator().then(
      (fn) => {
        if (!cancelled) setRunLight(() => fn);
      },
      (e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, runLight]);

  const validate = useCallback(
    (gentxJSON: string, params: GentxParams): ApiInvariantResultJSON[] | null => {
      if (!runLight) return null;
      try {
        return JSON.parse(runLight(gentxJSON, JSON.stringify(params))) as ApiInvariantResultJSON[];
      } catch {
        return null;
      }
    },
    [runLight],
  );

  return { validate, ready: !!runLight, error };
}
