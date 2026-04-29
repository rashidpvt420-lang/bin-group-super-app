
const admin = require('firebase-admin');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

/**
 * BIN-GROUPS QA Account Provisioning Script
 * 
 * Requirements:
 * - Support GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_PATH
 * - Fail and exit on any error
 * - Detailed reporting
 */

async function initializeFirebase() {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "bin-group-57c60";
    const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    
    let credential;

    if (saPath && fs.existsSync(saPath)) {
        console.log(`📡 Initializing with Service Account JSON: ${saPath}`);
        credential = admin.credential.cert(require(path.resolve(saPath)));
    } else {
        console.log(`📡 Using Application Default Credentials (ADC) for Project: ${projectId}`);
        credential = admin.credential.applicationDefault();
    }

    admin.initializeApp({
        credential,
        projectId
    });
}

const qaUsers = [
    {
        email: 'qa_admin@bin-groups.com',
        password: process.env.QA_ADMIN_PASSWORD,
        role: 'admin',
        claims: { admin: true, role: 'admin', testAccount: true }
    },
    {
        email: 'qa_owner@bin-groups.com',
        password: process.env.QA_OWNER_PASSWORD,
        role: 'owner',
        claims: { role: 'owner', testAccount: true }
    },
    {
        email: 'qa_tenant@bin-groups.com',
        password: process.env.QA_TENANT_PASSWORD,
        role: 'tenant',
        claims: { role: 'tenant', testAccount: true }
    },
    {
        email: 'qa_technician@bin-groups.com',
        password: process.env.QA_TECHNICIAN_PASSWORD,
        role: 'technician',
        claims: { role: 'technician', testAccount: true }
    },
    {
        email: 'qa_broker@bin-groups.com',
        password: process.env.QA_BROKER_PASSWORD,
        role: 'broker',
        claims: { role: 'broker', testAccount: true }
    }
];

async function createQAAccounts() {
    console.log('🚀 Starting BIN-GROUPS QA Account Provisioning...');

    // 1. PREFLIGHT VALIDATION: Check all passwords before starting any work
    console.log('🔍 Running preflight validation...');
    for (const user of qaUsers) {
        if (!user.password || user.password.length < 12) {
            console.error(`❌ PREFLIGHT FAILED: Missing or weak password for ${user.email}.`);
            console.error(`Please set QA_${user.role.toUpperCase()}_PASSWORD environment variable with at least 12 characters.`);
            process.exit(1);
        }
    }
    console.log('✅ Preflight validation successful. All passwords present.\n');

    await initializeFirebase();

    const auth = getAuth();
    const db = getFirestore();
    const results = [];

    for (const user of qaUsers) {
        try {
            console.log(`Processing: ${user.email}...`);
            let userRecord;
            let operation = 'CREATE';

            try {
                // Check if user exists
                userRecord = await auth.getUserByEmail(user.email);
                operation = 'UPDATE';
                
                // RESET existing user: password, emailVerified, and enabled status
                userRecord = await auth.updateUser(userRecord.uid, {
                    password: user.password,
                    emailVerified: true,
                    disabled: false,
                    displayName: `QA ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}`
                });
            } catch (error) {
                if (error.code === 'auth/user-not-found') {
                    // Create new user
                    userRecord = await auth.createUser({
                        email: user.email,
                        password: user.password,
                        emailVerified: true,
                        displayName: `QA ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}`
                    });
                } else {
                    throw error;
                }
            }

            // Set Custom Claims (Always overwrite to ensure consistency)
            await auth.setCustomUserClaims(userRecord.uid, user.claims);

            // Create/Update Firestore Profile
            const userProfile = {
                uid: userRecord.uid,
                email: user.email,
                role: user.role,
                displayName: userRecord.displayName,
                status: 'active',
                testAccount: true,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            
            const docRef = db.collection('users').doc(userRecord.uid);
            const docSnap = await docRef.get();
            if (!docSnap.exists) {
                userProfile.createdAt = admin.firestore.FieldValue.serverTimestamp();
            }

            await docRef.set(userProfile, { merge: true });

            results.push({
                email: user.email,
                uid: userRecord.uid,
                claims: user.claims,
                path: `users/${userRecord.uid}`,
                status: 'SUCCESS',
                operation
            });

        } catch (error) {
            console.error(`\n❌ CRITICAL FAILURE during processing of ${user.email}:`);
            console.error(`Reason: ${error.message}`);
            
            if (error.message.includes('Could not load the default credentials') || error.message.includes('ADC')) {
                console.log('\n🔍 --- ADC DIAGNOSTIC REPORT ---');
                console.log(`Project ID: ${process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'NOT SET'}`);
                
                const adcPath = path.join(process.env.APPDATA || '', 'gcloud', 'application_default_credentials.json');
                console.log(`ADC File Path: ${adcPath}`);
                console.log(`ADC File Exists: ${fs.existsSync(adcPath)}`);
                
                console.log('\nFIX STEPS:');
                console.log('1. Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install');
                console.log('2. Run: gcloud auth application-default login');
                console.log('3. Run: gcloud config set project bin-group-57c60');
                console.log('--------------------------------\n');
            }
            process.exit(1);
        }
    }

    // FINAL SUMMARY REPORT
    console.log('\n================================================');
    console.log('💎 BIN-GROUPS QA PROVISIONING COMPLETE');
    console.log('================================================');
    results.forEach(res => {
        console.log(`\nEmail:  ${res.email}`);
        console.log(`UID:    ${res.uid}`);
        console.log(`Claims: ${JSON.stringify(res.claims)}`);
        console.log(`Store:  ${res.path}`);
        console.log(`Status: ${res.status} (${res.operation})`);
    });
    console.log('\n================================================');
    console.log('✅ ALL 5 ACCOUNTS PROVEN READY FOR PRODUCTION QA.');
}

createQAAccounts().catch((err) => {
    console.error('\n💥 FATAL ERROR during execution:', err.message);
    process.exit(1);
});
