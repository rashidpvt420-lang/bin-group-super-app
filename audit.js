const admin = require('firebase-admin');
if (!admin.apps.length) { admin.initializeApp(); }
const db = admin.firestore();
db.collection('maintenanceTickets').get().then(snap => {
    let orphans = [];
    let badStatus = [];
    let counts = { missingProp: 0, missingUnit: 0, unassociated: 0, badStatus: 0, assignedToMe: 0 };
    const approved = ['OPEN', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];
    const currentTechUid = 'tech-test-uid'; // I need to find the correct tech UID if possible, but let's just log all for now.
    
    snap.forEach(doc => {
        const t = doc.data();
        let isOrphan = false;
        
        if (!t.propertyId) counts.missingProp++;
        if (!t.unitId) counts.missingUnit++;
        if (t.propertyId === 'UNASSOCIATED') counts.unassociated++;
        
        if (!t.propertyId || t.propertyId === 'UNASSOCIATED' || !t.unitId) {
            isOrphan = true;
            orphans.push(doc.id);
        }
        
        if (!approved.includes(t.status)) {
            counts.badStatus++;
            badStatus.push({id: doc.id, status: t.status});
        }
    });
    
    console.log('---LIVE_AUDIT_START---');
    console.log('TOTAL:' + snap.size);
    console.log('COUNTS:', JSON.stringify(counts));
    console.log('ORPHAN_COUNT:' + orphans.length);
    console.log('ORPHAN_IDS:' + orphans.join(','));
    console.log('BAD_STATUS_COUNT:' + badStatus.length);
    badStatus.forEach(b => console.log('BAD_STATUS_ID:' + b.id + '|' + b.status));
    console.log('---LIVE_AUDIT_END---');
    process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
