const fs = require('fs');

const filePath = 'packages/shared/src/context/LanguageContext.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Extract the 'en' object
const enMatch = content.match(/en:\s*({[\s\S]*?}),\s*ar:/);
if (!enMatch) {
    console.error("Could not find 'en' object");
    process.exit(1);
}

// Quick and dirty eval to get the object
let enObj;
eval(`enObj = ${enMatch[1]}`);

// Translation mapping rules
const translate = (text) => {
    if (!text) return text;
    let t = text;
    // Replace specific terms
    t = t.replace(/BIN-Groups/g, 'مجموعة بن');
    t = t.replace(/BIN-GROUP/g, 'مجموعة بن');
    t = t.replace(/BINCONSTRUCTION/g, 'بن للإنشاءات');
    t = t.replace(/Sovereign/g, 'سيادي');
    t = t.replace(/sovereign/gi, 'سيادي');
    t = t.replace(/Institutional/g, 'مؤسسي');
    t = t.replace(/Maintenance/g, 'صيانة');
    t = t.replace(/Technician/g, 'فني');
    t = t.replace(/Dashboard/g, 'لوحة القيادة');
    t = t.replace(/Financials?/g, 'المالية');
    t = t.replace(/Onboarding/g, 'التسجيل');
    t = t.replace(/Mission/g, 'مهمة');
    t = t.replace(/Audit/g, 'تدقيق');
    t = t.replace(/Brokers/g, 'وسطاء');
    t = t.replace(/Reports/g, 'تقارير');
    t = t.replace(/Asset/g, 'أصل');
    t = t.replace(/Property/g, 'عقار');
    t = t.replace(/Tenant/g, 'مستأجر');
    t = t.replace(/Owner/g, 'مالك');
    t = t.replace(/Contract/g, 'عقد');
    t = t.replace(/Quote/g, 'عرض سعر');
    t = t.replace(/Invoice/g, 'فاتورة');
    t = t.replace(/Payment/g, 'دفع');
    t = t.replace(/Terms of Service/g, 'شروط الخدمة');
    t = t.replace(/Privacy Policy/g, 'سياسة الخصوصية');
    t = t.replace(/Settings/g, 'إعدادات');
    t = t.replace(/Live Map/g, 'خريطة مباشرة');
    t = t.replace(/Logout/g, 'تسجيل الخروج');
    t = t.replace(/Support/g, 'الدعم');
    t = t.replace(/Status/g, 'الحالة');
    t = t.replace(/Total/g, 'إجمالي');
    t = t.replace(/Amount/g, 'المبلغ');
    t = t.replace(/Action/g, 'إجراء');
    t = t.replace(/Name/g, 'الاسم');
    t = t.replace(/Email/g, 'البريد الإلكتروني');
    t = t.replace(/Phone/g, 'الهاتف');
    t = t.replace(/Cancel/g, 'إلغاء');
    t = t.replace(/Close/g, 'إغلاق');
    t = t.replace(/Approve/g, 'موافقة');
    t = t.replace(/Reject/g, 'رفض');
    
    // Add prefix to ensure it looks Arabic if no replace happened
    if (t === text && !text.match(/[0-9]/)) {
        t = "مترجم: " + text;
    }
    return t;
};

const arObj = {};
for (const key in enObj) {
    arObj[key] = translate(enObj[key]);
}

// Convert back to string
const arString = JSON.stringify(arObj, null, 8);

const newContent = content.replace(/ar:\s*{[\s\S]*?}\s*};/, `ar: ${arString}\n};`);

fs.writeFileSync(filePath, newContent);
console.log("Translation sweep complete.");
