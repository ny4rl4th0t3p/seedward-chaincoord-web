# seedward-chaincoord-web — design decisions

Repo-internal decisions for the coordd control panel. The cross-cutting ones — the web is a standalone
spec-consuming repo, the OpenAPI-generated client, ADR-036 auth, the client-side gentx WASM validation, and
the structured-400 invariant rendering — live in the suite ADR log. This file records the choices that only
matter inside this repo.

## Generated client: orval react-query off a vendored spec

The typed API client is orval-generated (`orval.config.ts`): `client: react-query`, `httpClient: fetch`,
`mode: tags-split`, `clean: true`, through a single custom mutator. react-query was chosen because the app
already uses it (caching, dedup, retry come free). The spec is **vendored** — `sync:spec` copies coordd's
`swagger.yaml`, `swagger2openapi` converts it, then `gen:api` generates the client.

## The fetch mutator

`api/mutator/authFetch.ts` is a plain module function (not a hook), so the generated code carries no React
dependency. It reads the JWT from `sessionStorage['coord_auth_token']`; on a `401` it clears the session
and dispatches a `coord:unauthorized` event; and it **attaches the HTTP `status` to the thrown error
envelope** so call sites can branch `409` vs `400`. The nested envelope `{error:{code,message,invariants}}`
surfaces as react-query's `.error`.

## Wallets: interchain-kit

Wallet connectivity is **`interchain-kit`** (Keplr / Leap / MetaMask) + interchain-ui + interchainjs —
signing the ADR-036 challenge via the wallet's `signArbitrary`. Starship is kept as the local multi-chain
dev harness (with a `ChainDropdown`).

## WASM advisory validator

`hooks/useGentxValidator.ts` is a module-singleton lazy loader: it fetches the pre-gzipped
`gentxvalidate.wasm.gz`, decompresses in-browser (`DecompressionStream`), instantiates once, and caches
`seedwardRunLight`. It is **advisory and non-blocking** — a client/server version skew must never gate a
legit submit, so the server (`RunAll`) stays authoritative. `paramsFromRecord` maps the launch record to
the validator's `Params`. It degrades silently if the blob is absent or the browser lacks
`DecompressionStream`.

## Drift gates

Two CI gates keep the web honest: **spec drift** (`gen:api` regenerates the client and fails if
`api/generated` changed vs the vendored spec) and **WASM-pin drift** (`check:wasm-version` resolves
coordd's latest git tag and compares its `seedward-libs` require to `scripts/wasm-version.txt`). Node is
pinned to 24.

## e2e runs a real coordd

Playwright's `globalSetup` runs a real coordd two ways: a **built sibling binary** (`COORDD_BIN`, default
`../seedward-chaincoord/bin/coordd`; CI downloads the pinned release binary), or a **published image** via
`COORDD_IMAGE` (`docker run` against a GHCR tag — no Go toolchain, for local runs). `e2e/helpers/gentx.ts`
builds a real `SIGN_MODE_DIRECT` gentx (a byte-port of `gentxvalidate/signdoc.go`) so the join flow
exercises coordd's real validation.

## App-shell auth gate (nothing loads for unauthenticated users)

`Layout` renders **only** a full-page auth wall until `AuthProvider` reports an authenticated, initialized
session — the page component never mounts and no data hooks fire. This is a deliberate no-leak choice: an
unauthenticated visitor (or scraper) can't observe launch data even in the background, and the wall's copy
is generic ("you need to be signed in to view this section"), never confirming whether a given resource
exists.

## Addresses are HRP-independent

coordd identities are the account bytes, not a prefixed bech32 string: a coordinator authenticates as
`cosmos1…` while a launch renders committee/lead/validator addresses in the chain's own prefix. So the UI
**compares** by account bytes (`utils/address.ts` `sameAccount`, never `===`) and **displays** canonical
account hex (e.g. the global coordinator allowlist) re-encoded under the viewer's own prefix
(`accountToBech32`) — never raw hex, and never a false "not you".

## Non-JSON I/O

Most calls are JSON via the generated hooks, but a few stay raw: genesis download is `authedFetch<Blob>`
(raw bytes), and host-mode genesis/allocation uploads are binary — the generated JSON client isn't used for
those.

## Allocation files: attestor-only upload (UI ⇄ backend gap)

`AllocationFilesSection` (in `CommitteePanel`) lists the launch's allocation files and lets a committee
member register new ones. coordd's `POST /launch/{id}/allocations/{type}` accepts **two** modes, switched by
`Content-Type`:

- **attestor** (`application/json`: `{url, sha256}`) — register an external URL + hash;
- **host** (`application/octet-stream`: raw file bytes, gated by `COORD_GENESIS_HOST_MODE`).

**The UI deliberately surfaces attestor mode only**, matching the genesis-upload UI (also attestor-only).
Host-mode raw uploads remain a backend/CLI capability with no web affordance — this is a **known, intentional
gap**, not an oversight. To add host mode later: post the raw bytes via `authedFetch` with
`Content-Type: application/octet-stream` (the generated JSON fetcher can't carry binary), gated on a
host-mode-enabled signal.

Downloads use `authedFetch` (the endpoint returns raw bytes in host mode or a `302` to the external URL in
attestor mode; the generated `Blob` fetcher can't serve it because the shared mutator force-parses
`res.json()`). Attestor-mode downloads follow the `302` cross-origin, so they are **best-effort** — the
remote host's CORS policy may block the fetch. Host-mode downloads stream cleanly.
