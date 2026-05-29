const fs = require('fs');
const path = require('path');

const root = process.cwd();
const file = (rel) => path.join(root, rel);
const read = (rel) => fs.readFileSync(file(rel), 'utf8');
const write = (rel, text) => {
  fs.writeFileSync(file(rel), text);
  console.log(`patched ${rel}`);
};

function replaceRequired(text, from, to, label) {
  if (!text.includes(from)) {
    throw new Error(`Missing pattern for ${label}`);
  }
  return text.replace(from, to);
}

function replaceOptional(text, from, to, label) {
  if (!text.includes(from)) {
    console.warn(`skip ${label}: already patched or pattern not found`);
    return text;
  }
  return text.replace(from, to);
}

function patchProtectedRoute() {
  const rel = 'src/components/ProtectedRoute.tsx';
  let text = read(rel);

  text = replaceOptional(
    text,
    `interface ProtectedRouteProps {\n    children: React.ReactNode;\n    allowedRoles?: string[];\n    requiredPermission?: SovereignPermission;\n}`,
    `interface ProtectedRouteProps {\n    children: React.ReactNode;\n    allowedRoles?: string[];\n    requiredPermission?: SovereignPermission;\n    /**\n     * Admin users historically bypassed all allowedRoles checks. Keep that default\n     * for admin pages, but allow sensitive owner/tenant-only routes to disable it.\n     */\n    allowAdminBypass?: boolean;\n}`,
    'ProtectedRoute props'
  );

  text = replaceOptional(
    text,
    `const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, requiredPermission }) => {`,
    `const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, requiredPermission, allowAdminBypass = true }) => {`,
    'ProtectedRoute default prop'
  );

  text = replaceOptional(
    text,
    `if (allowedRoles && !allowedRoles.includes(normalizedRole) && !isAdmin) {`,
    `if (allowedRoles && !allowedRoles.includes(normalizedRole) && !(allowAdminBypass && isAdmin)) {`,
    'ProtectedRoute admin bypass guard'
  );

  write(rel, text);
}

function patchApp() {
  const rel = 'src/App.tsx';
  let text = read(rel);

  text = replaceOptional(
    text,
    `  '/owners', '/tenants', '/technicians', '/brokers', '/property-management', '/maintenance', '/ai-design-studio',\n`,
    `  '/owners', '/tenants', '/technicians', '/brokers', '/property-management', '/maintenance',\n`,
    'remove public ai-design-studio from public route allowlist'
  );

  text = replaceRequired(
    text,
    `const PUBLIC_ROUTE_PREFIXES = ['/onboarding', '/verify', '/invoices'];`,
    `const PUBLIC_ROUTE_PREFIXES = ['/onboarding', '/verify', '/invoices'];\n\nconst MARKETING_SELF_NAV_ROUTES = new Set([\n  '/', '/owners', '/tenants', '/technicians', '/brokers', '/property-management', '/maintenance',\n  '/majlis-care', '/stadiums', '/hotels', '/malls', '/hospitals', '/government-properties',\n  '/security', '/services', '/contact', '/request-demo',\n]);\n\nconst OWNER_TENANT_AI_ROLES = new Set(['owner', 'tenant']);`,
    'public shell route constants'
  );

  text = replaceRequired(
    text,
    `const isAdminRoute = location.pathname.startsWith('/admin');`,
    `const isAdminRoute = location.pathname.startsWith('/admin');\n  const normalizedRole = (role || '').toLowerCase();\n  const canUseOwnerTenantAI = Boolean(user) && OWNER_TENANT_AI_ROLES.has(normalizedRole);`,
    'AppContent AI role gate'
  );

  text = replaceOptional(
    text,
    `        <Route path="/ai-design-studio" element={<PublicMarketingPage page="ai-design-studio" />} />`,
    `        <Route path="/ai-design-studio" element={<ProtectedRoute allowedRoles={['owner', 'tenant']} allowAdminBypass={false}><DesignStudioPage /></ProtectedRoute>} />`,
    'make legacy ai-design-studio protected'
  );

  text = replaceOptional(
    text,
    `        <Route path="/design-studio" element={<ProtectedRoute allowedRoles={['owner', 'tenant', 'broker', 'admin', 'ceo']}><DesignStudioPage /></ProtectedRoute>} />`,
    `        <Route path="/design-studio" element={<ProtectedRoute allowedRoles={['owner', 'tenant']} allowAdminBypass={false}><DesignStudioPage /></ProtectedRoute>} />`,
    'restrict design studio route'
  );

  text = replaceOptional(
    text,
    `        <Route path="/design-studio/request/:id" element={<ProtectedRoute allowedRoles={['owner', 'tenant', 'broker', 'admin', 'ceo']}><DesignRequestDetailPage /></ProtectedRoute>} />`,
    `        <Route path="/design-studio/request/:id" element={<ProtectedRoute allowedRoles={['owner', 'tenant']} allowAdminBypass={false}><DesignRequestDetailPage /></ProtectedRoute>} />`,
    'restrict design studio detail route'
  );

  text = replaceRequired(
    text,
    `      {!location.pathname.startsWith('/onboarding') && !isAdminRoute && (\n        <SovereignAIChat role={(role || 'unknown').toLowerCase() as any} onNavigate={navigate} />\n      )}`,
    `      {canUseOwnerTenantAI && !location.pathname.startsWith('/onboarding') && !isAdminRoute && (\n        <SovereignAIChat role={normalizedRole as any} onNavigate={navigate} />\n      )}`,
    'AI chat owner/tenant gate'
  );

  text = replaceRequired(
    text,
    `                  <Route path="/" element={null} />\n                  <Route path="/tenant/*" element={null} />`,
    `                  <Route path="/" element={null} />\n                  {Array.from(MARKETING_SELF_NAV_ROUTES).map((path) => (\n                    <Route key={path} path={path} element={null} />\n                  ))}\n                  <Route path="/tenant/*" element={null} />`,
    'disable global header on marketing self-nav pages'
  );

  write(rel, text);
}

function patchSovereignHeader() {
  const rel = 'src/components/SovereignHeader.tsx';
  let text = read(rel);

  text = replaceRequired(
    text,
    `    const [unreadCount, setUnreadCount] = useState(0);\n    const isCompanyRoute = location.pathname === '/' || location.pathname === '/company';`,
    `    const [unreadCount, setUnreadCount] = useState(0);\n    const isCompanyRoute = location.pathname === '/' || location.pathname === '/company';\n    const canAccessAIStudio = ['owner', 'tenant'].includes((role || '').toLowerCase());`,
    'header AI role gate'
  );

  text = replaceOptional(
    text,
    `                                <Button onClick={() => navigate('/ai-design-studio')} sx={{ color: mode === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.85rem' }}>\n                                    AI Studio\n                                </Button>\n`,
    ``,
    'remove public header AI Studio link'
  );

  text = replaceOptional(
    text,
    `                                <Button onClick={() => navigate('/design-studio')} sx={{ color: mode === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.85rem' }}>\n                                    {t('nav.ai_studio')}\n                                </Button>`,
    `                                {canAccessAIStudio && (\n                                    <Button onClick={() => navigate('/design-studio')} sx={{ color: mode === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.85rem' }}>\n                                        {t('nav.ai_studio')}\n                                    </Button>\n                                )}`,
    'logged-in header AI Studio role gate'
  );

  write(rel, text);
}

function patchNavigationControl() {
  const rel = 'src/components/navigation/NavigationControl.tsx';
  let text = read(rel);

  text = replaceOptional(
    text,
    `    return user && ['owner', 'tenant', 'broker', 'admin', 'ceo'].includes(r);`,
    `    return Boolean(user) && ['owner', 'tenant'].includes(r);`,
    'navigation AI owner/tenant role gate'
  );

  text = replaceOptional(
    text,
    `    if (canAccessAIStudio()) return '/design-studio';\n    return '/ai-design-studio';`,
    `    return '/design-studio';`,
    'navigation AI protected route only'
  );

  text = replaceRequired(
    text,
    `  // Never render on admin routes — admin shell has its own sidebar navigation\n  if (location.pathname.startsWith('/admin')) return null;\n  if (['/', '/login', '/gateway'].includes(location.pathname) || location.pathname.startsWith('/onboarding')) return null;`,
    `  // Never render on public/anonymous routes or admin routes. Role portals own this control.\n  if (!user) return null;\n  if (location.pathname.startsWith('/admin')) return null;\n  if (['/', '/login', '/gateway', '/company'].includes(location.pathname) || location.pathname.startsWith('/onboarding')) return null;`,
    'hide floating controls on public anonymous pages'
  );

  text = replaceRequired(
    text,
    `        <Tooltip title={t('nav.ai_studio') || 'AI Studio'} placement={isRTL ? 'right' : 'left'}><IconButton onClick={() => navigate(getAIStudioRoute())} sx={{ ...buttonSx, color: `${binThemeTokens.gold} !important` }}><Paintbrush size={20} /></IconButton></Tooltip>`,
    `        {canAccessAIStudio() && (\n          <Tooltip title={t('nav.ai_studio') || 'AI Studio'} placement={isRTL ? 'right' : 'left'}><IconButton onClick={() => navigate(getAIStudioRoute())} sx={{ ...buttonSx, color: `${binThemeTokens.gold} !important` }}><Paintbrush size={20} /></IconButton></Tooltip>\n        )}`,
    'render floating AI button only for owner/tenant'
  );

  write(rel, text);
}

patchProtectedRoute();
patchApp();
patchSovereignHeader();
patchNavigationControl();

console.log('\nCritical public shell + AI access patch complete.');
console.log('Expected: no duplicate public headers, no public AI Studio, AI Studio only owner/tenant, no anonymous floating control.');
