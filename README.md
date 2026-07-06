# seedward-chaincoord-web

The web control panel for **[seedward-chaincoord](https://github.com/ny4rl4th0t3p/seedward-chaincoord)** (`coordd`) —
the self-hosted coordination server for Cosmos SDK chain genesis launches.

Coordinators and validators sign in with a browser wallet (Keplr / Leap) and drive the full launch lifecycle —
committee governance and M-of-N proposals, validator join requests, allocation-file review, genesis publication, and
readiness — entirely over coordd's HTTP API. It is a **chaincoord front**: it talks only to coordd, which aggregates
the rest of the suite (rehearsal results, audit log) behind that one API.

> **Proof of concept — not for production use.** Research-grade software; APIs and behaviours may change without notice.

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

Point the app at a running `coordd` by setting the API base URL (see `.env.example` / `config/`). To bring up a local
coordd, follow the [seedward-chaincoord quickstart](https://github.com/ny4rl4th0t3p/seedward-chaincoord).

## API client

The typed API client is **generated from coordd's OpenAPI contract**, not hand-maintained. A **vendored copy** of
coordd's spec is committed at `openapi/swagger.yaml`, and `yarn gen:api` regenerates the client (orval) from it — so
the client can't silently drift, and **`gen:api` needs no coordd checkout** (it builds from the committed spec).

Refreshing the vendored spec (a maintainer step, when the API changes) is `yarn sync:spec`, which copies coordd's
`docs/mkdocs/api/swagger.yaml`. It defaults to a sibling `../seedward-chaincoord` checkout; point it anywhere with
`COORDD_SPEC=/path/to/swagger.yaml yarn sync:spec`. _(Codegen pipeline landing as part of the web-extraction milestone.)_

## Scripts

| Script | Purpose |
|--------|---------|
| `yarn dev` | Run the dev server (live reload) |
| `yarn build` / `yarn start` | Production build / serve |
| `yarn lint` | ESLint (next lint) |
| `yarn test` | Unit tests (jest) |
| `yarn playwright` | End-to-end tests (playwright) |
| `yarn gen:api` | Regenerate the API client from the vendored spec |