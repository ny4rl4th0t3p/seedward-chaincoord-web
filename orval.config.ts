import { defineConfig } from 'orval';

/**
 * Generates the typed coordd API client (react-query hooks) from the vendored OpenAPI spec.
 *
 * Pipeline (see package.json `gen:api`):
 *   openapi/swagger.yaml   (vendored Swagger 2.0, copied from seedward-chaincoord by `sync:spec`)
 *     → swagger2openapi  → openapi/openapi.json   (OpenAPI 3.0 — orval needs 3.x)
 *     → orval            → api/generated/**        (useX() hooks + typed request fns + models)
 *
 * `client: 'react-query'` emits `useQuery`/`useMutation` hooks per operation (the app already depends on
 * @tanstack/react-query), giving caching, dedup, retries, and race-safety for free. `httpClient: 'fetch'`
 * keeps the underlying transport as fetch (no axios). Every request goes through the custom mutator
 * (api/mutator/authFetch.ts): Bearer token from sessionStorage, 401 → clear session + `coord:unauthorized`,
 * and it throws coordd's nested `{error:{code,message,invariants}}` envelope on failure — which react-query
 * surfaces as the hook's `.error`.
 */
export default defineConfig({
  coordd: {
    input: {
      // 3.0 file produced by `swagger2openapi` in the `gen:api` script (gitignored — derived).
      target: './openapi/openapi.json',
    },
    output: {
      mode: 'tags-split', // one module per OpenAPI tag (launches, proposals, join, allocations, …)
      target: './api/generated',
      schemas: './api/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      clean: true, // wipe stale generated files each run so deletions propagate
      override: {
        mutator: {
          path: './api/mutator/authFetch.ts',
          name: 'authFetchMutator',
        },
        // Return the response payload directly (not orval's {data,status,headers} wrapper), so the
        // hook's `.data` is the typed body and our throwing mutator drives react-query's `.error`.
        fetch: {
          includeHttpResponseReturnType: false,
        },
      },
    },
  },
});
