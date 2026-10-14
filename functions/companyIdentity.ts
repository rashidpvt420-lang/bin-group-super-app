// Single source of truth for the company identity printed on every generated document.
// Source: Abu Dhabi (ADRA) commercial licence supplied by the owner (printed 17/09/2025).
// Brand stays in Latin script in Arabic text too (no official Arabic brand name supplied).
// Keep functions/companyIdentity.ts byte-identical in its exported values (guarded by tests).
// Never invent missing values: blanks stay as visible [PLACEHOLDERS].

export const COMPANY_IDENTITY = {
  brandName: 'BIN-GROUPS',
  legalNameEn: '1267058 ALL KIND BUILDING PROJECTS CONTRACTING - L.L.C - S.P.C',
  legalNameAr: '1267058 مقاولات مشاريع المباني بانواعها - ذ.م.م - ش.ش.و',
  legalFormEn: 'Limited Liability Company - Sole Proprietorship',
  legalFormAr: 'شركة ذات مسؤولية محدودة - شركة الشخص الواحد',
  licensingAuthorityEn: 'Abu Dhabi Registration and Licensing Authority (ADRA)',
  licensingAuthorityAr: 'هيئة أبوظبي للتسجيل والترخيص',
  licenceNo: 'CN-5914744',
  unifiedRegistrationNo: '101-2025-200047929',
  unifiedLicenceNo: '501-2025-200031050',
  adcciNo: '8800106968',
  icpEstablishmentCardNo: '903215',
  mohreEstablishmentNo: '[MOHRE EST. NO.]',
  registeredAddressEn: '[REGISTERED ADDRESS]',
  registeredAddressAr: '[العنوان المسجل]',
  authorisedSignatoryEn: 'RASHID ABDUL GHANI ABDUL GHANI',
  authorisedSignatoryAr: 'راشد عبدالغنى عبدالغنى',
  authorisedSignatoryTitleEn: 'Owner / Manager',
  authorisedSignatoryTitleAr: 'المالك / المدير',
  email: 'rashidpvt420@gmail.com',
  phone: '+971557474560',
} as const;

/** Display name used as the heading on documents. */
export const COMPANY_DISPLAY_NAME = COMPANY_IDENTITY.brandName;

/** Party / identification clause: brand is the trading name of the licensed legal entity. */
export const COMPANY_TRADING_AS_EN =
  `${COMPANY_IDENTITY.brandName} is the trading name of ${COMPANY_IDENTITY.legalNameEn} (${COMPANY_IDENTITY.legalFormEn}), ` +
  `Licence No. ${COMPANY_IDENTITY.licenceNo}, issued by the ${COMPANY_IDENTITY.licensingAuthorityEn}.`;
export const COMPANY_TRADING_AS_AR =
  `${COMPANY_IDENTITY.brandName} هو الاسم التجاري المستخدم من قبل ${COMPANY_IDENTITY.legalNameAr} (${COMPANY_IDENTITY.legalFormAr})، ` +
  `رخصة رقم ${COMPANY_IDENTITY.licenceNo} صادرة عن ${COMPANY_IDENTITY.licensingAuthorityAr}.`;

/** Compact registration line for letterheads / footers (English). */
export const COMPANY_REGISTRATION_LINE_EN =
  `Licence ${COMPANY_IDENTITY.licenceNo} | Unified Reg. ${COMPANY_IDENTITY.unifiedRegistrationNo} | ADCCI ${COMPANY_IDENTITY.adcciNo} | ` +
  `ICP Est. ${COMPANY_IDENTITY.icpEstablishmentCardNo} | MOHRE Est. ${COMPANY_IDENTITY.mohreEstablishmentNo} | ${COMPANY_IDENTITY.registeredAddressEn}`;

/** Jurisdiction wording (owner decision 14 Oct 2026). */
export const GOVERNING_LAW_EN =
  'This Agreement is governed by the federal laws of the United Arab Emirates and, where applicable, the laws of the Emirate in which the services are performed. Subject to mandatory law, the competent onshore courts of the United Arab Emirates (federal or local, according to the place of performance) shall have jurisdiction.';
export const GOVERNING_LAW_AR =
  'تخضع هذه الاتفاقية للقوانين الاتحادية لدولة الإمارات العربية المتحدة، وعند الاقتضاء لقوانين الإمارة التي تُنفذ فيها الخدمات. ومع مراعاة القوانين الإلزامية، تختص المحاكم المختصة في دولة الإمارات العربية المتحدة (الاتحادية أو المحلية بحسب مكان التنفيذ) بالنظر في النزاعات.';
