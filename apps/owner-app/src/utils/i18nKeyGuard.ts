import { useEffect } from 'react';

const en: Record<string, string> = {
  'gateway.login': 'Login',
  'login.get_started': 'Get Started',
  'onboarding.company': 'Company',
  'onboarding.asset': 'Asset',
  'onboarding.location': 'Location',
  'onboarding.systems': 'Systems',
  'onboarding.service_plan': 'Service Plan',
  'onboarding.addons': 'Add-ons',
  'onboarding.documents': 'Documents',
  'onboarding.verification': 'Verification',
  'onboarding.review': 'Review',
  'onboarding.payment': 'Payment',
  'onboarding.asset_type.1': 'Choose Asset Type',
  'onboarding.location_title': 'Property Location',
  'onboarding.location_desc': 'Confirm the emirate, address, and coordinates for this asset.',
  'onboarding.location_manual_title': 'Manual Location Entry',
  'onboarding.location_manual_info': 'Manual coordinates can be reviewed later by Admin.',
  'onboarding.retry_scan': 'Retry Scan',
  'onboarding.emirate': 'Emirate',
  'onboarding.emirate.dubai': 'Dubai',
  'onboarding.address': 'Address',
  'onboarding.back': 'Back',
  'onboarding.continue': 'Continue',
  'onboarding.type.res_building': 'Residential Building',
  'onboarding.type.apartment': 'Apartment',
  'onboarding.type.villa': 'Villa',
  'onboarding.type.retail': 'Retail',
  'onboarding.type.office': 'Office',
  'onboarding.type.com_building': 'Commercial Building',
  'onboarding.type.hospital': 'Hospital',
  'onboarding.type.hotel': 'Hotel',
  'onboarding.type.mall': 'Mall',
  'onboarding.type.warehouse': 'Warehouse',
  'onboarding.type.school': 'School',
  'onboarding.type.clinic': 'Clinic',
  'onboarding.type.gov_majlis': 'Government Majlis',
  'onboarding.type.gov_prop': 'Government Property',
  'onboarding.type.labour_camp': 'Labour Camp',
  'onboarding.type.skyscraper': 'Skyscraper',
  'onboarding.type.mixed_tower': 'Mixed-use Tower',
  'onboarding.type.priv_majlis': 'Private Majlis',
  'onboarding.type.event_venue': 'Event Venue',
  'onboarding.type.sports_complex': 'Sports Complex',
  'onboarding.type.stadium': 'Stadium',
  'onboarding.type.staff_acc': 'Staff Accommodation',
  'onboarding.type.industrial': 'Industrial Asset',
  'onboarding.type.resort': 'Resort',
  'onboarding.type.farm': 'Farm',
};

const ar: Record<string, string> = {
  'gateway.login': 'تسجيل الدخول',
  'login.get_started': 'ابدأ الآن',
  'onboarding.company': 'الشركة',
  'onboarding.asset': 'الأصل',
  'onboarding.location': 'الموقع',
  'onboarding.systems': 'الأنظمة',
  'onboarding.service_plan': 'خطة الخدمة',
  'onboarding.addons': 'الإضافات',
  'onboarding.documents': 'المستندات',
  'onboarding.verification': 'التحقق',
  'onboarding.review': 'المراجعة',
  'onboarding.payment': 'الدفع',
  'onboarding.asset_type.1': 'اختر نوع الأصل',
  'onboarding.location_title': 'موقع العقار',
  'onboarding.location_desc': 'أكد الإمارة والعنوان والإحداثيات لهذا الأصل.',
  'onboarding.location_manual_title': 'إدخال الموقع يدوياً',
  'onboarding.location_manual_info': 'يمكن للإدارة مراجعة الإحداثيات لاحقاً.',
  'onboarding.retry_scan': 'إعادة المحاولة',
  'onboarding.emirate': 'الإمارة',
  'onboarding.emirate.dubai': 'دبي',
  'onboarding.address': 'العنوان',
  'onboarding.back': 'رجوع',
  'onboarding.continue': 'متابعة',
  'onboarding.type.res_building': 'مبنى سكني',
  'onboarding.type.apartment': 'شقة',
  'onboarding.type.villa': 'فيلا',
  'onboarding.type.retail': 'محل تجاري',
  'onboarding.type.office': 'مكتب',
  'onboarding.type.com_building': 'مبنى تجاري',
  'onboarding.type.hospital': 'مستشفى',
  'onboarding.type.hotel': 'فندق',
  'onboarding.type.mall': 'مركز تجاري',
  'onboarding.type.warehouse': 'مستودع',
  'onboarding.type.school': 'مدرسة',
  'onboarding.type.clinic': 'عيادة',
  'onboarding.type.gov_majlis': 'مجلس حكومي',
  'onboarding.type.gov_prop': 'عقار حكومي',
  'onboarding.type.labour_camp': 'سكن عمال',
  'onboarding.type.skyscraper': 'برج شاهق',
  'onboarding.type.mixed_tower': 'برج متعدد الاستخدامات',
  'onboarding.type.priv_majlis': 'مجلس خاص',
  'onboarding.type.event_venue': 'قاعة فعاليات',
  'onboarding.type.sports_complex': 'مجمع رياضي',
  'onboarding.type.stadium': 'استاد',
  'onboarding.type.staff_acc': 'سكن موظفين',
  'onboarding.type.industrial': 'أصل صناعي',
  'onboarding.type.resort': 'منتجع',
  'onboarding.type.farm': 'مزرعة',
};

function language() {
  return localStorage.getItem('app_lang') === 'ar' || document.documentElement.lang === 'ar' ? 'ar' : 'en';
}

function humanize(key: string) {
  return key.split('.').pop()!.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function value(raw: string) {
  const key = raw.trim();
  if (!/^(gateway|login|onboarding)\.[a-z0-9_.-]+$/i.test(key)) return null;
  return (language() === 'ar' ? ar[key] : en[key]) || en[key] || humanize(key);
}

function apply(root: ParentNode) {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walk.nextNode();
  while (node) {
    const next = value(node.textContent || '');
    if (next) node.textContent = next;
    node = walk.nextNode();
  }
  root.querySelectorAll?.('[placeholder], [aria-label], [title]').forEach((el) => {
    ['placeholder', 'aria-label', 'title'].forEach((attr) => {
      const current = el.getAttribute(attr);
      const next = current ? value(current) : null;
      if (next) el.setAttribute(attr, next);
    });
  });
}

export function useI18nKeyGuard() {
  useEffect(() => {
    const run = () => apply(document.body);
    run();
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
    const timer = window.setInterval(run, 1000);
    return () => { observer.disconnect(); window.clearInterval(timer); };
  }, []);
}
