import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

export const tempAuditTrigger = onRequest({ cors: true }, async (req, res) => {
    const tickets = await db.collection("maintenanceTickets").get();
    
    const orphans = [];
    const badStatus = [];
    const approved = ['OPEN', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];
    
    let counts = {
        missingProp: 0,
        missingUnit: 0,
        unassociated: 0,
        badStatus: 0,
        techMatch: 0
    };

    tickets.forEach(doc => {
        const t = doc.data();
        let isOrphan = false;
        if (!t.propertyId) counts.missingProp++;
        if (!t.unitId) counts.missingUnit++;
        if (t.propertyId === 'UNASSOCIATED') counts.unassociated++;
        
        if (!t.propertyId || t.propertyId === 'UNASSOCIATED' || !t.unitId) {
            orphans.push(doc.id);
        }

        if (!approved.includes(t.status)) {
            counts.badStatus++;
            badStatus.push({id: doc.id, status: t.status});
        }
    });

    res.status(200).send({
        status: "SUCCESS",
        total: tickets.size,
        counts,
        orphans,
        badStatus
    });
});
