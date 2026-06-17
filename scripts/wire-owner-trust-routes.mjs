import { readFileSync, writeFileSync } from 'node:fs';

function patchFile(path, patches) {
  let source = readFileSync(path, 'utf8');
  let output = source;
  for (const patch of patches) {
    if (patch.skipIf && output.includes(patch.skipIf)) continue;
    if (!output.includes(patch.find)) throw new Error(`[wire-owner-trust-routes] Missing anchor in ${path}: ${patch.find}`);
    output = output.replace(patch.find, patch.replace);
  }
  if (output !== source) writeFileSync(path, output);
}

patchFile('apps/admin-panel/src/App.tsx', [
  {
    skipIf: "WhatsAppTriageQueuePage",
    find: "import BinGptEngineerPage from './pages/admin/BinGptEngineerPage';\n",
    replace: "import BinGptEngineerPage from './pages/admin/BinGptEngineerPage';\nimport WhatsAppTriageQueuePage from './pages/admin/WhatsAppTriageQueuePage';\nimport RfqTrustWorkflowPage from './pages/admin/RfqTrustWorkflowPage';\nimport VendorCommandCenterPage from './pages/admin/VendorCommandCenterPage';\nimport DataGovernanceAuditPage from './pages/admin/DataGovernanceAuditPage';\n",
  },
  {
    skipIf: 'path="/ops/whatsapp-triage"',
    find: "                    <Route path=\"/ops/public\" element={<ProtectedRoute adminOnly><PublicLaunchOpsPanel /></ProtectedRoute>} />\n",
    replace: "                    <Route path=\"/ops/public\" element={<ProtectedRoute adminOnly><PublicLaunchOpsPanel /></ProtectedRoute>} />\n                    <Route path=\"/ops/whatsapp-triage\" element={<ProtectedRoute adminOnly><WhatsAppTriageQueuePage /></ProtectedRoute>} />\n                    <Route path=\"/ops/rfq\" element={<ProtectedRoute adminOnly><RfqTrustWorkflowPage /></ProtectedRoute>} />\n                    <Route path=\"/ops/vendors\" element={<ProtectedRoute adminOnly><VendorCommandCenterPage /></ProtectedRoute>} />\n                    <Route path=\"/ops/data-governance\" element={<ProtectedRoute adminOnly><DataGovernanceAuditPage /></ProtectedRoute>} />\n",
  },
]);

patchFile('apps/admin-panel/src/components/Navigation.tsx', [
  {
    skipIf: "WhatsApp Triage",
    find: "        { text: tx('nav.tickets', 'Mission Logs'), icon: <ReceiptIcon />, path: '/tickets' },\n",
    replace: "        { text: tx('nav.tickets', 'Mission Logs'), icon: <ReceiptIcon />, path: '/tickets' },\n        { text: 'WhatsApp Triage', icon: <PendingActionsIcon />, path: '/ops/whatsapp-triage', color: binThemeTokens.gold },\n        { text: 'RFQ Trust Workflow', icon: <AccountBalanceWalletIcon />, path: '/ops/rfq', color: binThemeTokens.gold },\n        { text: 'Vendor Command', icon: <PeopleIcon />, path: '/ops/vendors', color: binThemeTokens.gold },\n        { text: 'PDPL Governance', icon: <SecurityIcon />, path: '/ops/data-governance', color: binThemeTokens.gold },\n",
  },
]);

patchFile('src/owner/OwnerApp.tsx', [
  {
    skipIf: "OwnerApprovalCenterPage",
    find: "import ContractorMarketplacePage from './pages/ContractorMarketplacePage';\n",
    replace: "import ContractorMarketplacePage from './pages/ContractorMarketplacePage';\nimport OwnerApprovalCenterPage from './pages/OwnerApprovalCenterPage';\n",
  },
  {
    skipIf: "navigate('/owner/approvals')",
    find: "                        <Button onClick={() => navigate('/owner/property-passport')} sx={{ display: { xs: 'none', md: 'inline-flex' }, color: binThemeTokens.goldHover, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, borderRadius: 3, fontWeight: 950, bgcolor: '#fff', boxShadow: '0 10px 26px rgba(17,24,39,0.05)' }}>\n                            {label('nav.property_passport', 'Property Passport')}\n                        </Button>\n",
    replace: "                        <Button onClick={() => navigate('/owner/approvals')} sx={{ display: { xs: 'none', md: 'inline-flex' }, color: binThemeTokens.goldHover, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, borderRadius: 3, fontWeight: 950, bgcolor: '#fff', boxShadow: '0 10px 26px rgba(17,24,39,0.05)' }}>\n                            {label('nav.owner_approvals', 'Approvals')}\n                        </Button>\n                        <Button onClick={() => navigate('/owner/property-passport')} sx={{ display: { xs: 'none', md: 'inline-flex' }, color: binThemeTokens.goldHover, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, borderRadius: 3, fontWeight: 950, bgcolor: '#fff', boxShadow: '0 10px 26px rgba(17,24,39,0.05)' }}>\n                            {label('nav.property_passport', 'Property Passport')}\n                        </Button>\n",
  },
  {
    skipIf: 'path="/approvals"',
    find: "                <Route path=\"/contractor-marketplace\" element={<ContractorMarketplacePage />} />\n",
    replace: "                <Route path=\"/contractor-marketplace\" element={<ContractorMarketplacePage />} />\n                <Route path=\"/approvals\" element={<OwnerApprovalCenterPage />} />\n",
  },
]);

console.log('Owner Trust workflow routes wired for admin and owner apps.');
