import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env.e2e');
if (existsSync(envPath)) loadDotenv({ path: envPath });

const mainBase = (process.env.E2E_BASE_URL || '').replace(/\/$/, '');
const adminBase = (process.env.E2E_ADMIN_BASE_URL || '').replace(/\/$/, '');
if (!mainBase || !adminBase) { console.error('Missing E2E_BASE_URL or E2E_ADMIN_BASE_URL'); process.exit(1); }

const mainRoutes = ['/', '/login', '/owner', '/tenant', '/technician', '/broker', '/verify', '/verify-cert'];
const adminRoutes = ['/', '/login', '/dashboard', '/brokers', '/production-control', '/broker', '/control-center'];
const fatalText = /404|page not found|application error|unhandled runtime error|chunkloaderror|bad gateway|service unavailable/i;

async function checkRoute(base, route) {
  const url = `${base}${route}`;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const text = await res.text();
    const bodyLen = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
    return { base: base.includes('admin') ? 'admin' : 'main', route, status: res.status, pass: res.status < 500 && bodyLen > 20 && !fatalText.test(text.slice(0, 4000)) };
  } catch (err) {
    return { base: base.includes('admin') ? 'admin' : 'main', route, status: 0, pass: false, error: err.message };
  }
}

const results = [];
for (const route of mainRoutes) results.push(await checkRoute(mainBase, route));
for (const route of adminRoutes) results.push(await checkRoute(adminBase, route));
const label = mainBase.includes('--staging-') ? 'Staging' : 'Production';
console.log(`\n=== Gate 11 ${label} Route Check ===\n`);
for (const r of results) console.log(`[${r.pass ? 'PASS' : 'FAIL'}] ${r.base} ${r.route} -> HTTP ${r.status}${r.error ? ` (${r.error})` : ''}`);
const failed = results.filter((r) => !r.pass);
console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
