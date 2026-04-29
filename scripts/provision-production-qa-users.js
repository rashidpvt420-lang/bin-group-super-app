const admin = require('firebase-admin');

const projectId = process.env.FIREBASE_PROJECT_ID || 'bin-group-57c60';
const action = process.env.QA_ACCOUNT_ACTION || 'create';

const qaAccounts = [
  {
    key: 'ADMIN',
    email: 'qa_admin@bin-groups.com',
    role: 'admin',
    claims: { admin: true, role: 'admin', testAccount: true }
  },
  {
    key: 'OWNER',
    email: 'qa_owner@bin-groups.com',
    role: 'owner',
    claims: { role: 'owner', testAccount: true }
  },
  {
    key: 'TENANT',
    email: 'qa_tenant@bin-groups.com',
    role: 'tenant',
    claims: { role: 'tenant', testAccount: true }
  },
  {
    key: 'TECHNICIAN',
    email: 'qa_technician@bin-groups.com',
    role: 'technician',
    claims: { role: 'technician', testAccount: true }
  },
  {
    key: 'BROKER',
    email: 'qa_broker@bin-groups.com',
    role: 'broker',
    claims: { role: 'broker', testAccount: true }
  }
];

if (!['create', 'disable', 'delete'].includes(action)) {
  throw new Error('QA_ACCOUNT_ACTION must be create, disable, or delete.');
}

admin.initializeApp({ projectId });
const db = admin.firestore();

const passwordFor = (key) => {
  const password = process.env[`QA_${key}_PASSWORD`];
  if (!password || password.length < 16) {
    throw new Error(`QA_${key}_PASSWORD must be set and at least 16 characters.`);
  }
  return password;
};

const getExistingUser = async (email) => {
  try {
    return await admin.auth().getUserByEmail(email);
  } catch (err) {
    if (err.code === 'auth/user-not-found') return null;
    throw err;
  }
};

const upsertQaUser = async (account) => {
  const existing = await getExistingUser(account.email);
  const authUser = existing
    ? await admin.auth().updateUser(existing.uid, {
        password: passwordFor(account.key),
        disabled: false,
        emailVerified: true
      })
    : await admin.auth().createUser({
        email: account.email,
        password: passwordFor(account.key),
        emailVerified: true,
        disabled: false
      });

  await admin.auth().setCustomUserClaims(authUser.uid, account.claims);

  await db.collection('users').doc(authUser.uid).set({
    uid: authUser.uid,
    email: account.email,
    role: account.role,
    status: 'active',
    testAccount: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  await db.collection('auditLogs').add({
    actorId: 'local-admin-script',
    actorRole: 'system',
    targetType: 'user',
    targetId: authUser.uid,
    action: existing ? 'qa_user_updated' : 'qa_user_created',
    after: { email: account.email, role: account.role, testAccount: true },
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { email: account.email, uid: authUser.uid, action: existing ? 'updated' : 'created' };
};

const disableQaUser = async (account) => {
  const existing = await getExistingUser(account.email);
  if (!existing) return { email: account.email, uid: null, action: 'missing' };

  await admin.auth().updateUser(existing.uid, { disabled: true });
  await db.collection('users').doc(existing.uid).set({
    status: 'disabled',
    testAccount: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  await db.collection('auditLogs').add({
    actorId: 'local-admin-script',
    actorRole: 'system',
    targetType: 'user',
    targetId: existing.uid,
    action: 'qa_user_disabled',
    after: { email: account.email, testAccount: true },
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { email: account.email, uid: existing.uid, action: 'disabled' };
};

const deleteQaUser = async (account) => {
  const existing = await getExistingUser(account.email);
  if (!existing) return { email: account.email, uid: null, action: 'missing' };

  await admin.auth().deleteUser(existing.uid);
  await db.collection('users').doc(existing.uid).set({
    status: 'deleted',
    testAccount: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  await db.collection('auditLogs').add({
    actorId: 'local-admin-script',
    actorRole: 'system',
    targetType: 'user',
    targetId: existing.uid,
    action: 'qa_user_deleted',
    after: { email: account.email, testAccount: true },
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { email: account.email, uid: existing.uid, action: 'deleted' };
};

const run = async () => {
  const results = [];
  for (const account of qaAccounts) {
    if (action === 'create') results.push(await upsertQaUser(account));
    if (action === 'disable') results.push(await disableQaUser(account));
    if (action === 'delete') results.push(await deleteQaUser(account));
  }
  console.table(results);
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[QA_ACCOUNT_PROVISION_FAILED]', err.message);
    process.exit(1);
  });
