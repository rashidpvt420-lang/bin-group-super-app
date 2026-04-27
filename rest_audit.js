const fs = require('fs');
const https = require('https');
const path = require('path');
const os = require('os');

const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const token = config.tokens.access_token;

function fetchAllDocuments(nextPageToken = '', allDocs = []) {
  let pathStr = '/v1/projects/bin-group-57c60/databases/(default)/documents/maintenanceTickets?pageSize=300';
  if (nextPageToken) {
    pathStr += '&pageToken=' + encodeURIComponent(nextPageToken);
  }

  const options = {
    hostname: 'firestore.googleapis.com',
    port: 443,
    path: pathStr,
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + token
    }
  };

  const req = https.request(options, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const json = JSON.parse(data);
      if (json.error) {
        console.log('Error:', json);
        return;
      }
      
      if (json.documents) {
        allDocs = allDocs.concat(json.documents);
      }
      
      if (json.nextPageToken) {
        fetchAllDocuments(json.nextPageToken, allDocs);
      } else {
        processDocuments(allDocs);
      }
    });
  });
  req.on('error', e => console.error(e));
  req.end();
}

function processDocuments(documents) {
  let orphans = [];
  let badStatus = [];
  let counts = { missingProp: 0, missingUnit: 0, unassociated: 0, badStatus: 0, assignedToTechTest: 0 };
  const approved = ['OPEN', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];
  
  documents.forEach(doc => {
    const fields = doc.fields || {};
    const id = doc.name.split('/').pop();
    const status = fields.status ? fields.status.stringValue : null;
    const propertyId = fields.propertyId ? fields.propertyId.stringValue : null;
    const unitId = fields.unitId ? fields.unitId.stringValue : null;
    const assignedTechId = fields.assignedTechnicianId ? fields.assignedTechnicianId.stringValue : null;
    
    let isOrphan = false;
    if (!propertyId) counts.missingProp++;
    if (!unitId) counts.missingUnit++;
    if (propertyId === 'UNASSOCIATED') counts.unassociated++;
    
    if (!propertyId || propertyId === 'UNASSOCIATED' || !unitId) {
      orphans.push(id);
    }
    
    if (!approved.includes(status)) {
      counts.badStatus++;
      badStatus.push({id, status});
    }

    // Since we don't know the exact UI UID, we log any ticket assigned to the technician
    if (assignedTechId) counts.assignedToTechTest++;
  });
  
  console.log('---LIVE_AUDIT---');
  console.log('TOTAL:', documents.length);
  console.log('COUNTS:', counts);
  console.log('ORPHANS:', orphans.join(', '));
  console.log('BAD_STATUS:', badStatus.map(b => b.id + '(' + b.status + ')').join(', '));
}

fetchAllDocuments();