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
      if (json.documents) {
        allDocs = allDocs.concat(json.documents);
      }
      if (json.nextPageToken) {
        fetchAllDocuments(json.nextPageToken, allDocs);
      } else {
        allDocs.forEach(doc => {
          console.log(doc.name.split('/').pop(), JSON.stringify(doc.fields));
        });
      }
    });
  });
  req.end();
}

fetchAllDocuments();