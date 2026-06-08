import { spawn } from 'node:child_process';

const port = Number(process.env.REACT130_PORT || 4173);
const host = '127.0.0.1';
const baseUrl = `http://${host}:${port}`;
const routes = [
  '/admin/dashboard',
  '/login?intendedRole=admin',
];

const isWindows = process.platform === 'win32';
const npx = isWindows ? 'npx.cmd' : 'npx';
const node = isWindows ? 'node.exe' : 'node';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPreview(timeoutMs = 45000) {
  const started = Date.now();
  let lastError = '';

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(baseUrl, { redirect: 'manual' });
      if (response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error?.message || String(error);
    }
    await wait(750);
  }

  throw new Error(`Vite preview did not become ready at ${baseUrl}. Last error: ${lastError}`);
}

function runProbe(url) {
  return new Promise((resolve, reject) => {
    const child = spawn(node, ['scripts/react130-probe.mjs', url], {
      stdio: 'inherit',
      shell: false,
      env: process.env,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`React 130 probe failed for ${url} with exit code ${code}`));
    });
  });
}

console.log(`[REACT130] Starting Vite preview on ${baseUrl}...`);
const preview = spawn(npx, ['vite', 'preview', '--host', host, '--port', String(port), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
  env: process.env,
});

preview.stdout.on('data', (data) => process.stdout.write(`[preview] ${data}`));
preview.stderr.on('data', (data) => process.stderr.write(`[preview] ${data}`));

let previewExited = false;
preview.on('exit', (code) => {
  previewExited = true;
  if (code !== 0) console.error(`[REACT130] Preview exited early with code ${code}`);
});

try {
  await waitForPreview();

  if (previewExited) {
    throw new Error('Vite preview exited before probes could run.');
  }

  for (const route of routes) {
    const url = `${baseUrl}${route}`;
    console.log(`\n[REACT130] Probing ${url}`);
    await runProbe(url);
  }

  console.log('\nREACT_130_SMOKE_PASS');
} finally {
  if (!preview.killed) {
    preview.kill('SIGTERM');
    await wait(500);
    if (!preview.killed) preview.kill('SIGKILL');
  }
}
