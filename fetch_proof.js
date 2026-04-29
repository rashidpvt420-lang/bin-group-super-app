const fs = require('fs');
const https = require('https');
const path = require('path');
const os = require('os');

const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const token = config.tokens.access_token;

function fetchSample(collection) {
  const options = {
    hostname: 'firestore.googleapis.com',
    port: 443,
    path: `/v1/projects/bin-group-57c60/databases/(default)/documents/${collection}?pageSize=1`,
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token }
  };

  return new Promise((resolve) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.end();
  });
}

async function run() {
  const property = await fetchSample('properties');
  const ticket = await fetchSample('maintenanceTickets');
  
  console.log('--- PROOF: property.geo ---');
  if (property.documents && property.documents[0]) {
      console.log(JSON.stringify(property.documents[0].fields.geo || property.documents[0].fields.propertyLocation, null, 2));
  } else {
      console.log('No properties found.');
  }

  console.log('\n--- PROOF: maintenanceTickets.geo ---');
  if (ticket.documents && ticket.documents[0]) {
      console.log(JSON.stringify(ticket.documents[0].fields.geo || ticket.documents[0].fields.ticketGeo || ticket.documents[0].fields.propertyLocation, null, 2));
  } else {
      console.log('No tickets found.');
  }
}

run();
