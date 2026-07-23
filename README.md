# seedward-chaincoord-web

Part of
**Seedward** — [docs](https://ny4rl4th0t3p.github.io/seedward-suite) · [ADRs](https://ny4rl4th0t3p.github.io/seedward-suite/decisions/) · [demo](https://ny4rl4th0t3p.github.io/seedward-suite/demo/)

The web control panel for **[seedward-chaincoord](https://github.com/ny4rl4th0t3p/seedward-chaincoord)** (`coordd`) —
the self-hosted coordination server for Cosmos SDK chain genesis launches.

Coordinators and validators sign in with a browser wallet (Keplr / Leap) and drive the full launch lifecycle — committee
governance and M-of-N proposals, validator join requests, allocation-file review, genesis publication, and readiness —
entirely over coordd's HTTP API. It is a **chaincoord front**: it talks only to coordd, which aggregates the rest of the
suite (rehearsal results, audit log) behind that one API.

> **Beta (v0.3.x).** Functional — it drives the full launch lifecycle against coordd v1.0.0 — but a
> deliberately minimal UI that will keep evolving; not yet externally audited. Verify on your own setup
> before high-value use.

## Stack

- **Next.js 13** (pages router) + **TypeScript**
- **@tanstack/react-query** for data fetching
- **interchain-kit** wallet connectors (Keplr / Leap / MetaMask)
- **zustand** for local state
- **jest** (+ Testing Library) and **playwright** for tests

## Getting started

```bash
yarn install
yarn dev            # http://localhost:3000
```

Point the app at a running `coordd` by setting the API base URL (see `config/`). To bring up a local coordd, follow
the [seedward-chaincoord quickstart](https://github.com/ny4rl4th0t3p/seedward-chaincoord).

## API client

The typed API client is **generated from coordd's OpenAPI contract**, not hand-maintained. A **vendored copy** of
coordd's spec is committed at `openapi/swagger.yaml`, and `yarn gen:api` regenerates the client (orval) from it — so the
client can't silently drift, and **`gen:api` needs no coordd checkout** (it builds from the committed spec).

Refreshing the vendored spec (a maintainer step, when the API changes) is `yarn sync:spec`, which copies coordd's
`docs/mkdocs/api/swagger.yaml`. It defaults to a sibling `../seedward-chaincoord` checkout; point it anywhere with
`COORDD_SPEC=/path/to/swagger.yaml yarn sync:spec`. CI regenerates the client and **fails if it drifts** from the
committed spec.

## Scripts

| Script                      | Purpose                                                         |
|-----------------------------|-----------------------------------------------------------------|
| `yarn dev`                  | Run the dev server (live reload)                                |
| `yarn build` / `yarn start` | Production build / serve                                        |
| `yarn lint`                 | ESLint (next lint)                                              |
| `yarn test`                 | Unit tests (jest)                                               |
| `yarn playwright`           | End-to-end tests (playwright)                                   |
| `yarn gen:api`              | Regenerate the API client from the vendored spec                |
| `yarn sync:spec`            | Refresh the vendored OpenAPI spec from coordd (maintainer step) |
| `yarn sync:wasm`            | Vendor the pinned gentxvalidate WASM validator (`public/wasm/`) |
| `yarn check:wasm-version`   | Verify the vendored WASM pin matches coordd's seedward-libs     |

## Authentication

Coordinators and validators authenticate by signing a server challenge with their wallet's `signArbitrary`
(Cosmos SDK ADR-036) — no keys leave the browser. The server returns a short-lived JWT held in
`sessionStorage`.

## Client-side gentx validation

The gentx form runs an **advisory** validation in the browser before submit, using the `gentxvalidate` WASM build
(vendored under `public/wasm/` by `yarn sync:wasm`, lazy-loaded). It shows the same per-invariant breakdown the server
returns, so a validator sees structural / param problems as they paste. It never blocks submit — the server re-validates
authoritatively.

## Testing

- `yarn test` — jest unit tests.
- `yarn playwright` — end-to-end tests against a **real coordd**: Playwright's global setup runs one either from a
  sibling binary (`COORDD_BIN`, default `../seedward-chaincoord/bin/coordd`) or, with `COORDD_IMAGE`
  set, from a published GHCR image via `docker run` (no Go toolchain —
  `COORDD_IMAGE=ghcr.io/ny4rl4th0t3p/seedward-chaincoord:v1.0.0`).

## Design decisions

Repo-internal decisions (the orval/mutator contract, the WASM lazy-loader, the CI drift gates, the e2e coordd coupling)
are in [`docs/decisions.md`](docs/decisions.md); cross-cutting ones are in the suite ADR log.

## Possible next additions

- **Pagination UI** for the join queue and proposal list (currently `per_page=100`, no pager).