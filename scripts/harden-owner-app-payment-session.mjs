import { readFileSync, writeFileSync } from 'node:fs';

const path = 'apps/owner-app/src/components/onboarding/PaymentSubmissionStep.tsx';
let source = readFileSync(path, 'utf8');

function mustReplace(label, before, after) {
  if (!source.includes(before)) {
    throw new Error(`Owner app hardening failed: missing pattern for ${label}`);
  }
  source = source.replace(before, after);
}

if (!source.includes('onAuthStateChanged')) {
  mustReplace(
    'firebase import observer',
    `import {
    auth,
    functions,
    getDownloadURL,
    httpsCallable,
    ref,
    storage,
    uploadBytes
} from '../../lib/firebase';`,
    `import {
    auth,
    functions,
    getDownloadURL,
    httpsCallable,
    onAuthStateChanged,
    ref,
    storage,
    uploadBytes
} from '../../lib/firebase';`
  );
}

if (!source.includes('waitForCurrentUser')) {
  mustReplace(
    'insert wait helper',
    `import { buildPersistableGeoAnchor } from '../../utils/geoAnchor';

const PaymentSubmissionStep`,
    `import { buildPersistableGeoAnchor } from '../../utils/geoAnchor';

const waitForCurrentUser = (timeoutMs = 8000): Promise<any | null> => {
    return new Promise((resolve) => {
        if (auth.currentUser) {
            resolve(auth.currentUser);
            return;
        }

        let resolved = false;
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (resolved) return;
            resolved = true;
            unsubscribe();
            resolve(user);
        });

        window.setTimeout(() => {
            if (resolved) return;
            resolved = true;
            unsubscribe();
            resolve(auth.currentUser);
        }, timeoutMs);
    });
};

const PaymentSubmissionStep`
  );
}

mustReplace(
  'current user direct read',
  `        const currentUser = auth.currentUser;
        if (!currentUser) {
            setError(t('onboarding.error.session_expired') || 'Your session expired. Please sign in again.');
            return;
        }

        setSubmitting(true);`,
  `        const currentUser = await waitForCurrentUser();
        if (!currentUser) {
            setError(t('onboarding.error.session_expired') || 'Your secure session is not active. Use Gateway Login, then return to finish payment submission.');
            return;
        }

        if (currentUser.uid !== ownerAccount.uid) {
            setError(t('onboarding.error.session_mismatch') || 'The active account does not match this owner onboarding session.');
            return;
        }

        if (!paymentMethod) {
            setError(t('onboarding.payment_method_required') || 'Select a payment method before submission.');
            return;
        }

        setSubmitting(true);`
);

if (!source.includes('await currentUser.getIdToken(true);')) {
  mustReplace(
    'force token refresh before callable',
    '        try {\n            const submissionId = `${currentUser.uid}_${onboardingSessionId}`;',
    '        try {\n            await currentUser.getIdToken(true);\n            const submissionId = `${currentUser.uid}_${onboardingSessionId}`;'
  );
}

source = source.replace(
  `{error && <Alert severity="error">{error}</Alert>}`,
  `{error && (
                                <Alert
                                    severity="error"
                                    action={
                                        error.includes('session') || error.includes('Gateway') ? (
                                            <Button color="inherit" size="small" onClick={() => navigate('/login')}>Gateway Login</Button>
                                        ) : null
                                    }
                                >
                                    {error}
                                </Alert>
                            )}`
);

writeFileSync(path, source);
console.log('Owner app payment session handling hardened.');
