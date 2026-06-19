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
            console.log('🔍 [DIAG] Starting Admin Google redirect SSO...');
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
  /<h1 className="text-4xl font-black text-white tracking-tighter mb-2[^"]*">[\s\S]*?<\/h1>/,
  `<h1 className="text-4xl font-black text-white tracking-tighter mb-2">
                        BIN GROUP
                    </h1>`,
  'clean admin brand title'
);

replaceRegex(
  /<p className="text-\[#94a3b8\] font-bold tracking-\[0\.2em\] text-\[10px\] uppercase">[\s\S]*?<\/p>/,
  `<p className="text-[#94a3b8] font-bold tracking-[0.2em] text-[10px] uppercase">
                        Admin Control Panel
                    </p>`,
  'clean admin brand subtitle'
);

replaceRegex(
  /<h2 className="text-xl font-black text-white mb-2">[\s\S]*?<\/h2>/,
  `<h2 className="text-xl font-black text-white mb-2">Admin Login</h2>`,
  'admin login title'
);

replaceRegex(
  /<p className="text-sm text-\[#64748b\] leading-relaxed">[\s\S]*?<\/p>/,
  `<p className="text-sm text-[#64748b] leading-relaxed">
                            Authorized BIN GROUP admin access only.
                        </p>`,
  'admin login subtitle'
);

replaceRegex(
  /<span className="text-\[10px\] text-white font-bold uppercase tracking-widest">[\s\S]*?<\/span>/,
  `<span className="text-[10px] text-white font-bold uppercase tracking-widest">Or</span>`,
  'clean SSO separator'
);

replaceRegex(
  /<span className="uppercase tracking-widest text-sm">[\s\S]*?<\/span>/,
  `<span className="uppercase tracking-widest text-sm">Sign in with Google</span>`,
  'google button label'
);

replaceRegex(
  /<span className="text-\[9px\] text-\[#94a3b8\] font-black uppercase tracking-widest">[\s\S]*?<\/span>/,
  `<span className="text-[9px] text-[#94a3b8] font-black uppercase tracking-widest">
                            Protected admin access
                        </span>`,
  'protected access badge'
);

replaceRegex(
  /BIN-Groups CORE v[\s\S]*?ADMIN-SSO/,
  `BIN GROUP ADMIN PANEL`,
  'footer admin branding'
);

const forbidden = [
  'BIN-ADMINISTRY',
  'Sovereign Command & Control Center',
  'Authorized CEO and admin access only',
  'Or SSO',
  'ISO 27001 CERTIFIED & SOVEREIGN SECURED',
  'BIN-Groups CORE'
];

for (const token of forbidden) {
  if (source.includes(token)) {
    console.error(`[admin-login-patch] forbidden legacy login copy remains: ${token}`);
    process.exit(1);
  }
}

if (!source.includes('BIN GROUP') || !source.includes('Admin Login') || !source.includes('signInWithRedirect')) {
  console.error('[admin-login-patch] clean admin login enforcement failed.');
  process.exit(1);
}

if (changed) {
  writeFileSync(file, source);
  console.log('[admin-login-patch] clean admin login patched successfully.');
} else {
  console.log('[admin-login-patch] clean admin login already patched.');
}
