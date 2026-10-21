/** Bottom-navigation tabs and FAB actions per role (REDESIGN.md R2). Paths must exist in each role app. */
export type NavRole = 'owner' | 'tenant' | 'technician' | 'broker';
export type NavIcon = 'home' | 'list' | 'map' | 'messages' | 'profile' | 'building' | 'wrench' | 'money' | 'file' | 'users';

export interface NavTab { key: string; path: string; en: string; ar: string; icon: NavIcon; match: string[] }

export const ROLE_TABS: Record<NavRole, NavTab[]> = {
  technician: [
    { key: 'home', path: '/technician/dashboard', en: 'Home', ar: 'الرئيسية', icon: 'home', match: ['/technician', '/technician/dashboard'] },
    { key: 'jobs', path: '/technician/jobs', en: 'Jobs', ar: 'المهام', icon: 'list', match: ['/technician/jobs', '/technician/job/'] },
    { key: 'map', path: '/technician/map', en: 'Map', ar: 'الخريطة', icon: 'map', match: ['/technician/map'] },
    { key: 'messages', path: '/technician/chat', en: 'Messages', ar: 'الرسائل', icon: 'messages', match: ['/technician/chat', '/technician/bin-connect'] },
    { key: 'profile', path: '/technician/profile', en: 'Profile', ar: 'حسابي', icon: 'profile', match: ['/technician/profile', '/technician/hr', '/technician/history'] },
  ],
  owner: [
    { key: 'home', path: '/owner/dashboard', en: 'Home', ar: 'الرئيسية', icon: 'home', match: ['/owner', '/owner/dashboard'] },
    { key: 'properties', path: '/owner/properties', en: 'Properties', ar: 'العقارات', icon: 'building', match: ['/owner/properties', '/owner/units', '/owner/tenants', '/owner/property-passport'] },
    { key: 'repairs', path: '/owner/tickets', en: 'Repairs', ar: 'الصيانة', icon: 'wrench', match: ['/owner/tickets', '/owner/ticket/', '/owner/approvals'] },
    { key: 'money', path: '/owner/financials', en: 'Money', ar: 'المالية', icon: 'money', match: ['/owner/financials', '/owner/payment-proof', '/owner/p-l-report', '/owner/roi'] },
    { key: 'account', path: '/owner/profile', en: 'Account', ar: 'حسابي', icon: 'profile', match: ['/owner/profile', '/owner/documents', '/owner/contracts', '/owner/iban'] },
  ],
  tenant: [
    { key: 'home', path: '/tenant/dashboard', en: 'Home', ar: 'الرئيسية', icon: 'home', match: ['/tenant', '/tenant/dashboard'] },
    { key: 'requests', path: '/tenant/tickets', en: 'Requests', ar: 'الطلبات', icon: 'wrench', match: ['/tenant/tickets', '/tenant/ticket/', '/tenant/request'] },
    { key: 'payments', path: '/tenant/payments', en: 'Payments', ar: 'المدفوعات', icon: 'money', match: ['/tenant/payments', '/tenant/renewals'] },
    { key: 'documents', path: '/tenant/documents', en: 'Documents', ar: 'المستندات', icon: 'file', match: ['/tenant/documents', '/tenant/unit'] },
    { key: 'profile', path: '/tenant/profile', en: 'Profile', ar: 'حسابي', icon: 'profile', match: ['/tenant/profile'] },
  ],
  broker: [
    { key: 'home', path: '/broker/dashboard', en: 'Home', ar: 'الرئيسية', icon: 'home', match: ['/broker', '/broker/dashboard'] },
    { key: 'leads', path: '/broker/leads', en: 'Leads', ar: 'العملاء', icon: 'users', match: ['/broker/leads', '/broker/referrals', '/broker/deals'] },
    { key: 'listings', path: '/broker/listings', en: 'Listings', ar: 'العقارات', icon: 'building', match: ['/broker/listings'] },
    { key: 'commission', path: '/broker/commissions', en: 'Commission', ar: 'العمولة', icon: 'money', match: ['/broker/commissions', '/broker/attribution'] },
    { key: 'profile', path: '/broker/profile', en: 'Profile', ar: 'حسابي', icon: 'profile', match: ['/broker/profile', '/broker/documents'] },
  ],
};

export interface FabAction { key: string; en: string; ar: string; path?: string; event?: 'bin:open-ai' | 'bin:open-chat'; danger?: boolean }

export const ROLE_FAB_ACTIONS: Record<NavRole | 'admin', FabAction[]> = {
  technician: [
    { key: 'ai', en: 'Ask BIN AI', ar: 'اسأل مساعد BIN', event: 'bin:open-ai' },
    { key: 'chat', en: 'Message BIN', ar: 'راسل BIN', event: 'bin:open-chat' },
    { key: 'support', en: 'Get help', ar: 'طلب مساعدة', path: '/technician/support' },
  ],
  owner: [
    { key: 'complaint', en: 'Report a problem', ar: 'الإبلاغ عن مشكلة', path: '/owner/complaint' },
    { key: 'redesign', en: 'Redesign a unit with AI', ar: 'أعد تصميم وحدة بالذكاء الاصطناعي', path: '/owner/design-studio' },
    { key: 'ai', en: 'Ask BIN AI', ar: 'اسأل مساعد BIN', event: 'bin:open-ai' },
    { key: 'chat', en: 'Message BIN', ar: 'راسل BIN', event: 'bin:open-chat' },
  ],
  tenant: [
    { key: 'request', en: 'Report a repair', ar: 'طلب صيانة', path: '/tenant/request' },
    { key: 'redesign', en: 'Redesign with AI', ar: 'صمّم منزلك بالذكاء الاصطناعي', path: '/tenant/design-studio' },
    { key: 'ai', en: 'Ask BIN AI', ar: 'اسأل مساعد BIN', event: 'bin:open-ai' },
    { key: 'emergency', en: 'Emergency', ar: 'طوارئ', path: '/tenant/emergency', danger: true },
  ],
  broker: [
    { key: 'lead', en: 'Add a lead', ar: 'إضافة عميل', path: '/broker/leads/new' },
    { key: 'redesign', en: 'Redesign a listing with AI', ar: 'أعد تصميم عقار بالذكاء الاصطناعي', path: '/broker/design-studio' },
    { key: 'ai', en: 'Ask BIN AI', ar: 'اسأل مساعد BIN', event: 'bin:open-ai' },
  ],
  admin: [
    { key: 'ai', en: 'Ask BIN AI', ar: 'اسأل مساعد BIN', event: 'bin:open-ai' },
  ],
};

/** Routes where floating buttons would cover form fields or submit buttons. */
export const FAB_HIDDEN_PATTERNS = [/onboarding/, /\/activation/, /\/request$/, /\/leads\/new/, /\/referrals\/new/, /\/complaint$/, /\/payment-proof/, /\/job\//, /\/chat/, /\/bin-connect/, /\/emergency/, /\/move-inspection/];

export function navRoleForPath(pathname: string): NavRole | null {
  for (const role of ['owner', 'tenant', 'technician', 'broker'] as NavRole[]) {
    if (pathname === `/${role}` || pathname.startsWith(`/${role}/`)) return role;
  }
  return null;
}

export function activeTabKey(role: NavRole, pathname: string): string | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  let best: { key: string; len: number } | null = null;
  for (const tab of ROLE_TABS[role]) {
    for (const m of tab.match) {
      const hit = m.endsWith('/') ? p.startsWith(m) : p === m || p.startsWith(`${m}/`);
      if (hit && (!best || m.length > best.len)) best = { key: tab.key, len: m.length };
    }
  }
  return best?.key ?? null;
}

export function isFabHidden(pathname: string): boolean {
  return FAB_HIDDEN_PATTERNS.some((re) => re.test(pathname));
}
