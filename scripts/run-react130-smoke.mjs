import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';

const requestedPort = Number(process.env.REACT130_PORT || 4173);
const listenHost = process.env.REACT130_LISTEN_HOST || '0.0.0.0';
const probeHost = process.env.REACT130_PROBE_HOST || '127.0.0.1';
const routes = [
  '/admin/dashboard',
  '/login?intendedRole=admin',
];

const isWindows = process.platform === 'win32';
const npx = isWindows ? 'npx.cmd' : 'npx';
const node = isWindows ? 'node.exe' : 'node';
let shuttingDown = false;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, probeHost);
  });
}

async function choosePort(startPort) {
  for (let port = startPort; port < startPort + 30; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available preview port found from ${startPort} to ${startPort + 29}`);
}

function ping(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on('timeout', () => {
      req.destroy(new Error('HTTP readiness timeout'));
    });
    req.on('error', reject);
  });
}

async function waitForPreview(baseUrl, timeoutMs = 90000) {
  const started = Date.now();
  let lastError = '';

  while (Date.now() - started < timeoutMs) {
    try {
      const status = await ping(baseUrl);
      if (status > 0 && status < 500) return;
      lastError = `HTTP ${status}`;
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

const port = await choosePort(requestedPort);
const baseUrl = `http://${probeHost}:${port}`;

if (port !== requestedPort) {
  console.warn(`[REACT130] Requested port ${requestedPort} is busy. Using ${port}.`);
}

console.log(`[REACT130] Starting Vite preview on ${baseUrl}...`);
const preview = spawn(npx, ['vite', 'preview', '--host', listenHost, '--port', String(port), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
  env: {
    ...process.env,
    BROWSER: 'none',
  },
});

preview.stdout.on('data', (data) => process.stdout.write(`[preview] ${data}`));
preview.stderr.on('data', (data) => process.stderr.write(`[preview] ${data}`));

let previewExited = false;
let previewExitCode = null;
let previewExitSignal = null;
preview.on('exit', (code, signal) => {
  previewExited = true;
  previewExitCode = code;
  previewExitSignal = signal;
  if (!shuttingDown && code !== 0) {
    console.error(`[REACT130] Preview exited early with code ${code} signal ${signal || 'none'}`);
  }
});

try {
  await waitForPreview(baseUrl);

  if (previewExited) {
    throw new Error(`Vite preview exited before probes could run. code=${previewExitCode} signal=${previewExitSignal || 'none'}`);
  }

  for (const route of routes) {
    const url = `${baseUrl}${route}`;
    console.log(`\n[REACT130] Probing ${url}`);
    await runProbe(url);
  }

  console.log('\nREACT_130_SMOKE_PASS');
} finally {
  shuttingDown = true;
  if (!preview.killed) {
    preview.kill('SIGTERM');
    await wait(500);
  }
}
