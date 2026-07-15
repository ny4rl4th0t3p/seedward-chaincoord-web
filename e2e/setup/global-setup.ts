import { spawn, spawnSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { initKeypairs, coordinator } from '../fixtures/keypairs';

export const COORDD_PORT = 8181;
export const DB_PATH = join(tmpdir(), 'playwright-coordd.db');
export const AUDIT_LOG_PATH = join(tmpdir(), 'playwright-audit.jsonl');
export const PID_FILE = join(tmpdir(), 'playwright-coordd.pid');

// Deterministic test Ed25519 seeds (base64-encoded 32 bytes). Never use in production.
const JWT_KEY_B64 = Buffer.alloc(32, 0x03).toString('base64');
const AUDIT_KEY_B64 = Buffer.alloc(32, 0x04).toString('base64');

// The web is now its own repo, so the coordd binary lives in the sibling seedward-chaincoord repo.
// Default to ../seedward-chaincoord/bin/coordd (build it there first: `make build`); override with
// the COORDD_BIN env var for other layouts (e.g. a container-built binary).
// __dirname = seedward-chaincoord-web/e2e/setup → up 3 = the suite root, then seedward-chaincoord/bin.
const COORDD_BIN =
  process.env.COORDD_BIN ?? join(__dirname, '../../../seedward-chaincoord/bin/coordd');

// Optional container mode: set COORDD_IMAGE to a published image (e.g. a GHCR tag) to run coordd via
// `docker run` instead of a local binary — no Go toolchain or sibling checkout needed.
const COORDD_IMAGE = process.env.COORDD_IMAGE;
export const CONTAINER_NAME = 'seedward-coordd-e2e';

const GENESIS_PATH = join(tmpdir(), 'playwright-coordd-genesis');

export function coorddEnv(coordinatorAddr: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    COORD_LISTEN_ADDR: `:${COORDD_PORT}`,
    COORD_DB_PATH: DB_PATH,
    COORD_AUDIT_LOG_PATH: AUDIT_LOG_PATH,
    COORD_FILES_PATH: GENESIS_PATH,
    COORD_JWT_PRIVATE_KEY: JWT_KEY_B64,
    COORD_AUDIT_PRIVATE_KEY: AUDIT_KEY_B64,
    COORD_ADMIN_ADDRESSES: coordinatorAddr,
    COORD_INSECURE_NO_TLS: 'true',
    COORD_INSECURE_NO_RATE_LIMIT: 'true',
    COORD_INSECURE_NO_SSRF_CHECK: 'true',
    COORD_CORS_ORIGINS: 'http://localhost:3000',
    // launch_policy defaults to "restricted" (the realistic/production value); the seeded coordinator
    // allowlist (below) is what lets the test coordinator create launches.
    COORD_LOG_LEVEL: 'warn',
  };
}

export default async function globalSetup(): Promise<void> {
  await initKeypairs();
  const coordAddr = coordinator().address('cosmos');

  if (COORDD_IMAGE) {
    startCoorddContainer(coordAddr);
  } else {
    await startCoorddBinary(coordAddr);
  }

  await waitForServer(COORDD_PORT);
  // Seed the coordinator allowlist so the test coordinator can create launches.
  await seedCoordinatorAllowlist(coordAddr);
}

// ── Local-binary mode (default) ──────────────────────────────────────────────────
async function startCoorddBinary(coordAddr: string): Promise<void> {
  // Kill any stale coordd from a previous interrupted run that didn't reach globalTeardown.
  if (existsSync(PID_FILE)) {
    const stalePid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
    try { process.kill(stalePid, 'SIGTERM'); } catch { /* already gone */ }
    unlinkSync(PID_FILE);
    await new Promise(r => setTimeout(r, 800));
  }
  // Remove stale data so the new run starts clean.
  for (const f of [DB_PATH, AUDIT_LOG_PATH]) {
    try { if (existsSync(f)) unlinkSync(f); } catch { /* ignore */ }
  }
  try { if (existsSync(GENESIS_PATH)) rmSync(GENESIS_PATH, { recursive: true }); } catch { /* ignore */ }

  const env = coorddEnv(coordAddr);

  // Run migrations (synchronous — must complete before serve starts).
  const migrate = spawnSync(COORDD_BIN, ['migrate'], { env, stdio: 'inherit' });
  if (migrate.status !== 0) throw new Error('coordd migrate failed');

  // Start the server.
  const proc = spawn(COORDD_BIN, ['serve'], { env, stdio: 'pipe', detached: false });
  let startupError = '';
  proc.stderr?.on('data', (d: Buffer) => { startupError += d.toString(); });
  proc.on('error', (err) => { throw new Error(`coordd failed to start: ${err.message}`); });
  if (proc.pid) writeFileSync(PID_FILE, String(proc.pid));

  // Give coordd a moment to bind the port before polling readiness.
  await new Promise(r => setTimeout(r, 300));
  if (proc.exitCode !== null) {
    throw new Error(
      `coordd exited early (code ${proc.exitCode}) — port ${COORDD_PORT} may still be in use.\n${startupError}`,
    );
  }
}

// ── Container mode (COORDD_IMAGE) ────────────────────────────────────────────────
// Runs coordd from a published image (e.g. a GHCR release tag) with `docker run` — no local build.
// The container is ephemeral (fresh DB each run); one `sh -c` chains migrate → serve since the image
// has no combined entrypoint. globalTeardown removes it.
function startCoorddContainer(coordAddr: string): void {
  // Remove any stale container from an interrupted run.
  spawnSync('docker', ['rm', '-f', CONTAINER_NAME], { stdio: 'ignore' });

  const env: Record<string, string> = {
    COORD_LISTEN_ADDR: `:${COORDD_PORT}`,
    COORD_DB_PATH: '/tmp/coordd.db',
    COORD_AUDIT_LOG_PATH: '/tmp/coordd-audit.jsonl',
    COORD_FILES_PATH: '/tmp/coordd-files',
    COORD_JWT_PRIVATE_KEY: JWT_KEY_B64,
    COORD_AUDIT_PRIVATE_KEY: AUDIT_KEY_B64,
    COORD_ADMIN_ADDRESSES: coordAddr,
    COORD_INSECURE_NO_TLS: 'true',
    COORD_INSECURE_NO_RATE_LIMIT: 'true',
    COORD_INSECURE_NO_SSRF_CHECK: 'true',
    COORD_CORS_ORIGINS: 'http://localhost:3000',
    // launch_policy defaults to "restricted" (the realistic/production value); the seeded coordinator
    // allowlist (below) is what lets the test coordinator create launches.
    COORD_LOG_LEVEL: 'warn',
  };
  const envFlags = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);

  const run = spawnSync('docker', [
    'run', '-d', '--name', CONTAINER_NAME,
    '-p', `${COORDD_PORT}:${COORDD_PORT}`,
    // Put the sqlite DB on a RAM tmpfs — the overlay filesystem is slow enough for sqlite that
    // requests lag and the browser aborts them ("context canceled" 500s), flaking timing tests.
    '--tmpfs', '/tmp:rw,size=256m',
    ...envFlags,
    '--entrypoint', 'sh',
    COORDD_IMAGE!,
    '-c', 'coordd migrate && coordd serve',
  ], { encoding: 'utf8' });
  if (run.status !== 0) {
    throw new Error(`docker run (${COORDD_IMAGE}) failed:\n${run.stderr || run.stdout}`);
  }
}

async function waitForServer(port: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/healthz`);
      if (res.ok) return;
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`coordd did not start on :${port} within ${timeoutMs}ms`);
}

async function seedCoordinatorAllowlist(coordAddr: string): Promise<void> {
  const base = `http://localhost:${COORDD_PORT}`;

  // 1. Get challenge.
  const challengeRes = await fetch(`${base}/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator_address: coordAddr }),
  });
  if (!challengeRes.ok) {
    const body = await challengeRes.text().catch(() => '(unreadable)');
    throw new Error(`globalSetup: auth challenge failed (${challengeRes.status}): ${body}`);
  }
  const { challenge } = await challengeRes.json() as { challenge: string };

  // 2. Sign — same canonical JSON as buildAuthPayload (utils/auth.ts): the nonce is part of the
  //    signed bytes (replay protection) and must equal the nonce sent to /auth/verify.
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const nonce = randomUUID();
  const payload = JSON.stringify({ challenge, nonce, operator_address: coordAddr, timestamp });
  const stdSig = await coordinator().signArbitrary('cosmoshub-4', coordAddr, payload);

  // 3. Verify and receive JWT.
  const verifyRes = await fetch(`${base}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operator_address: coordAddr,
      pubkey_b64: stdSig.pub_key.value,
      challenge,
      nonce,
      timestamp,
      signature: stdSig.signature,
    }),
  });
  if (!verifyRes.ok) {
    const body = await verifyRes.text().catch(() => '(unreadable)');
    throw new Error(`globalSetup: auth verify failed (${verifyRes.status}): ${body}`);
  }
  const { token } = await verifyRes.json() as { token: string };

  // 4. Add coordinator address to the coordinator allowlist.
  const addRes = await fetch(`${base}/admin/coordinators`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ address: coordAddr }),
  });
  if (!addRes.ok) {
    const body = await addRes.text().catch(() => '(unreadable)');
    throw new Error(`globalSetup: seeding coordinator allowlist failed (${addRes.status}): ${body}`);
  }
}
