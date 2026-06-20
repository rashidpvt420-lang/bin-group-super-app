import { readFileSync, writeFileSync } from 'node:fs';

const patches = [
  {
    path: 'src/tenant/TenantApp.tsx',
    importAfter: "import BinConnectChatBox from '../components/BinConnectChatBox';",
    importLine: "import BinConnectInboxPage from '../components/BinConnectInboxPage';",
    routeAnchor: '                <Route path="/amenities" element={<TenantAmenitiesPage />} />',
    routeLine: '                <Route path="/bin-connect" element={<BinConnectInboxPage role="tenant" dark />} />',
  },
  {
    path: 'src/technician/TechnicianApp.tsx',
    importAfter: "import BinConnectChatBox from '../components/BinConnectChatBox';",
    importLine: "import BinConnectInboxPage from '../components/BinConnectInboxPage';",
    routeAnchor: '                <Route path="/support" element={<SupportPage />} />',
    routeLine: '                <Route path="/bin-connect" element={<BinConnectInboxPage role="technician" />} />',
  },
  {
    path: 'src/broker/BrokerApp.tsx',
    importAfter: "import BinConnectChatBox from '../components/BinConnectChatBox';",
    importLine: "import BinConnectInboxPage from '../components/BinConnectInboxPage';",
    routeAnchor: '        <Route path="/profile" element={<BrokerProfilePage />} />',
    routeLine: '        <Route path="/bin-connect" element={<BinConnectInboxPage role="broker" />} />',
  },
];

for (const patch of patches) {
  let file = readFileSync(patch.path, 'utf8');
  let changed = false;
  if (!file.includes(patch.importLine)) {
    file = file.replace(patch.importAfter, `${patch.importAfter}\n${patch.importLine}`);
    changed = true;
  }
  if (!file.includes(patch.routeLine)) {
    file = file.replace(patch.routeAnchor, `${patch.routeAnchor}\n${patch.routeLine}`);
    changed = true;
  }
  if (changed) {
    writeFileSync(patch.path, file);
    console.log(`Wired BIN Connect inbox route in ${patch.path}`);
  } else {
    console.log(`BIN Connect inbox route already wired in ${patch.path}`);
  }
}
