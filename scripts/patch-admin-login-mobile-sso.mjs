import { readFileSync, writeFileSync } from 'node:fs';

const file = 'apps/admin-panel/src/components/UnifiedLogin.tsx';
let source = readFileSync(file, 'utf8');
let changed = false;

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    console.warn(`[admin-login-patch] pattern not found: ${label}`);
    return;
  }
  source = source.replace(before, after);
  changed = true;
  console.log(`[admin-login-patch] patched: ${label}`);
}

replaceOnce(
  `import { \n    GoogleAuthProvider,\n    sendPasswordResetEmail\n} from 'firebase/auth';`,
  `import { \n    GoogleAuthProvider,\n    sendPasswordResetEmail,\n    signInWithRedirect,\n    setPersistence,\n    browserLocalPersistence\n} from 'firebase/auth';`,
  'firebase redirect SSO imports'
);

const oldGoogleLogin = `    const handleGoogleLogin = async () => {
        setLocalLoading(true);
        setLocalError(null);
        const provider = new GoogleAuthProvider();
        try {
            console.log("🔍 [DIAG] Starting Admin SSO Handshake...");
            const result = await signInWithPopup(auth, provider);
            if (result.user) {
                console.log("🛡️ [AUTH] Admin SSO successful for:", result.user.email);
            }
        } catch (err: any) {
            setLocalError(getFriendlyAuthError(err));
            setLocalLoading(false);
        }
    };`;

const newGoogleLogin = `    const handleGoogleLogin = async () => {
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
    };`;

replaceOnce(oldGoogleLogin, newGoogleLogin, 'mobile redirect Google SSO');

replaceOnce(
  `<h2 className="text-xl font-black text-white mb-2">{t('login.portal')}</h2>`,
  `<h2 className="text-xl font-black text-white mb-2">ADMIN PORTAL</h2>`,
  'admin portal title'
);

replaceOnce(
  `<p className="text-sm text-[#64748b] leading-relaxed">
                            {t('login.authorized_only')}
                        </p>`,
  `<p className="text-sm text-[#64748b] leading-relaxed">
                            Authorized CEO and admin access only.
                        </p>`,
  'admin portal subtitle'
);

replaceOnce(
  `<span className="uppercase tracking-widest text-sm">{t('login.google')}</span>`,
  `<span className="uppercase tracking-widest text-sm">SIGN IN WITH GOOGLE</span>`,
  'google button label'
);

if (changed) {
  writeFileSync(file, source);
  console.log('[admin-login-patch] admin login patched successfully.');
} else {
  console.log('[admin-login-patch] admin login already patched.');
}
