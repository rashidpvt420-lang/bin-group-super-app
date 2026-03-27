const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

/**
 * Institutional Contract Construction Service
 * Handles payload assembly, clause snapshotting, and evidence chain hashing.
 */
class InstitutionalContractService {
    
    constructor() {
        this.terminology = {
            PROVIDER: { en: 'Service Provider', ar: 'مزود الخدمة' },
            CLIENT: { en: 'Property Owner / Client', ar: 'مالك العقار / العميل' },
            CONTRACT_TYPE: { en: 'Maintenance & Operations Agreement', ar: 'اتفاقية الصيانة والتشغيل' },
            SCOPE: { en: 'Service Scope', ar: 'نطاق الخدمة' },
            ANNUAL_FEE: { en: 'Annual Service Fee', ar: 'الرسوم السنوية للخدمة' },
            RESPONSE_TIME: { en: 'Response Time (SLA)', ar: 'زمن الاستجابة (اتفاقية مستوى الخدمة)' },
            VAT: { en: 'VAT (5%)', ar: 'ضريبة القيمة المضافة (5٪)' },
            TOTAL: { en: 'Total Annual Value', ar: 'إجمالي القيمة السنوية' },
            SIGNATURE: { en: 'Authorized Signatory', ar: 'المفوض بالتوقيع' }
        };

        this.clauseLibrary = {
            'EJARI_AUTO': {
                title_en: 'Ejari Automation & RERA Gateway',
                title_ar: 'أتمتة نظام إيجاري وبوابة ريرا',
                body_en: 'BIN-GROUP shall manage and automate all unit lease registrations via the Dubai REST/Ejari gateway.',
                body_ar: 'تلتزم شركة بن جروب بإدارة وأتمتة جميع تسجيلات عقود الإيجار عبر بوابة "دبي ريست / إيجاري".'
            },
            'AUDIT_SHIELD': {
                title_en: 'AuditShield Compliance Export',
                title_ar: 'تصدير بيانات التدقيق والامتثال',
                body_en: 'Provision of a forensic service history record and an inspection-ready digital evidence archive.',
                body_ar: 'توفير سجل تاريخي للخدمة وأرشيف أدلة رقمي جاهز لعمليات التدقيق.'
            },
            'EMERGENCY_24_7': {
                title_en: '24/7 Premium Emergency Response',
                title_ar: 'الاستجابة للطوارئ على مدار الساعة',
                body_en: 'BIN-GROUP provides round-the-clock technical dispatch. P1 responses within 60 minutes.',
                body_ar: 'توفر شركة بن جروب فريق فني للاستجابة للطوارئ على مدار الساعة. يتم التعامل مع بلاغات المستوى الأول خلال 60 دقيقة.'
            },
            'PREDICTIVE_AI': {
                title_en: 'AI-Driven Predictive Maintenance',
                title_ar: 'الصيانة التنبؤية القائمة على الذكاء الاصطناعي',
                body_en: 'Deployment of vibration and thermal sensors with AI failure detection.',
                body_ar: 'نشر مستشعرات الاهتزاز والحرارة مع نظام الذكاء الاصطناعي للكشف عن الأعطال.'
            },
            'INSTITUTIONAL_REP': {
                title_en: 'Institutional Performance Reporting',
                title_ar: 'التقارير المؤسسية للأداء',
                body_en: 'Provision of monthly board-ready reports including SLA performance and CAPEX forecasts.',
                body_ar: 'توفير تقارير شهرية جاهزة لمجلس الإدارة تشمل أداء اتفاقية مستوى الخدمة وتوقعات النفقات الرأسمالية.'
            },
            'WHITE_GLOVE_PM': {
                title_en: 'White-Glove Portfolio Manager',
                title_ar: 'مدير محفظة عقارية مخصص',
                body_en: 'Provision of a dedicated account director for executive escalation and KPI tracking.',
                body_ar: 'توفير مدير حسابات مخصص لمتابعة مؤشرات الأداء الرئيسية والتعامل مع الإدارة العليا.'
            }
        };
    }

    /**
     * Assembles a bilingual contract payload
     */
    async assembleBilingualContractPayload(quoteData, ownerDetails, language = 'BILINGUAL') {
        const contractId = `CTR-2026-${Math.floor(Math.random() * 9000) + 1000}`;
        const timestamp = new Date().toISOString();

        // 1. Snapshot Clauses in requested language
        const clauses = quoteData.addons.map(a => {
            const lib = this.clauseLibrary[a.code] || {
                title_en: a.name,
                title_ar: a.name, // Fallback to EN name if AR title missing
                body_en: a.clause,
                body_ar: a.clause
            };

            return {
                code: a.code,
                title: language === 'AR' ? lib.title_ar : (language === 'BILINGUAL' ? { en: lib.title_en, ar: lib.title_ar } : lib.title_en),
                body: language === 'AR' ? lib.body_ar : (language === 'BILINGUAL' ? { en: lib.body_en, ar: lib.body_ar } : lib.body_en)
            };
        });

        // 2. Assemble Master Payload
        const payload = {
            contractMeta: {
                contractNumber: contractId,
                issueDate: timestamp,
                language: language,
                termMonths: 12,
                currency: 'AED',
                terminology: this.terminology
            },
            property: {
                name_en: quoteData.inputs.subType || "Managed Asset",
                name_ar: "عقار مدار",
                type: quoteData.inputs.propertyType,
                emirate: quoteData.inputs.emirate
            },
            commercial: {
                baseAnnual: quoteData.financials.basePrice,
                addonsSubtotal: quoteData.financials.addonsPrice,
                vat: quoteData.financials.vat,
                totalValue: quoteData.financials.annualPrice
            },
            clauses: clauses,
            evidence: {
                quoteRef: quoteData.inputs.generatedAt,
                forensicHash: this.generateIntegrityHash(contractId, quoteData.financials.annualPrice),
                version: "1.1.0"
            }
        };

        return payload;
    }

    async generateContractDraft(contractPayload) {
        // Generate separate hashes for each language variant
        const languageHashes = {
            en: this.generateIntegrityHash(`${contractPayload.id}-EN`, contractPayload.commercial.totalValue),
            ar: this.generateIntegrityHash(`${contractPayload.id}-AR`, contractPayload.commercial.totalValue),
            bilingual: this.generateIntegrityHash(`${contractPayload.id}-BILINGUAL`, contractPayload.commercial.totalValue)
        };

        return {
            success: true,
            contractId: contractPayload.id,
            language: contractPayload.language,
            storagePath: `contracts/${contractPayload.id}/${contractPayload.language}_v1.pdf`,
            hashes: languageHashes,
            forensicIntegrityHash: languageHashes[contractPayload.language.toLowerCase()] || languageHashes.bilingual,
            status: 'PENDING_SIGNATURE',
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = new InstitutionalContractService();
