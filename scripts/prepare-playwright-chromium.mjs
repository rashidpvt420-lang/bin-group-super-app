#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = process.cwd();
const marker = path.join(root, 'node_modules', '.cache', 'bin-group-playwright-chromium-ready');
const cli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
const BROWSER_INSTALL_TIMEOUT_MS = 120_000;
const DEPENDENCY_FALLBACK_TIMEOUT_MS = 180_000;
const PROBE_TIMEOUT_MS = 20_000;

function fail(message) {
  console.error(`[playwright-prepare] ${message}`);
  process.exit(1);
}

function runCli(args, timeout, label) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    timeout,
    killSignal: 'SIGTERM',
  });
  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      console.error(`[playwright-prepare] ${label} timed out after ${timeout}ms.`);
    } else {
      console.error(`[playwright-prepare] ${label} failed before completion: ${result.error.message}`);
    }
    return false;
  }
  if ((result.status ?? 1) !== 0) {
    console.error(`[playwright-prepare] ${label} exited with status ${result.status ?? 'unknown'}.`);
    return false;
  }
  return true;
}

async function probeChromium() {
  let timer;
  try {
    const probe = (async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.setContent('<title>BIN GROUP Playwright probe</title>');
        if ((await page.title()) !== 'BIN GROUP Playwright probe') {
          throw new Error('unexpected browser probe result');
        }
      } finally {
        await browser.close();
      }
    })();
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Chromium probe timed out after ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS);
    });
    await Promise.race([probe, timeout]);
    return true;
  } catch (error) {
    console.error(`[playwright-prepare] Chromium probe failed: ${error?.message || error}`);
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function main() {
  if (existsSync(marker) && await probeChromium()) {
    console.log('[playwright-prepare] Chromium already prepared for this job.');
    return;
  }

  console.log('[playwright-prepare] Installing Chromium browser only with a bounded timeout.');
  if (!runCli(['install', 'chromium'], BROWSER_INSTALL_TIMEOUT_MS, 'Chromium browser install')) {
    fail('Browser-only Chromium install failed; refusing to enter unbounded dependency installation.');
  }

  if (!await probeChromium()) {
    console.log('[playwright-prepare] Browser probe requires host libraries; running one bounded dependency fallback.');
    if (!runCli(['install-deps', 'chromium'], DEPENDENCY_FALLBACK_TIMEOUT_MS, 'Chromium system dependency fallback')) {
      fail('Bounded Chromium dependency fallback failed.');
    }
    if (!await probeChromium()) {
      fail('Chromium still cannot launch after bounded dependency fallback.');
    }
  }

  mkdirSync(path.dirname(marker), { recursive: true });
  writeFileSync(marker, `${new Date().toISOString()}\n`, 'utf8');
  console.log('[playwright-prepare] Chromium preparation complete and reusable for all evidence suites.');
}

main().catch((error) => fail(error?.stack || error?.message || String(error)));
