import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(repoRoot, 'apps/admin-panel/src/components/UnifiedLogin.tsx');
let source = readFileSync(file, 'utf8');
let changed = false;

function replaceString(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    console.warn(`[admin-login-patch] pattern not found: ${label}`);
    return;
  }
  source = source.replace(before, after);
  changed = true;
  console.log(`[admin-login-patch] patched: ${label}`);
}

function replaceRegex(pattern, after, label) {
  if (source.includes(after)) return;
  if (!pattern.test(source)) {
    console.warn(`[admin-login-patch] pattern not found: ${label}`);
    return;
  }
  source = source.replace(pattern, after);
  changed = true;
  console.log(`[admin-login-patch] patched: ${label}`);
}

replaceString(
  `import { \n    GoogleAuthProvider,\n    sendPasswordResetEmail\n} from 'firebase/auth';`,
  `import { \n    GoogleAuthProvider,\n    sendPasswordResetEmail,\n    signInWithRedirect,\n    setPersistence,\n    browserLocalPersistence\n} from 'firebase/auth';`,
  'firebase redirect SSO imports'
);

replaceRegex(
  /const handleGoogleLogin = async \(\) => \{[\s\S]*?\n    \};\n\n    const handleEmailLogin/,
  `const handleGoogleLogin = async () => {
        setLocalLoading(true);
        setLocalError(null);
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
            console.log("🔍 [DIAG] Starting Admin Google redirect SSO...");
            await setPersistence(auth, browserLocalPersistence);
            await signInWithRedirect(auth, provider);
        } catch (err: any) {
            setLocalError(getFriendlyAuthError(err));
            setLocalLoading(false);
        }
    };

    const handleEmailLogin`,
  'mobile redirect Google SSO'
);

replaceRegex(
  /<h2 className="text-xl font-black text-white mb-2">[\s\S]*?<\/h2>/,
  `<h2 className="text-xl font-black text-white mb-2">ADMIN PORTAL</h2>`,
  'admin portal title'
);

replaceRegex(
  /<p className="text-sm text-\[#64748b\] leading-relaxed">[\s\S]*?<\/p>/,
  `<p className="text-sm text-[#64748b] leading-relaxed">
                            Authorized CEO and admin access only.
                        </p>`,
  'admin portal subtitle'
);

replaceRegex(
  /<span className="uppercase tracking-widest text-sm">[\s\S]*?<\/span>/,
  `<span className="uppercase tracking-widest text-sm">SIGN IN WITH GOOGLE</span>`,
  'google button label'
);

if (!source.includes('ADMIN PORTAL') || source.includes('PARTNER PORTAL')) {
  console.error('[admin-login-patch] ADMIN PORTAL enforcement failed.');
  process.exit(1);
}

if (!source.includes('signInWithRedirect')) {
  console.error('[admin-login-patch] redirect SSO enforcement failed.');
  process.exit(1);
}

if (changed) {
  writeFileSync(file, source);
  console.log('[admin-login-patch] admin login patched successfully.');
} else {
  console.log('[admin-login-patch] admin login already patched.');
}
