# End-to-end tests (Playwright)

These specs drive the **real** stack: `setup/global-setup.ts` starts an actual `coordd` binary,
`next dev` proxies to it, and the tests exercise real flows with test keypairs + a wallet stub. See
`playwright.config.ts` for how the backend + dev server are wired.

## What the `K.X.X` test IDs mean

Tests are grouped under a stable `K.<group>.<n>` identifier so a spec and a specific behaviour can be
referred to unambiguously. **`K` is simply this repo's label for the "web end-to-end" area** (each part
of the wider system has its own letter); the letter itself carries no meaning beyond that — what
matters is the group/number map below. Every test here belongs to it, numbered `K.<group>.<n>`:

|  Group | Area                                                     | Spec file                                  |
|-------:|----------------------------------------------------------|--------------------------------------------|
|  `K.1` | Auth flows (sign-in / sign-out / revoke / the auth wall) | `auth.spec.ts`                             |
|  `K.2` | Launch list                                              | `0-launch-list.spec.ts`                    |
|  `K.3` | Create launch                                            | `create-launch.spec.ts`                    |
|  `K.4` | Committee + validator panels (single-actor)              | `coordinator.spec.ts`, `validator.spec.ts` |
|  `K.5` | Full multi-actor flow (create → open → join → approve)   | `validator.spec.ts`                        |
|  `K.6` | Audit log                                                | `audit.spec.ts`                            |
|  `K.7` | Admin panel (coordinator allowlist, session revocation)  | `admin.spec.ts`                            |
|  `K.8` | Allocation files                                         | `allocations.spec.ts`                      |
|  `K.9` | Members allowlist (per-launch)                           | `members.spec.ts`                          |
| `K.10` | Grouped-by-submitter join view                           | `grouped-join.spec.ts`                     |
| `K.11` | Proposal deep-link detail page                           | `proposal-detail.spec.ts`                  |

Conventions:

- The final number is just the test's order within its group (`K.7.3` = third admin test).
- A `val` suffix marks a validator-actor variant of a shared group (e.g. `K.4.1val`).
- New areas continue the sequence — add the next free `K.<n>` group and a row above.

## Running

The e2e needs a running `coordd`; `global-setup.ts` starts one for you. Two ways:

**A — Container (recommended; no Go toolchain or sibling checkout needed).** Set `COORDD_IMAGE` to a
published image and coordd runs via `docker run` (ephemeral container, migrate → serve, torn down after):

```bash
COORDD_IMAGE=ghcr.io/ny4rl4th0t3p/seedward-chaincoord:1.0.0-rc1 npm run playwright
```

**B — Local binary (for coordd development).** Point `COORDD_BIN` at a `coordd` binary — build the
sibling repo (`cd ../seedward-chaincoord && make build-server`) or download a release:

```bash
COORDD_BIN=/path/to/coordd npm run playwright
npm run playwright -- allocations members   # subset by file stem
```

CI (`.github/workflows/e2e.yml`) uses the pinned `coordd` release binary, so it tests the exact version
users run. (If neither var is set, setup falls back to a `coordd` binary in the sibling repo's `bin/`.)