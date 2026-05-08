import admin from 'firebase-admin';
import chalk from 'chalk';
import crypto from 'crypto';

if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: 'bin-group-57c60'
    });
}

const db = admin.firestore();

async function runPilot() {
    console.log(chalk.blue('🏠 Starting Stage 2 Production Pilot: Tenant Onboarding Flow...'));

    const batchId = `pilot_${Date.now()}`;
    const propertyId = `prop_pilot_${Date.now()}`;
    const propertyName = "PILOT TEST TOWER";

    try {
        const batch = db.batch();

        // 1. Create Property
        const propRef = db.collection('properties').doc(propertyId);
        batch.set(propRef, {
            name: propertyName,
            address: "Pilot District, BIN GROUP",
            status: 'active',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const testTenants = [
            { id: 't1', name: 'Pilot Tenant Alpha', email: 'rashidpvt420+alpha@gmail.com', unit: 'P-101' },
            { id: 't2', name: 'Pilot Tenant Beta', email: 'rashidpvt420+beta@gmail.com', unit: 'P-102' },
            { id: 't3', name: 'Pilot Tenant Gamma', email: 'rashidpvt420+gamma@gmail.com', unit: 'P-103' }
        ];

        const invitationIds = [];

        // 2. Create Units, Invitations, Leases, Ledgers
        for (const t of testTenants) {
            const unitId = `${propertyId}_${t.unit}`;
            const unitRef = db.collection('units').doc(unitId);
            batch.set(unitRef, {
                propertyId,
                unitNumber: t.unit,
                occupancyStatus: 'VACANT',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const inviteId = `invite_${batchId}_${t.id}`;
            invitationIds.push(inviteId);
            const inviteRef = db.collection('tenant_invitations').doc(inviteId);
            batch.set(inviteRef, {
                importBatchId: batchId,
                propertyId,
                propertyName,
                unitId,
                unitNumber: t.unit,
                tenantName: t.name,
                tenantEmail: t.email,
                status: 'pending',
                emailStatus: 'none',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Lease & Ledger Stubs
            const leaseRef = db.collection('leases').doc(`lease_${inviteId}`);
            batch.set(leaseRef, {
                propertyId,
                unitId,
                tenantName: t.name,
                tenantEmail: t.email,
                status: 'pending_onboarding',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        // 3. Create Import Summary
        const summaryRef = db.collection('tenant_import_batches').doc(batchId);
        batch.set(summaryRef, {
            importBatchId: batchId,
            propertyName,
            propertyId,
            totalRows: 3,
            validRows: 3,
            errorRows: 0,
            status: 'completed',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        console.log(chalk.green(`✅ Pilot records created (Batch: ${batchId})`));

        // 4. Trigger Invitation Dispatch
        // In a real scenario, this is called via httpsCallable from Admin Panel.
        // Here we simulate the logic by writing to /mail as the Cloud Function would.
        // Actually, let's call the function if possible, but for a local script, 
        // we'll just verify the manual trigger logic.
        
        console.log(chalk.yellow('📧 Dispatching invitations via system logic...'));
        
        // This simulates the 'sendTenantInvitations' function logic
        const mailBatch = db.batch();
        for (const inviteId of invitationIds) {
            const inviteRef = db.collection('tenant_invitations').doc(inviteId);
            const snap = await inviteRef.get();
            const invite = snap.data();
            
            const rawToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

            const inviteLink = "https://bin-groups.com/tenant-invite?token=" + rawToken;
            console.log(chalk.magenta(`🔗 Invitation Link for ${invite.tenantEmail}: ${inviteLink}`));

            mailBatch.update(inviteRef, {
                inviteTokenHash: tokenHash,
                status: 'sent',
                emailStatus: 'queued',
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
            });

            mailBatch.set(db.collection('mail').doc(), {
                to: invite.tenantEmail,
                message: {
                    subject: "You are invited to BIN GROUP Pilot Portal",
                    html: `<p>Hello ${invite.tenantName}, welcome to the pilot.</p>`
                },
                metadata: {
                    type: "tenant_invitation",
                    invitationId: inviteId,
                    batchId: batchId
                }
            });
        }

        await mailBatch.commit();
        console.log(chalk.green('🚀 Pilot invitations dispatched to /mail queue.'));
        console.log(chalk.cyan('Dashboard status should now show 3 Sent / 0 Failed.'));
        
        console.log(chalk.blue('\n🏁 PILOT INITIALIZATION COMPLETE.'));
        console.log(chalk.white(`Please check /mail collection for 3 new documents for: ${testTenants.map(t => t.email).join(', ')}`));

    } catch (err) {
        console.error(chalk.red('💥 Pilot Error:'), err);
    }
}

runPilot();
