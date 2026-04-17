const admin = require('firebase-admin');
const fs = require('fs');
const csv = require('csv-parser');

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.GCLOUD_PROJECT = 'bin-v2-dev';

try {
    admin.initializeApp({
        projectId: 'bin-v2-dev'
    });
} catch (e) {
    // Already initialized
}
const db = admin.firestore();

async function runBulkImport() {
    const rows = [];
    if (!fs.existsSync('data.csv')) {
        console.log('Generating dummy data.csv...');
        const header = 'Building_Name,Zone,Unit_No,Tenant_Mobile\n';
        let data = header;
        for (let i = 1; i <= 250; i++) {
            data += `Tower ${i},Marina,10${i},+97150000${i}\n`;
            data += `Tower ${i},Downtown,20${i},+97150111${i}\n`;
        }
        fs.writeFileSync('data.csv', data);
    }

    fs.createReadStream('data.csv').pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('end', async () => {
            let batch = db.batch();
            let count = 0;
            for (const row of rows) {
                const propRef = db.collection('properties').doc();
                batch.set(propRef, {
                    name: row.Building_Name,
                    zone: row.Zone,
                    status: 'locked'
                });
                const unitRef = propRef.collection('units').doc();
                batch.set(unitRef, {
                    unitNumber: row.Unit_No,
                    tenantPhone: row.Tenant_Mobile,
                    status: 'green'
                });
                count += 2;
                if (count >= 480) {
                    await batch.commit();
                    batch = db.batch();
                    count = 0;
                    console.log('Batch committed...');
                }
            }
            await batch.commit();
            console.log('500 Properties Uploaded Successfully.');
        });
}
runBulkImport();
