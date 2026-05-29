const fs = require('fs');
const path = require('path');

const root = process.cwd();

function file(rel) {
  return path.join(root, rel);
}

function read(rel) {
  return fs.readFileSync(file(rel), 'utf8');
}

function write(rel, text) {
  fs.writeFileSync(file(rel), text);
  console.log(`patched ${rel}`);
}

function ensureImport(text, anchor, importLine) {
  return text.includes(importLine) ? text : text.replace(anchor, `${anchor}\n${importLine}`);
}

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) {
    console.warn(`skip ${label}: pattern not found`);
    return text;
  }
  return text.replace(from, to);
}

function hardenPropertyPassport() {
  const rel = 'src/admin/pages/properties/PropertyPassportPage.tsx';
  let text = read(rel);
  text = ensureImport(text, "import { useNavigate } from 'react-router-dom';", "import LaunchStatusBanner from '../../components/LaunchStatusBanner';");
  text = ensureImport(text, "import LaunchStatusBanner from '../../components/LaunchStatusBanner';", "import { filterLaunchRecords, isOperationalRecord } from '../../utils/launchDataHygiene';");
  text = replaceOnce(text, `.map((id) => normalizePassport(id, passports[id], properties[id]))\n      .sort((a, b) => getMillis(b.updatedAt) - getMillis(a.updatedAt));`, `.map((id) => normalizePassport(id, passports[id], properties[id]))\n      .filter((row) => isOperationalRecord(row))\n      .sort((a, b) => getMillis(b.updatedAt) - getMillis(a.updatedAt));`, 'property passport launch filter');
  text = replaceOnce(text, `<Box sx={{ p: 4, direction: isRTL ? 'rtl' : 'ltr' }}>`, `<Box sx={{ p: { xs: 2, md: 4 }, direction: isRTL ? 'rtl' : 'ltr' }}>`, 'property passport mobile padding');
  text = replaceOnce(text, `<Stack direction="row" spacing={2}>`, `<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ width: { xs: '100%', sm: 'auto' } }}>`, 'property passport mobile toolbar');
  text = replaceOnce(text, `width: 320`, `width: { xs: '100%', sm: 320 }`, 'property passport mobile search width');
  text = replaceOnce(text, `</Box>\n\n      {error && <Alert severity="warning" sx={{ mb: 3 }}>{error}</Alert>}`, `</Box>\n\n      <LaunchStatusBanner\n        title="Property Passport is launch-filtered"\n        message="Only production records are shown. Test, demo and archived records are hidden after cleanup."\n      />\n\n      {error && <Alert severity="warning" sx={{ mb: 3 }}>{error}</Alert>}`, 'property passport banner');
  text = replaceOnce(text, `<TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>`, `<TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none', overflowX: 'auto' }}>`, 'property passport horizontal scroll');
  text = replaceOnce(text, `<Table sx={{ borderCollapse: 'separate', borderSpacing: '0 12px' }}>`, `<Table sx={{ borderCollapse: 'separate', borderSpacing: '0 12px', minWidth: 980 }}>`, 'property passport table min width');
  text = replaceOnce(text, `No matching property passports. Check Owner Registry or create a property from Admin Dashboard.`, `No production property passports yet. Approve an owner onboarding record to create a real property passport.`, 'property passport empty state');
  write(rel, text);
}

function hardenOwners() {
  const rel = 'src/admin/pages/owners/OwnerManagementPage.tsx';
  let text = read(rel);
  text = ensureImport(text, "import AdminPageFrame from '../../components/AdminPageFrame';", "import LaunchStatusBanner from '../../components/LaunchStatusBanner';");
  text = ensureImport(text, "import { useNavigate } from 'react-router-dom';", "import { filterLaunchRecords, isOperationalRecord } from '../../utils/launchDataHygiene';");
  text = replaceOnce(text, `setOwners(fetchedOwners);`, `setOwners(filterLaunchRecords(fetchedOwners).filter((owner) => isOperationalRecord(owner)));`, 'owner launch filter');
  text = replaceOnce(text, `subtitle="Strategic management of institutional and private asset owners"`, `subtitle="Production owner registry. Test/demo/archived records are hidden."`, 'owner subtitle');
  text = replaceOnce(text, `<TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>`, `<LaunchStatusBanner title="Owner Registry is launch-filtered" message="Archived E2E/demo owners are hidden. Add Owner generates an invite only; production contract activation must still pass onboarding approval." />\n\n      <TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', overflowX: 'auto' }}>`, 'owner banner and scroll');
  text = replaceOnce(text, `<Table>`, `<Table sx={{ minWidth: 920 }}>`, 'owner table width');
  text = replaceOnce(text, `</TableBody>\n        </Table>`, `{owners.length === 0 && !loading && (\n              <TableRow>\n                <TableCell colSpan={5} align="center" sx={{ py: 8, color: 'rgba(255,255,255,0.35)', fontWeight: 900 }}>No production owners yet. Approve owner onboarding or generate a new invite.</TableCell>\n              </TableRow>\n            )}\n          </TableBody>\n        </Table>`, 'owner empty state');
  write(rel, text);
}

function hardenTickets() {
  const rel = 'src/admin/pages/tickets/TicketsManagementPage.tsx';
  let text = read(rel);
  text = ensureImport(text, "import AdminPageFrame from '../../components/AdminPageFrame';", "import LaunchStatusBanner from '../../components/LaunchStatusBanner';");
  text = ensureImport(text, "import { resolvePropertyLocation } from '../../../utils/propertyLocationResolver';", "import { filterLaunchRecords } from '../../utils/launchDataHygiene';");
  text = replaceOnce(text, `setTickets(snap.docs.map(d => ({ ticketId: d.id, ...d.data() } as Ticket)));`, `setTickets(filterLaunchRecords(snap.docs.map(d => ({ ticketId: d.id, ...d.data() } as Ticket))));`, 'tickets launch filter');
  text = replaceOnce(text, `subtitle="Strategic oversight of field operations and incident resolution"`, `subtitle="Production maintenance tickets only. Test/demo rows are hidden."`, 'tickets subtitle');
  text = replaceOnce(text, `<Paper sx={{ p: 3, mb: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>`, `<LaunchStatusBanner title="Tickets are launch-filtered" message="Only production maintenance tickets are shown. Assignment remains active; completed tickets cannot be reassigned." />\n\n      <Paper sx={{ p: 3, mb: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>`, 'ticket banner');
  text = replaceOnce(text, `<TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>`, `<TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', overflowX: 'auto' }}>`, 'tickets scroll');
  text = replaceOnce(text, `<Table>`, `<Table sx={{ minWidth: 980 }}>`, 'tickets table width');
  text = replaceOnce(text, `</TableBody>\n        </Table>`, `{filteredTickets.length === 0 && !loading && (\n              <TableRow>\n                <TableCell colSpan={6} align="center" sx={{ py: 8, color: 'rgba(255,255,255,0.35)', fontWeight: 900 }}>No production maintenance tickets yet.</TableCell>\n              </TableRow>\n            )}\n          </TableBody>\n        </Table>`, 'ticket empty state');
  write(rel, text);
}

function hardenTechnicians() {
  const rel = 'src/admin/pages/technicians/TechniciansManagementPage.tsx';
  let text = read(rel);
  text = ensureImport(text, "import AdminPageFrame from '../../components/AdminPageFrame';", "import LaunchStatusBanner from '../../components/LaunchStatusBanner';");
  text = ensureImport(text, "import AddTechnicianDialog from '../../components/technicians/AddTechnicianDialog';", "import { filterLaunchRecords, comingSoon } from '../../utils/launchDataHygiene';");
  text = replaceOnce(text, `setTechs(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })));`, `setTechs(filterLaunchRecords(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }))));`, 'technician launch filter');
  text = replaceOnce(text, `subtitle="Fleet management and specialized field force deployment terminal"`, `subtitle="Production technician registry. Test/demo/archived records are hidden."`, 'technician subtitle');
  text = replaceOnce(text, `<Paper sx={{ p: 2, mb: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3 }}>`, `<LaunchStatusBanner title="Technician Corps is launch-filtered" message="Only production technicians are shown. View/assign shortcuts are guarded until their detail workflows are connected." />\n\n      <Paper sx={{ p: 2, mb: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3 }}>`, 'technician banner');
  text = replaceOnce(text, `<TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>`, `<TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', overflowX: 'auto' }}>`, 'technician scroll');
  text = replaceOnce(text, `<Table>`, `<Table sx={{ minWidth: 920 }}>`, 'technician table width');
  text = replaceOnce(text, `{ type: 'view', onClick: (id) => {} },`, `{ type: 'view', onClick: () => comingSoon('Technician profile detail is not connected yet.') },`, 'technician view action');
  text = replaceOnce(text, `{ type: 'assign', label: 'ASSIGN JOB', onClick: (id) => {} },`, `{ type: 'assign', label: 'ASSIGN JOB', onClick: () => comingSoon('Assign job from this registry is coming soon. Use Tickets > Assign for live dispatch.') },`, 'technician assign action');
  text = replaceOnce(text, `{ type: 'delete', onClick: (id) => deleteDoc(doc(db, 'users', id)), requiresConfirm: true }`, `{ type: 'delete', onClick: () => comingSoon('Technician removal is blocked for launch safety. Suspend the account from Firebase/Admin approval flow instead.'), requiresConfirm: true }`, 'technician removal action');
  write(rel, text);
}

function hardenSovereignControl() {
  const rel = 'src/admin/pages/admin/SovereignControlPage.tsx';
  let text = read(rel);
  text = ensureImport(text, "import AdminCrudActions from '../../components/AdminCrudActions';", "import LaunchStatusBanner from '../../components/LaunchStatusBanner';");
  text = ensureImport(text, "import LaunchStatusBanner from '../../components/LaunchStatusBanner';", "import { filterLaunchRecords, comingSoon } from '../../utils/launchDataHygiene';");
  text = replaceOnce(text, `setSettings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemSetting)));`, `setSettings(filterLaunchRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemSetting))));`, 'sovereign filter');
  text = replaceOnce(text, `await updateDoc(doc(db, 'systemSettings', id), { value });`, `comingSoon('System settings are read-only for launch. Enable approval workflow and audit logging before allowing edits.');`, 'sovereign read only update');
  text = replaceOnce(text, `subtitle="Global system parameters, security policies, and feature matrix"`, `subtitle="Read-only launch view for system parameters, security policies and feature flags"`, 'sovereign subtitle');
  text = replaceOnce(text, `<Button variant="contained" startIcon={<Plus size={18} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>`, `<Button variant="contained" startIcon={<Plus size={18} />} onClick={() => comingSoon('Add Parameter is locked until approval workflow is connected.')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>`, 'sovereign add guarded');
  text = replaceOnce(text, `<Grid container spacing={4}>`, `<LaunchStatusBanner title="Sovereign Control is read-only" message="No unsafe production mutations are allowed from this page until approvals, rollback and Audit Shield logging are live." />\n\n            <Grid container spacing={4}>`, 'sovereign banner');
  text = text.replace(/<Typography variant="h5" fontWeight="950" color="#FFF">98\.4% COMPLIANCE<\/Typography>/g, `<Typography variant="h5" fontWeight="950" color="#FFF">PENDING LIVE DATA</Typography>`);
  text = text.replace(/<Typography variant="caption" color="textSecondary">Response delta: 12\.4 minutes<\/Typography>/g, `<Typography variant="caption" color="textSecondary">Connect live ticket timestamps first</Typography>`);
  text = text.replace(/<Typography variant="h5" fontWeight="950" color="#FFF">V2\.4\.0 STABLE<\/Typography>/g, `<Typography variant="h5" fontWeight="950" color="#FFF">SETUP PROTECTED</Typography>`);
  text = text.replace(/<Typography variant="caption" color="textSecondary">Last deploy: 2 hours ago<\/Typography>/g, `<Typography variant="caption" color="textSecondary">Manual deployment verified by admin</Typography>`);
  text = text.replace(`{ type: 'delete', onClick: (id) => deleteDoc(doc(db, 'systemSettings', id)), requiresConfirm: true }`, `{ type: 'delete', onClick: () => comingSoon('Policy removal is blocked for launch safety.'), requiresConfirm: true }`);
  write(rel, text);
}

function hardenAuditShield() {
  const rel = 'src/admin/pages/admin/AuditShieldPage.tsx';
  let text = read(rel);
  text = ensureImport(text, "import AdminPageFrame from '../../components/AdminPageFrame';", "import LaunchStatusBanner from '../../components/LaunchStatusBanner';");
  text = ensureImport(text, "import LaunchStatusBanner from '../../components/LaunchStatusBanner';", "import { filterLaunchRecords, comingSoon } from '../../utils/launchDataHygiene';");
  text = replaceOnce(text, `setLogs(auditLogs);`, `setLogs(filterLaunchRecords(auditLogs));`, 'audit log filter');
  text = replaceOnce(text, `total: auditLogs.length,\n                verified: auditLogs.filter((l: any) => l.forensicHash).length,`, `total: filterLaunchRecords(auditLogs).length,\n                verified: filterLaunchRecords(auditLogs).filter((l: any) => l.forensicHash).length,`, 'audit stats filter');
  text = replaceOnce(text, `subtitle="Immutable forensic ledger and systemic activity verification node"`, `subtitle="Launch-filtered forensic ledger. Test/demo audit rows are hidden."`, 'audit subtitle');
  text = replaceOnce(text, `<Grid container spacing={3}>`, `<LaunchStatusBanner title="Audit Shield is launch-filtered" message="Only production audit logs are displayed. Re-hash and export are guarded until hashing and evidence-bundle services are connected." />\n\n                <Grid container spacing={3}>`, 'audit banner');
  text = replaceOnce(text, `<Button variant="outlined" startIcon={<RefreshCw size={16} />} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.1)', fontWeight: 900 }}>RE-HASH LEDGER</Button>`, `<Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={() => comingSoon('Re-hash ledger requires connected hash-verification backend.')} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.1)', fontWeight: 900 }}>RE-HASH LEDGER</Button>`, 'audit rehash guarded');
  text = replaceOnce(text, `<Button variant="contained" startIcon={<Download size={16} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>EXPORT BUNDLE</Button>`, `<Button variant="contained" startIcon={<Download size={16} />} onClick={() => comingSoon('Evidence bundle export requires storage packaging and signing backend.')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>EXPORT BUNDLE</Button>`, 'audit export guarded');
  text = replaceOnce(text, `<TableContainer component={Paper} sx={{ borderRadius: 6, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>`, `<TableContainer component={Paper} sx={{ borderRadius: 6, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', overflowX: 'auto' }}>`, 'audit scroll');
  text = replaceOnce(text, `<Table>`, `<Table sx={{ minWidth: 1000 }}>`, 'audit table width');
  write(rel, text);
}

hardenPropertyPassport();
hardenOwners();
hardenTickets();
hardenTechnicians();
hardenSovereignControl();
hardenAuditShield();
console.log('Remaining admin launch pages hardened. Run npm run lint && npm run build next.');
