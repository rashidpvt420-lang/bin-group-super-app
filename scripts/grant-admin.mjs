import admin from 'firebase-admin';
import chalk from 'chalk';

/**
 * GRANT ADMIN SCRIPT (STAGE 9 EMERGENCY)
 * Usage: node scripts/grant-admin.mjs <email>
 */

const email = process.argv[2];

if (!email) {
    console.error(chalk.red("❌ Missing email. Usage: node scripts/grant-admin.mjs <email>"));
    process.exit(1);
}

// Initialize Admin SDK
// Assumes GOOGLE_APPLICATION_CREDENTIALS points to a valid service account key
// or the user is logged into firebase-tools
admin.initializeApp({
    projectId: 'bin-group-57c60'
});

const db = admin.firestore();
const auth = admin.auth();

async function grantAdmin(targetEmail) {
    try {
        console.log(chalk.blue(`🔍 [AUTH] Searching for user: ${targetEmail}...`));
        const user = await auth.getUserByEmail(targetEmail);
        const uid = user.uid;

        console.log(chalk.blue(`🛡️ [AUTH] Found UID: ${uid}. Setting custom claims...`));
        await auth.setCustomUserClaims(uid, {
            admin: true,
            role: 'admin'
        });

        console.log(chalk.blue(`📄 [DB] Updating Firestore profile users/${uid}...`));
        await db.collection('users').doc(uid).set({
            role: 'admin',
            isAdmin: true,
            adminApproved: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        console.log(chalk.blue(`📝 [AUDIT] Logging action...`));
        await db.collection('audit_logs').add({
            actorId: 'SYSTEM_EMERGENCY_SCRIPT',
            actorRole: 'system',
            action: 'GRANT_ADMIN_EMERGENCY',
            targetType: 'user',
            targetId: uid,
            reason: 'Production Access Fix (Phase 2)',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(chalk.green(`\n✅ [SUCCESS] Admin access granted for ${targetEmail}.`));
        console.log(chalk.yellow(`💡 User should log out and log back in to refresh tokens.`));
        process.exit(0);
    } catch (err) {
        console.error(chalk.red(`\n❌ [ERROR] Failed to grant admin access:`));
        console.error(err);
        process.exit(1);
    }
}

grantAdmin(email.toLowerCase().trim());
