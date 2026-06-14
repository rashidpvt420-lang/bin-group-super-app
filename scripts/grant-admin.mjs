import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

/**
 * GRANT / REPAIR ADMIN ACCOUNT SCRIPT
 *
 * Usage:
 *   node scripts/grant-admin.mjs <email> [password]
 *
 * Notes:
 * - If the Auth user does not exist, the script creates it.
 * - If a password is provided, the script sets/repairs password sign-in for the account.
 * - It always sets Firebase custom claims and the Firestore users/{uid} admin profile.
 */

const targetEmail = (process.argv[2] || '').toLowerCase().trim();
const passwordArg = process.argv[3] || process.env.BIN_ADMIN_PASSWORD || '';
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'bin-group-57c60';

if (!targetEmail) {
    console.error(chalk.red('❌ Missing email. Usage: node scripts/grant-admin.mjs <email> [password]'));
    process.exit(1);
}

if (passwordArg && passwordArg.length < 6) {
    console.error(chalk.red('❌ Password must be at least 6 characters.'));
    process.exit(1);
}

const serviceAccountCandidates = [
    path.resolve('service-account.json'),
    path.resolve('serviceAccountKey.json'),
];

function initializeAdmin() {
    const localKey = serviceAccountCandidates.find((candidate) => fs.existsSync(candidate));

    if (localKey) {
        const serviceAccount = JSON.parse(fs.readFileSync(localKey, 'utf8'));
        initializeApp({
            credential: cert(serviceAccount),
            projectId,
        });
        console.log(chalk.green(`✅ [IAM] Authenticated with ${path.basename(localKey)}`));
        return;
    }

    initializeApp({
        credential: applicationDefault(),
        projectId,
    });
    console.log(chalk.green('✅ [IAM] Authenticated with Application Default Credentials'));
}

initializeAdmin();

const db = getFirestore();
const auth = getAuth();

async function getOrCreateUser(email) {
    try {
        const existing = await auth.getUserByEmail(email);
        console.log(chalk.green(`✅ [AUTH] Existing user found: ${existing.uid}`));
        return { user: existing, created: false };
    } catch (err) {
        if (err?.code !== 'auth/user-not-found') throw err;

        if (!passwordArg) {
            throw new Error(`Auth user does not exist for ${email}. Re-run with a password: node scripts/grant-admin.mjs ${email} <password>`);
        }

        const created = await auth.createUser({
            email,
            password: passwordArg,
            emailVerified: true,
            disabled: false,
            displayName: 'BIN GROUP Admin',
        });
        console.log(chalk.green(`✅ [AUTH] Created user: ${created.uid}`));
        return { user: created, created: true };
    }
}

async function grantAdmin(email) {
    try {
        console.log(chalk.blue(`\n🔍 [AUTH] Repairing admin access for: ${email}`));
        const { user, created } = await getOrCreateUser(email);
        const uid = user.uid;

        if (passwordArg && !created) {
            console.log(chalk.blue('🔐 [AUTH] Setting/repairing password provider...'));
            await auth.updateUser(uid, {
                password: passwordArg,
                emailVerified: true,
                disabled: false,
            });
        }

        console.log(chalk.blue('🛡️ [AUTH] Setting custom claims: { admin: true, role: admin }'));
        await auth.setCustomUserClaims(uid, {
            admin: true,
            role: 'admin',
        });

        console.log(chalk.blue(`📄 [DB] Upserting Firestore profile users/${uid}...`));
        await db.collection('users').doc(uid).set({
            uid,
            email,
            displayName: user.displayName || 'BIN GROUP Admin',
            role: 'admin',
            isAdmin: true,
            adminApproved: true,
            status: 'active',
            legalAcceptedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        console.log(chalk.blue('📝 [AUDIT] Logging repair action...'));
        await db.collection('audit_logs').add({
            actorId: 'SYSTEM_ADMIN_REPAIR_SCRIPT',
            actorRole: 'system',
            action: created ? 'CREATE_AND_GRANT_ADMIN' : 'REPAIR_AND_GRANT_ADMIN',
            targetType: 'user',
            targetId: uid,
            targetEmail: email,
            reason: 'Admin login repair',
            createdAt: FieldValue.serverTimestamp(),
        });

        const verified = await auth.getUser(uid);
        const profile = await db.collection('users').doc(uid).get();

        console.log(chalk.green('\n✅ [SUCCESS] Admin access repaired.'));
        console.log(`   EMAIL: ${verified.email}`);
        console.log(`   UID: ${verified.uid}`);
        console.log(`   CUSTOM_CLAIMS: ${JSON.stringify(verified.customClaims || {})}`);
        console.log(`   FIRESTORE_ROLE: ${profile.data()?.role}`);
        console.log(`   FIRESTORE_STATUS: ${profile.data()?.status}`);
        console.log(chalk.yellow('\n💡 Log out, hard refresh the app, then sign in again so the browser receives the new token.'));
        process.exit(0);
    } catch (err) {
        console.error(chalk.red('\n❌ [ERROR] Failed to repair admin access:'));
        console.error(err);
        process.exit(1);
    }
}

grantAdmin(targetEmail);
