import { build } from 'esbuild';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';

const releaseSha = '075b2ce1ffff8a276d808f1df04211f0a0fb80a4';
const proofReference = `https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/38169030441 | bundle:live-launch-evidence-${releaseSha}@sha256:${'b'.repeat(64)} | businessOwner:launch_package/artifacts/business-owner-${releaseSha}.json@sha256:${'c'.repeat(64)}`;
let bundle: Promise<string> | undefined;

function layoutBundle() {
  // Mount the real Admin component with local synthetic records only. There is
  // no Firebase SDK, credential handling, or production evidence mutation.
  return bundle ??= build({
    absWorkingDir: path.resolve('apps/admin-panel'),
    stdin: {
      resolveDir: path.resolve('apps/admin-panel'),
      loader: 'tsx',
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
        import { CacheProvider } from '@emotion/react';
        import createCache from '@emotion/cache';
        import { prefixer } from 'stylis';
        import rtlPlugin from 'stylis-plugin-rtl';
        import { adminTheme } from './src/theme/adminTheme';
        import LaunchPage from './src/pages/admin/PublicLaunchCommandCenterPageV2';
        const direction = document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
        const cache = createCache({ key: direction === 'rtl' ? 'muirtl-admin' : 'muiltr-admin', stylisPlugins: direction === 'rtl' ? [prefixer, rtlPlugin] : [prefixer] });
        createRoot(document.getElementById('root')).render(
          <CacheProvider value={cache}>
            <ThemeProvider theme={createTheme(adminTheme, { direction })}>
              <CssBaseline /><LaunchPage />
            </ThemeProvider>
          </CacheProvider>
        );`,
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.REACT_APP_RELEASE_COMMIT_SHA': JSON.stringify(releaseSha),
    },
    alias: {
      '@bin/shared': path.resolve('packages/shared/src/config/providerLaunchTruth.ts'),
    },
    plugins: [{
      name: 'isolated-admin-layout-records',
      setup(plugin) {
        plugin.onResolve({ filter: /(?:context\/AuthContext|lib\/firebase)$/ }, (args) => ({ path: args.path, namespace: 'local-layout' }));
        plugin.onLoad({ filter: /.*/, namespace: 'local-layout' }, (args) => ({
          loader: 'js',
          contents: args.path.endsWith('AuthContext')
            ? `export const useAuth = () => ({ user: { uid: 'local-layout', role: 'super_admin', displayName: 'Layout test' }, retryAuthorization: async () => {} });`
            : `
              export const db = {};
              export const collection = (_, name) => name;
              export const query = (name) => name;
              export const limit = () => null;
              export const orderBy = () => null;
              export const serverTimestamp = () => null;
              export const addDoc = () => { throw new Error('Layout tests must never save evidence'); };
              export const onSnapshot = (name, receive) => {
                const proofRef = ${JSON.stringify(proofReference)};
                const records = name === 'launch_evidence'
                  ? ['ownerOnboardingFullPath', 'ownerPaymentApproveReject', 'technicianGpsAndDeniedFallback'].map(gateId => ({
                      gateId, status: 'passed', evidenceLayer: 'hosted', source: 'github-actions', executionGenerated: true,
                      verifiedBy: 'github-actions', releaseSha: '${releaseSha}', commitSha: '${releaseSha}', proofRef,
                    }))
                  : ['owner', 'tenant', 'technician', 'broker', 'admin'].map(role => ({
                      role, status: 'passed', evidenceLayer: 'hosted', source: 'github-actions', executionGenerated: true,
                      verifiedBy: 'github-actions', releaseSha: '${releaseSha}', commitSha: '${releaseSha}', proofRef,
                    }));
                receive({ docs: records.map((record, index) => ({ id: String(index), data: () => record })) });
                return () => {};
              };`,
        }));
      },
    }],
  }).then(result => result.outputFiles[0].text);
}

export async function auditAdminLaunchEvidenceLayout(page: Page) {
  const javascript = await layoutBundle();
  for (const direction of ['ltr', 'rtl']) {
    for (const width of [390, 768, 1105, 1535]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.setContent(`<html dir="${direction}"><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><div id="root"></div></body></html>`);
      await page.addScriptTag({ content: javascript });
      await expect(page.getByRole('heading', { name: 'Required launch evidence' })).toBeVisible();
      await expect(page.getByText(proofReference, { exact: true }).first()).toBeVisible();
      expect(await page.evaluate(() => window.innerWidth), `${direction}: test the requested CSS viewport width`).toBe(width);

      const overflow = await page.evaluate(() => {
        const checks = [document.documentElement, ...document.querySelectorAll('.MuiPaper-root, .MuiTypography-caption, .MuiAlert-message')];
        return checks.filter(element => element.scrollWidth > element.clientWidth + 2)
          .map(element => element.textContent?.slice(0, 100));
      });
      expect(overflow, `${direction} ${width}px: evidence must remain inside its cards and form`).toEqual([]);

      const collisions = await page.evaluate(() => {
        const heading = [...document.querySelectorAll('h5')].find(element => element.textContent === 'Required launch evidence');
        const panel = heading?.closest('.MuiPaper-root');
        const cards = [...(panel?.querySelectorAll('.MuiGrid-item > .MuiBox-root') || [])];
        return cards.flatMap(card => {
          const title = card.querySelector('.MuiTypography-root')?.getBoundingClientRect();
          if (!title) return ['Missing card title'];
          return [...card.querySelectorAll('.MuiChip-root')].filter(chip => {
            const bounds = chip.getBoundingClientRect();
            return bounds.left < title.right && bounds.right > title.left && bounds.top < title.bottom && bounds.bottom > title.top;
          }).map(chip => chip.textContent);
        });
      });
      expect(collisions, `${direction} ${width}px: status chips must not overlap gate titles`).toEqual([]);
      await expect(page.getByRole('button', { name: 'Save exact-SHA evidence', exact: true })).toBeVisible();
    }
  }
}
