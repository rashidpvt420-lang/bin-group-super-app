// N-33: robots.txt and sitemap.xml must be real static files (they were served as the SPA HTML
// shell with HTTP 200), list only public routes that exist, keep portals out of the index, and
// the Admin panel must never be indexed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const app = readFileSync('src/App.tsx', 'utf8');
const robots = readFileSync('public/robots.txt', 'utf8');
const sitemap = readFileSync('public/sitemap.xml', 'utf8');
const adminRobots = readFileSync('apps/admin-panel/public/robots.txt', 'utf8');
const firebase = JSON.parse(readFileSync('firebase.json', 'utf8'));

const routeElement = new Map([...app.matchAll(/<Route path="([^"]+)" element=\{([^\n]+)\n/g)].map((m) => [m[1], m[2]]));
const disallows = [...robots.matchAll(/^Disallow: (\S+)$/gm)].map((m) => m[1]);

// Minimal Googlebot-style matcher: prefix match, "$" anchors the end, longest rule wins, Allow wins ties.
function robotsAllows(path) {
  const rules = [...robots.matchAll(/^(Allow|Disallow): (\S+)$/gm)].map((m) => ({ allow: m[1] === 'Allow', pattern: m[2] }));
  let best = { allow: true, length: -1 };
  for (const rule of rules) {
    const anchored = rule.pattern.endsWith('$');
    const prefix = anchored ? rule.pattern.slice(0, -1) : rule.pattern;
    const matches = anchored ? path === prefix : path.startsWith(prefix);
    if (!matches) continue;
    if (prefix.length > best.length || (prefix.length === best.length && rule.allow)) best = { allow: rule.allow, length: prefix.length };
  }
  return best.allow;
}

test('the app and admin hosting targets serve static public files ahead of the SPA rewrite', () => {
  const targets = Object.fromEntries(firebase.hosting.map((entry) => [entry.target, entry]));
  assert.equal(targets.app.public, 'dist');
  assert.equal(targets.admin.public, 'apps/admin-panel/build');
  assert.ok(existsSync('public/robots.txt') && existsSync('public/sitemap.xml'));
  assert.ok(existsSync('apps/admin-panel/public/robots.txt'));
});

test('sitemap is a urlset of public, existing, non-protected routes on the canonical host', () => {
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length >= 10);
  assert.equal(new Set(locs).size, locs.length, 'no duplicate URLs');
  for (const loc of locs) {
    const url = new URL(loc);
    assert.equal(url.origin, 'https://bin-groups.com');
    const path = url.pathname;
    if (path.endsWith('.html')) {
      assert.ok(existsSync(`public${path}`), `${path} must exist in public/`);
    } else {
      const element = routeElement.get(path);
      assert.ok(element, `${path} must be a declared route`);
      assert.doesNotMatch(element, /protected[A-Za-z]*Route|<Navigate|LegalRedirect/, `${path} must be a public, non-redirect page`);
    }
    assert.ok(robotsAllows(path), `${path} is in the sitemap but blocked by robots.txt`);
  }
});

test('robots.txt keeps every protected portal route out of the index but not public look-alikes', () => {
  assert.match(robots, /^Sitemap: https:\/\/bin-groups\.com\/sitemap\.xml$/m);
  for (const [path, element] of routeElement) {
    if (!/protected[A-Za-z]*Route/.test(element)) continue;
    const sample = path.replace(/\/\*$/, '/dashboard').replace(/:[A-Za-z]+/g, 'x');
    assert.equal(robotsAllows(sample), false, `protected route ${path} (${sample}) must be disallowed`);
    if (path.endsWith('/*')) assert.equal(robotsAllows(path.slice(0, -2)), false, `${path} root must be disallowed`);
  }
  for (const publicPath of ['/owners', '/tenants', '/technicians', '/brokers', '/trust', '/']) {
    assert.equal(robotsAllows(publicPath), true, `${publicPath} must stay indexable`);
  }
  for (const privatePath of ['/verify/invoice/abc', '/tenant-invite', '/onboarding/start', '/login']) {
    assert.equal(robotsAllows(privatePath), false, `${privatePath} must be disallowed`);
  }
  assert.ok(disallows.length > 10);
});

test('the Admin panel disallows all crawling', () => {
  assert.match(adminRobots, /^User-agent: \*$/m);
  assert.match(adminRobots, /^Disallow: \/$/m);
});
