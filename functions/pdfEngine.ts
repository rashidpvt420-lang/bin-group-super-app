import PDFDocument from 'pdfkit';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'crypto';
import https from 'https';
// @ts-ignore
import arabicReshaper from 'arabic-persian-reshaper';

const reshap = (arabicReshaper as any)?.ArabicReshaper || arabicReshaper;

let cachedCairoFont: Buffer | null = null;

async function getCairoFont(): Promise<Buffer> {
    if (cachedCairoFont) return cachedCairoFont;
    
    const fontUrl = 'https://fonts.gstatic.com/s/cairo/v20/SLXQ1O5tq8QA3r565Uq13w.ttf';
    
    return new Promise<Buffer>((resolve, reject) => {
        https.get(fontUrl, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Failed to download font: status ${res.statusCode}`));
                return;
            }
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                cachedCairoFont = Buffer.concat(chunks);
                resolve(cachedCairoFont);
            });
            res.on('error', reject);
        }).on('error', reject);
    });
}

function isArabic(text: string): boolean {
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    return arabicRegex.test(text);
}

function shapeArabicText(text: string): string {
    if (!text || !isArabic(text)) return text;
    try {
        const shaped = typeof reshap?.reshape === 'function' ? reshap.reshape(text) : text;
        return shaped.split('').reverse().join('');
    } catch (e) {
        console.error("Shaping failed:", e);
        return text;
    }
}

function shapeBilingualText(text: string): string {
    if (!text) return text;
    const str = String(text);
    if (str.includes(' / ')) {
        const parts = str.split(' / ');
        return parts.map(part => isArabic(part) ? shapeArabicText(part) : part).join(' / ');
    }
    if (str.includes(' : ')) {
        const parts = str.split(' : ');
        return parts.map(part => isArabic(part) ? shapeArabicText(part) : part).join(' : ');
    }
    return isArabic(str) ? shapeArabicText(str) : str;
}


const GOLD = '#C6A75E';
const INK = '#111827';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';
const AGREEMENT_VERSION = 'BIN-GROUP-OWNER-AGREEMENT-v1.0';

function money(value: any) {
    const amount = Number(value || 0);
    return `AED ${amount.toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;
}

function textValue(value: any, fallback = '---') {
    const text = String(value ?? '').trim();
    return text || fallback;
}

function asDate(value: any): Date | null {
    if (!value) return null;
    if (typeof value?.toDate === "function") return value.toDate();
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "string" || typeof value === "number") {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    if (typeof value === "object" && Number.isFinite(Number(value.seconds))) {
        const parsed = new Date(Number(value.seconds) * 1000);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return null;
}

function addMonthsPreservingTime(date: Date, months: number): Date {
    const copy = new Date(date.getTime());
    copy.setMonth(copy.getMonth() + months);
    return copy;
}

function normalizeContractMode(data: any) {
    const raw = String(data.contractMode || data.contractType || data.planName || data.strategy || '').toLowerCase();
    if (raw.includes('property') && !raw.includes('maintenance')) return 'PROPERTY_MANAGEMENT_ONLY';
    if (raw.includes('pm') && !raw.includes('fm')) return 'PROPERTY_MANAGEMENT_ONLY';
    if (raw.includes('maintenance') && raw.includes('property')) return 'MAINTENANCE_AND_PROPERTY_MANAGEMENT';
    if (raw.includes('hybrid') || raw.includes('combined') || raw.includes('full')) return 'MAINTENANCE_AND_PROPERTY_MANAGEMENT';
    if (raw.includes('fm') || raw.includes('maintenance')) return 'MAINTENANCE_ONLY';
    return data.propertyManagementIncluded ? 'MAINTENANCE_AND_PROPERTY_MANAGEMENT' : 'MAINTENANCE_ONLY';
}

function contractModeLabel(mode: string) {
    switch (mode) {
        case 'PROPERTY_MANAGEMENT_ONLY':
            return 'Property Management Only / إدارة العقار فقط';
        case 'MAINTENANCE_AND_PROPERTY_MANAGEMENT':
            return 'Maintenance + Property Management / الصيانة وإدارة العقار معاً';
        default:
            return 'Maintenance Only / الصيانة فقط';
    }
}

function getScopeDetails(mode: string) {
    if (mode === 'PROPERTY_MANAGEMENT_ONLY') {
        return {
            titleEn: 'Property Management Only',
            titleAr: 'إدارة العقار فقط',
            coveredEn: [
                'Tenant coordination and owner reporting',
                'Rent/payment follow-up workflow',
                'Lease and document coordination support',
                'Owner dashboard governance records'
            ],
            coveredAr: [
                'التنسيق مع المستأجرين وتقارير المالك',
                'متابعة الإيجار وسير عمل الدفعات',
                'عقود الإيجار ودعم تنسيق المستندات',
                'سجلات حوكمة لوحة تحكم المالك'
            ],
            notCoveredEn: [
                'Facility repairs and maintenance labour',
                'Materials, spare parts, and replacement assets',
                'Capital works or authority fees',
                'Emergency technical callouts unless separately approved'
            ],
            notCoveredAr: [
                'إصلاحات المرافق وأجور عمالة الصيانة',
                'المواد، قطع الغيار، واستبدال الأصول',
                'الأعمال الرأسمالية أو رسوم الجهات الحكومية',
                'بلاغات الطوارئ الفنية ما لم تتم الموافقة عليها بشكل منفصل'
            ]
        };
    } else if (mode === 'MAINTENANCE_AND_PROPERTY_MANAGEMENT') {
        return {
            titleEn: 'Property Management + Facility Maintenance',
            titleAr: 'إدارة العقارات وصيانة المرافق معاً',
            coveredEn: [
                'Property management coordination',
                'Facility maintenance ticket handling',
                'Preventive maintenance planning',
                'Technician/contractor dispatch governance',
                'Owner dashboard and property passport records'
            ],
            coveredAr: [
                'تنسيق إدارة العقار',
                'معالجة بلاغات صيانة المرافق',
                'تخطيط الصيانة الوقائية',
                'حوكمة توجيه الفنيين/المقاولين',
                'سجلات لوحة تحكم المالك وجواز سفر العقار'
            ],
            notCoveredEn: [
                'Major capital works without separate quotation',
                'Authority fines, permits, or government fees',
                'Major material replacement not included in the package',
                'Owner-requested upgrades outside approved scope'
            ],
            notCoveredAr: [
                'الأعمال الرأسمالية الكبرى بدون عرض سعر منفصل',
                'غرامات الجهات أو التصاريح أو الرسوم الحكومية',
                'استبدال المواد الكبرى غير المشمولة في الباقة',
                'الترقيات المطلوبة من المالك خارج النطاق المعتمد'
            ]
        };
    } else {
        return {
            titleEn: 'Maintenance Contract Only',
            titleAr: 'عقد الصيانة فقط',
            coveredEn: [
                'Corrective maintenance request handling',
                'Preventive maintenance scheduling',
                'Emergency triage according to SLA',
                'Before/after evidence where applicable',
                'Admin-supervised technician coordination'
            ],
            coveredAr: [
                'معالجة طلبات الصيانة التصحيحية',
                'جدولة الصيانة الوقائية',
                'فرز حالات الطوارئ وفقاً لاتفاقية مستوى الخدمة',
                'توثيق ما قبل وما بعد العمل عند الاقتضاء',
                'تنسيق الفنيين تحت إشراف الإدارة'
            ],
            notCoveredEn: [
                'Property management, rent collection, or tenant leasing',
                'Major capital works without separate quotation',
                'Authority fines, permits, or government fees',
                'Materials and spare parts unless included in package'
            ],
            notCoveredAr: [
                'إدارة العقارات، تحصيل الإيجار، أو تأجير المستأجرين',
                'الأعمال الرأسمالية الكبرى بدون عرض سعر منفصل',
                'غرامات الجهات أو التصاريح أو الرسوم الحكومية',
                'المواد وقطع الغيار ما لم تكن مشمولة في الباقة'
            ]
        };
    }
}

function section(doc: PDFKit.PDFDocument, titleEn: string, titleAr: string) {
    if (doc.y > 690) doc.addPage();
    doc.moveDown(0.9);
    doc.fillColor(GOLD).fontSize(12).text(titleEn.toUpperCase(), { continued: false });
    doc.fillColor(MUTED).fontSize(9).text(shapeArabicText(titleAr), { align: 'right' });
    doc.moveDown(0.35);
    doc.strokeColor(BORDER).lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.45);
}

function para(doc: PDFKit.PDFDocument, en: string, ar: string) {
    if (doc.y > 705) doc.addPage();
    doc.fillColor(INK).fontSize(8.7).text(en, { align: 'justify', lineGap: 2 });
    doc.moveDown(0.25);
    doc.fillColor(MUTED).fontSize(8.3).text(shapeArabicText(ar), { align: 'right', lineGap: 2 });
    doc.moveDown(0.5);
}

function row(doc: PDFKit.PDFDocument, label: string, value: string) {
    if (doc.y > 720) doc.addPage();
    const y = doc.y;
    doc.fillColor(MUTED).fontSize(8).text(shapeBilingualText(label), 55, y, { width: 165 });
    doc.fillColor(INK).fontSize(9.5).text(shapeBilingualText(value), 220, y, { width: 315 });
    doc.moveDown(0.65);
}

function safeArray(value: any): string {
    if (Array.isArray(value)) return value.filter(Boolean).join(', ') || '---';
    return textValue(value);
}

async function savePdf(buffer: Buffer, path: string, metadata: Record<string, any>) {
    const storage = getStorage();
    const bucket = storage.bucket();
    const file = bucket.file(path);
    await file.save(buffer, {
        contentType: 'application/pdf',
        metadata: { metadata }
    });
    const url = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });
    return url[0];
}

/**
 * Full bilingual owner service agreement PDF generator.
 * This replaces the old short contract summary so the owner signs/downloads
 * the same protective English/Arabic agreement stored in the document vault.
 */
export async function generateContractPDF(data: any) {
    let fontBuffer: Buffer | null = null;
    try {
        fontBuffer = await getCairoFont();
    } catch (err) {
        console.error("Cairo font load failed:", err);
    }

    return new Promise<string>((resolve, reject) => {
        const contractMode = normalizeContractMode(data);
        const contractId = textValue(data.contractId || data.id || `contract-${Date.now()}`);
        const propertyType = textValue(data.propertyType || data.assetClass || data.buildingType || 'property');
        const propertyId = textValue(data.propertyId || data.propertyPassportId || data.passportId, '');
        const ownerId = textValue(data.ownerId || data.uid, '');
        const propertyPassportId = textValue(data.propertyPassportId || data.passportId || propertyId, '');
        const documentHash = crypto.createHash('sha256').update(JSON.stringify({ contractId, ownerId, propertyId, contractMode, version: AGREEMENT_VERSION, signedAt: data.signedAt || data.acceptedAt || new Date().toISOString() })).digest('hex');

        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            info: { Title: '13-Month Owner Service Agreement', Author: 'BIN GROUP Super App' }
        });

        if (fontBuffer) {
            try {
                doc.registerFont('Cairo', fontBuffer);
                doc.font('Cairo');
            } catch (err) {
                console.error("Font registration failed:", err);
            }
        }

        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('error', reject);
        doc.on('end', async () => {
            try {
                const buffer = Buffer.concat(chunks);
                const url = await savePdf(buffer, `contracts/${contractId}/owner-service-agreement-${AGREEMENT_VERSION}.pdf`, {
                    ownerId,
                    propertyId,
                    propertyPassportId,
                    contractId,
                    contractMode,
                    propertyType,
                    language: 'en-ar',
                    version: AGREEMENT_VERSION,
                    documentType: 'full_owner_service_agreement',
                    documentHash,
                    signedBy: textValue(data.signatureName || data.ownerName || data.fullName, ''),
                    signedAt: textValue(data.signedAt || data.acceptedAt || new Date().toISOString(), '')
                });
                resolve(url);
            } catch (err) {
                reject(err);
            }
        });

        doc.fillColor(GOLD).fontSize(24).text('BIN GROUP L.L.C - S.P.C', { align: 'center' });
        doc.fillColor(INK).fontSize(10).text('13-MONTH OWNER SERVICE AGREEMENT', { align: 'center' });
        doc.fillColor(MUTED).fontSize(9).text(shapeArabicText('اتفاقية خدمات المالك لمدة 13 شهراً'), { align: 'center' });
        doc.moveDown(0.6);
        doc.fillColor(MUTED).fontSize(7).text(`Version: ${AGREEMENT_VERSION} | Contract ID: ${contractId} | Hash: ${documentHash.slice(0, 20)}...`, { align: 'center' });
        doc.moveDown(0.9);
        doc.rect(50, doc.y, 495, 2).fill(GOLD);
        doc.moveDown(1.0);

        section(doc, '1. Contract Cover', 'غلاف العقد');
        row(doc, 'Agreement Date / تاريخ الاتفاقية', new Date().toLocaleDateString('en-AE'));
        row(doc, 'Owner / المالك', textValue(data.ownerName || data.fullName || data.signatureName));
        row(doc, 'Owner Email / بريد المالك', textValue(data.ownerEmail || data.email));
        row(doc, 'Company / الشركة', textValue(data.companyName || data.entityName || 'Private Owner'));
        row(doc, 'Service Provider / مقدم الخدمة', 'BIN GROUP L.L.C - S.P.C');
        row(doc, 'Contract Mode / نوع العقد', contractModeLabel(contractMode));

        const start = asDate(data.effectiveFrom || data.validFrom || data.startedAt || data.ownerSignature?.signedAt || data.ownerSignedAt || data.signedAt);
        if (start) {
            const end = addMonthsPreservingTime(start, 13);
            row(doc, 'Contract Term / مدة العقد', `13 Months: ${start.toLocaleDateString('en-AE')} to ${end.toLocaleDateString('en-AE')} / مستمر لمدة 13 شهراً`);
        } else {
            row(doc, 'Contract Term / مدة العقد', 'Continuous until expiry/termination / مستمر حتى انتهاء العقد أو فسخه');
        }

        section(doc, '2. Property and Submitted Details', 'بيانات العقار والمستندات المقدمة');
        row(doc, 'Property Name / اسم العقار', textValue(data.propertyName || data.propertyTitle || data.address));
        row(doc, 'Property Type / نوع العقار', propertyType);
        row(doc, 'Emirate / الإمارة', textValue(data.emirate));
        row(doc, 'Address / العنوان', textValue(data.address || data.location || data.formattedAddress));
        row(doc, 'Title Deed / سند الملكية', textValue(data.titleDeedReference || data.titleDeedNo || data.deedNumber));
        row(doc, 'GPS / إحداثيات الموقع', textValue(data.gpsCoordinates || data.coordinates || (data.lat && data.lng ? `${data.lat}, ${data.lng}` : '---')));
        row(doc, 'Units / الوحدات', textValue(data.units || data.totalUnits || data.unitCount));
        row(doc, 'Floors / الطوابق', textValue(data.floors || data.floorCount));
        row(doc, 'Tenants / المستأجرون', safeArray(data.tenants || data.tenantSummary));
        row(doc, 'Authorized Reporters / المبلغون المعتمدون', safeArray(data.authorizedReporters || data.reporters));

        section(doc, '3. Commercial Terms', 'الشروط التجارية');
        row(doc, 'Package / الباقة', textValue(data.servicePackage || data.planName || data.contractType));
        row(doc, 'Annual Value / القيمة السنوية', money(data.annualValue || data.totalAnnualValue || data.estimatedAnnualValue));
        row(doc, 'Mobilization / Activation / التفعيل', money(data.mobilizationFee || data.mobilizationAmount || data.upfrontAmount));
        row(doc, 'Payment Plan / خطة السداد', textValue(data.paymentPlan || data.billingFrequency));
        row(doc, 'VAT / ضريبة القيمة المضافة', textValue(data.vatTreatment || 'VAT applies where legally required'));

        section(doc, '4. Contract Mode Matrix', 'مصفوفة نوع العقد');
        const details = getScopeDetails(contractMode);
        if (contractMode === 'MAINTENANCE_ONLY') {
            para(doc,
                'Maintenance Only: BIN GROUP is responsible only for agreed maintenance services, complaint handling, technician dispatch, service evidence, and maintenance reporting. Rent collection, lease management, tenancy disputes, eviction support, broker management, and tenant financial ledgers are excluded unless separately contracted.',
                'الصيانة فقط: تكون مسؤولية مجموعة بن محصورة في خدمات الصيانة المتفق عليها، وإدارة البلاغات، وتوجيه الفنيين، وتوثيق الخدمة، وتقارير الصيانة. ولا تشمل تحصيل الإيجار أو إدارة عقود الإيجار أو نزاعات المستأجرين أو الإخلاء أو إدارة الوسطاء أو دفاتر حسابات المستأجرين إلا باتفاق منفصل.'
            );
        } else if (contractMode === 'PROPERTY_MANAGEMENT_ONLY') {
            para(doc,
                'Property Management Only: BIN GROUP is responsible only for agreed property administration, occupancy visibility, tenant records, document coordination, owner reporting, and rent/ledger visibility where included. Physical repairs, replacement parts, emergency maintenance, technician dispatch, and contractor costs are excluded unless separately approved and paid.',
                'إدارة العقار فقط: تكون مسؤولية مجموعة بن محصورة في الإدارة العقارية المتفق عليها، ومتابعة الإشغال، وسجلات المستأجرين، وتنسيق المستندات، وتقارير المالك، وعرض الإيجارات والدفعات عند شمولها. ولا تشمل الإصلاحات الفعلية أو قطع الغيار أو الصيانة الطارئة أو توجيه الفنيين أو تكاليف المقاولين إلا بعد الموافقة والسداد بشكل منفصل.'
            );
        } else {
            para(doc,
                'Maintenance + Property Management: BIN GROUP may provide both operational maintenance and property management according to the approved package, service schedule, SLA tier, exclusions, and payment plan.',
                'الصيانة وإدارة العقار معاً: يجوز لمجموعة بن تقديم خدمات الصيانة التشغيلية وإدارة العقار وفقاً للباقة المعتمدة وجدول الخدمات ومستوى الخدمة والاستثناءات وخطة السداد.'
            );
        }

        const startForWindow = start || new Date();
        const firstMonthEnds = addMonthsPreservingTime(startForWindow, 1);
        para(doc,
            `Cancellation / Upgrade Window: During the first month from the digital signature timestamp (until ${firstMonthEnds.toLocaleDateString('en-AE')}), the Owner may request cancellation or upgrade. Cancellation or upgrade requires BIN GROUP admin review of onboarding, payment, inspection, and consumed services.`,
            `فترة الإلغاء أو الترقية: خلال الشهر الأول من تاريخ التوقيع الرقمي (حتى ${firstMonthEnds.toLocaleDateString('en-AE')})، يجوز للمالك تقديم طلب إلغاء العقد أو ترقية الباقة. ويتطلب إلغاء العقد أو الترقية مراجعة إدارية من مجموعة بن لبيانات البدء، والدفعات، والفحوصات، والخدمات المستهلكة.`
        );

        section(doc, '5. Institutional and Non-Tenant Property Logic', 'منطق العقارات المؤسسية وغير القائمة على المستأجرين');
        para(doc,
            'For Majlis, government buildings, hospitals, schools, universities, malls, hotels, staff accommodation, community facilities, and similar non-standard properties, the system may use Authorized Reporters instead of tenant leases. Reporters may submit complaints, incidents, photos, facility observations, and service requests, but they do not receive tenancy, ownership, employment, payment, or agency rights through the platform.',
            'بالنسبة للمجالس والمباني الحكومية والمستشفيات والمدارس والجامعات والمراكز التجارية والفنادق وسكن الموظفين والمرافق المجتمعية وما يماثلها، يجوز للنظام استخدام مبلغين معتمدين بدلاً من عقود المستأجرين. ويجوز للمبلغين تقديم البلاغات والحوادث والصور والملاحظات وطلبات الخدمة، ولا يكتسبون حقوق إيجار أو ملكية أو عمل أو دفع أو وكالة من خلال المنصة.'
        );

        section(doc, '6. Scope of Work (Covered Services)', 'نطاق العمل (الخدمات المشمولة)');
        para(doc,
            `Covered Services under ${details.titleEn}:\n` + details.coveredEn.map(item => `• ${item}`).join('\n'),
            `الخدمات المشمولة بموجب ${details.titleAr}:\n` + details.coveredAr.map(item => `• ${item}`).join('\n')
        );

        const selectedAddOns = data.selectedAddOns || [];
        if (selectedAddOns.length) {
            const addOnsList = selectedAddOns.map((item: any) => typeof item === 'string' ? item : (item?.name || item?.title || '')).filter(Boolean);
            if (addOnsList.length) {
                para(doc,
                    'Selected Add-ons:\n' + addOnsList.map((item: string) => `• ${item}`).join('\n'),
                    'الإضافات المختارة:\n' + addOnsList.map((item: string) => `• ${item}`).join('\n')
                );
            }
        }

        section(doc, '7. Owner Obligations', 'التزامات المالك');
        para(doc,
            'The Owner must provide true and complete property, title deed, tenancy, occupancy, access, and payment information; maintain authority to contract; provide safe access; pay agreed fees, VAT, government charges, third-party costs, materials, emergency costs, and approved variations; obtain required consents; and ensure tenants, residents, staff, guards, delegates, and authorized reporters comply with platform rules.',
            'يلتزم المالك بتقديم معلومات صحيحة وكاملة عن العقار وسند الملكية والإيجارات والإشغال والدخول والدفع؛ والاحتفاظ بصلاحية التعاقد؛ وتوفير دخول آمن؛ وسداد الرسوم المتفق عليها وضريبة القيمة المضافة والرسوم الحكومية وتكاليف الأطراف الثالثة والمواد والتكاليف الطارئة والتغييرات المعتمدة؛ والحصول على الموافقات اللازمة؛ وضمان التزام المستأجرين والمقيمين والموظفين والحراس والمندوبين والمبلغين المعتمدين بقواعد المنصة.'
        );

        section(doc, '8. Digital Evidence and AI/System Disclaimer', 'الإثبات الرقمي وإخلاء مسؤولية الذكاء الاصطناعي والنظام');
        para(doc,
            'BIN GROUP may generate, store, timestamp, hash, and retain contracts, quotations, invoices, property passports, tickets, photos, approvals, signatures, GPS logs, audit logs, and service evidence in its Document Vault. AI recommendations, classifications, pricing suggestions, risk scores, and dashboard insights are decision-support tools only and do not replace legal, engineering, tax, accounting, valuation, insurance, or authority advice.',
            'يجوز لمجموعة بن إنشاء وتخزين وختم وحفظ العقود وعروض الأسعار والفواتير وجوازات العقار والتذاكر والصور والموافقات والتوقيعات وسجلات الموقع وسجلات التدقيق وإثباتات الخدمة في خزنة المستندات. وتُعد توصيات الذكاء الاصطناعي والتصنيفات واقتراحات الأسعار ودرجات المخاطر ومؤشرات لوحات التحكم أدوات مساعدة لاتخاذ القرار فقط ولا تغني عن الاستشارة القانونية أو الهندسية أو الضريبية أو المحاسبية أو التقييمية أو التأمينية أو موافقات الجهات.'
        );

        section(doc, '9. Payment, VAT, Suspension, and Collection', 'الدفع والضريبة والتعليق والتحصيل');
        para(doc,
            'The Owner shall pay all agreed fees according to the accepted quotation and payment plan. BIN GROUP may suspend services, dashboards, tenant invitations, technician dispatch, approvals, document issuance, or contract activation if payments are overdue, reversed, disputed without valid basis, charged back, or incomplete.',
            'يلتزم المالك بسداد جميع الرسوم المتفق عليها وفقاً لعرض السعر المقبول وخطة السداد. ويجوز لمجموعة بن تعليق الخدمات أو لوحات التحكم أو دعوات المستأجرين أو توجيه الفنيين أو الموافقات أو إصدار المستندات أو تفعيل العقد إذا كانت الدفعات متأخرة أو معكوسة أو محل نزاع دون أساس صحيح أو مستردة أو غير مكتملة.'
        );

        section(doc, '10. Exclusions (Not Covered)', 'الاستثناءات (البنود غير المشمولة)');
        para(doc,
            `Excluded Items under ${details.titleEn}:\n` + details.notCoveredEn.map(item => `• ${item}`).join('\n'),
            `البنود غير المشمولة بموجب ${details.titleAr}:\n` + details.notCoveredAr.map(item => `• ${item}`).join('\n')
        );

        section(doc, '11. Limitation of Liability and Indemnity', 'حدود المسؤولية والتعويض');
        para(doc,
            'To the maximum extent permitted by UAE law, BIN GROUP total aggregate liability arising out of or related to this Agreement shall not exceed the fees actually paid by the Owner to BIN GROUP during the preceding twelve months for the specific service giving rise to the claim. The Owner shall indemnify BIN GROUP against claims arising from inaccurate information, lack of authority or access, misuse of the platform, pre-existing defects, unsafe conditions, unlawful instructions, unpaid charges, third-party acts, or Owner breach.',
            'إلى الحد الأقصى المسموح به بموجب قانون دولة الإمارات، لا تتجاوز المسؤولية الإجمالية لمجموعة بن الناشئة عن هذه الاتفاقية أو المتعلقة بها الرسوم التي دفعها المالك فعلياً إلى مجموعة بن خلال الاثني عشر شهراً السابقة عن الخدمة المحددة التي نشأ عنها الادعاء. ويلتزم المالك بتعويض مجموعة بن عن المطالبات الناشئة عن المعلومات غير الدقيقة أو عدم وجود الصلاحية أو الدخول أو إساءة استخدام المنصة أو العيوب السابقة أو الظروف غير الآمنة أو التعليمات غير القانونية أو الرسوم غير المسددة أو تصرفات الأطراف الثالثة أو إخلال المالك.'
        );

        section(doc, '12. Confidentiality and Data Protection', 'السرية وحماية البيانات');
        para(doc,
            'Each Party shall keep confidential all non-public information including pricing, systems, credentials, property records, tenant data, financial data, technical reports, platform logic, dashboards, business methods, and operational procedures. The Owner shall not share screenshots, access, pricing logic, workflows, or confidential BIN GROUP materials with competitors or unauthorized third parties without written approval.',
            'يلتزم كل طرف بالحفاظ على سرية المعلومات غير العامة بما في ذلك الأسعار والأنظمة وبيانات الدخول وسجلات العقار وبيانات المستأجرين والبيانات المالية والتقارير الفنية ومنطق المنصة ولوحات التحكم وطرق العمل والإجراءات التشغيلية. ولا يجوز للمالك مشاركة لقطات الشاشة أو صلاحيات الدخول أو منطق الأسعار أو سير العمل أو المواد السرية الخاصة بمجموعة بن مع المنافسين أو أطراف غير مصرح لهم دون موافقة خطية.'
        );

        section(doc, '13. Termination, Force Majeure, and No Agency', 'الإنهاء والقوة القاهرة وعدم الوكالة');
        para(doc,
            'BIN GROUP may suspend or terminate services for non-payment, misuse, false documents, unsafe conditions, obstruction, confidentiality breach, or material breach. Neither Party is liable for delay caused by events beyond reasonable control. Nothing in this Agreement creates partnership, employment, fiduciary duty, commercial agency, legal agency, or exclusive representation unless expressly agreed in writing.',
            'يجوز لمجموعة بن تعليق أو إنهاء الخدمات بسبب عدم السداد أو إساءة الاستخدام أو المستندات غير الصحيحة أو الظروف غير الآمنة أو العرقلة أو خرق السرية أو الإخلال الجوهري. ولا يكون أي طرف مسؤولاً عن التأخير الناتج عن أحداث خارجة عن السيطرة المعقولة. ولا ينشئ أي نص في هذه الاتفاقية شراكة أو علاقة عمل أو واجب أمانة أو وكالة تجارية أو وكالة قانونية أو تمثيلاً حصرياً إلا باتفاق خطي صريح.'
        );

        section(doc, '14. Governing Law, Jurisdiction, and Language', 'القانون الحاكم والاختصاص واللغة');
        para(doc,
            'This Agreement is governed by the laws of the United Arab Emirates as applicable in the Emirate of Abu Dhabi, unless another jurisdiction is expressly agreed in writing. Subject to mandatory law, Abu Dhabi Courts shall have jurisdiction. This Agreement is prepared in English and Arabic. If there is any conflict, the Arabic text shall prevail before UAE mainland courts unless the Parties agree otherwise in a signed addendum.',
            'تخضع هذه الاتفاقية لقوانين دولة الإمارات العربية المتحدة كما هي مطبقة في إمارة أبوظبي، ما لم يتم الاتفاق صراحةً كتابةً على اختصاص آخر. ومع مراعاة القوانين الإلزامية، تختص محاكم أبوظبي بالنظر في النزاعات. تم إعداد هذه الاتفاقية باللغتين الإنجليزية والعربية، وفي حال وجود أي تعارض يسود النص العربي أمام محاكم دولة الإمارات البرية ما لم يتفق الطرفان على خلاف ذلك في ملحق موقع.'
        );

        section(doc, '15. Digital Acceptance and Signatures', 'القبول الرقمي والتوقيعات');
        para(doc,
            'By typing the legal name, accepting the checkbox, paying the activation amount, or approving through the BIN GROUP platform, the Owner confirms that the Owner has read, understood, and accepted this full bilingual Owner Service Agreement. The generated PDF is the locked executed copy for Owner, Company, Property, Property Passport, and audit records.',
            'بكتابة الاسم القانوني أو قبول خانة الموافقة أو سداد مبلغ التفعيل أو الاعتماد عبر منصة مجموعة بن، يؤكد المالك أنه قرأ وفهم ووافق على هذه الاتفاقية الكاملة ثنائية اللغة لخدمات المالك. ويُعد ملف PDF الناتج النسخة المنفذة والمقفلة لسجلات المالك والشركة والعقار وجواز العقار والتدقيق.'
        );

        const y = doc.y > 650 ? 100 : doc.y + 20;
        if (doc.y > 650) doc.addPage();
        doc.strokeColor('#9CA3AF').lineWidth(1).moveTo(55, y + 45).lineTo(240, y + 45).stroke();
        doc.strokeColor('#9CA3AF').moveTo(350, y + 45).lineTo(535, y + 45).stroke();
        doc.fillColor(INK).fontSize(8).text(`OWNER: ${textValue(data.signatureName || data.ownerName || data.fullName)}`, 55, y + 55, { width: 190 });
        doc.text('BIN GROUP AUTHORIZED SIGNATORY', 350, y + 55, { width: 190 });

        const signedAtStr = data.ownerSignedAt || data.signedAt || data.acceptedAt || data.ownerSignature?.signedAt;
        if (signedAtStr) {
            const formattedDate = new Date(signedAtStr).toLocaleString('en-AE');
            doc.fillColor(MUTED).fontSize(7).text(`Signed electronically at: ${formattedDate}`, 55, y + 68, { width: 190 });
        }

        const binGroupStamp = data.binGroupStamp;
        if (binGroupStamp?.stamped) {
            doc.fillColor(GOLD).fontSize(7).text(String(binGroupStamp.label || 'BIN GROUP ADMIN APPROVED / DIGITAL STAMP'), 350, y + 25, { width: 190, align: 'center' });
            const stampDate = binGroupStamp.stampedAtIso || (binGroupStamp.stampedAt ? new Date(binGroupStamp.stampedAt).toISOString() : new Date().toISOString());
            doc.fillColor(MUTED).fontSize(6).text(`Approved By: ${binGroupStamp.stampedBy} at ${stampDate}`, 350, y + 35, { width: 190, align: 'center' });
        }

        doc.fillColor(MUTED).fontSize(7).text(`Digitally generated and stored by BIN GROUP Super App. Hash: ${documentHash}`, 55, y + 85, { width: 480, align: 'center' });

        doc.end();
    });
}

export async function generatePayslipPDF(data: any) {
    let fontBuffer: Buffer | null = null;
    try {
        fontBuffer = await getCairoFont();
    } catch (err) {
        console.error("Cairo font load failed for payslip:", err);
    }

    return new Promise<string>((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        if (fontBuffer) {
            try {
                doc.registerFont('Cairo', fontBuffer);
                doc.font('Cairo');
            } catch (err) {
                console.error("Font registration failed for payslip:", err);
            }
        }
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('error', reject);
        doc.on('end', async () => {
            try {
                const buffer = Buffer.concat(chunks);
                const url = await savePdf(buffer, `payslips/${data.staffId}/${data.payPeriod}.pdf`, {
                    staffId: textValue(data.staffId, ''),
                    payPeriod: textValue(data.payPeriod, '')
                });
                resolve(url);
            } catch (err) {
                reject(err);
            }
        });

        doc.fillColor(GOLD).fontSize(20).text('BIN GROUP - PAY ADVICE', { align: 'center' }).moveDown(2);
        doc.fillColor(INK).fontSize(12).text(`Staff Name: ${textValue(data.staffName)}`);
        doc.text(`Employee ID: ${textValue(data.staffId)}`);
        doc.text(`Position: ${textValue(data.position)}`).moveDown(1);
        doc.text(`Pay Period: ${textValue(data.payPeriod)}`);
        doc.text(`Payment Date: ${textValue(data.paymentDate)}`).moveDown(2);
        doc.rect(50, 220, 500, 1).fill('#EEE');
        doc.moveDown(1);
        doc.fontSize(11).text('DESCRIPTION', 50, 240);
        doc.text('AMOUNT (AED)', 400, 240, { align: 'right' }).moveDown(1);
        doc.fontSize(10).text('Basic Salary', 50, 270);
        doc.text(Number(data.basicSalary || 0).toLocaleString(), 400, 270, { align: 'right' });
        doc.text('Allowances', 50, 290);
        doc.text(Number(data.allowances || 0).toLocaleString(), 400, 290, { align: 'right' });
        doc.text('Overtime', 50, 310);
        doc.text(Number(data.overtime || 0).toLocaleString(), 400, 310, { align: 'right' });
        doc.fillColor('#ff4d4d').text('Deductions', 50, 330);
        doc.text(`(${Number(data.deductions || 0).toLocaleString()})`, 400, 330, { align: 'right' });
        doc.rect(50, 360, 500, 2).fill(GOLD);
        doc.fillColor(INK).fontSize(14).text('NET SALARY', 50, 380);
        doc.text(money(data.netSalary), 400, 380, { align: 'right' });
        doc.end();
    });
}
