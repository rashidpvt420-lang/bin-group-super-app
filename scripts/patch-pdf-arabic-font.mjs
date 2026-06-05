import { readFileSync, writeFileSync } from 'fs';

const files = [
  'src/admin/components/tenants/BulkTenantImportDialog.tsx',
  'src/pages/ExecutiveReportingPage.tsx',
  'src/admin/pages/map/LiveMapPage.tsx',
  'src/components/OwnerReportGenerator.tsx',
  'src/admin/pages/ProductionControlCenter.tsx',
  'src/pages/ReportingDashboard.tsx',
  'src/admin/pages/reports/ReportsPage.tsx',
];

for (const f of files) {
  let text = readFileSync(f, 'utf8');

  // Compute relative path depth to arabicPdfFont
  const depth = f.split('/').length - 1;
  const prefix = depth === 3 ? '../../utils/' : depth === 4 ? '../../../utils/' : '../../utils/';
  const imp = `import { registerArabicFont } from '${prefix}arabicPdfFont';`;

  if (text.includes('registerArabicFont')) {
    console.log('SKIP (already patched):', f);
    continue;
  }

  // Add import after jsPDF import lines
  if (text.includes("import autoTable from 'jspdf-autotable';")) {
    text = text.replace("import autoTable from 'jspdf-autotable';", `import autoTable from 'jspdf-autotable';\n${imp}`);
  } else if (text.includes("import 'jspdf-autotable';")) {
    text = text.replace("import 'jspdf-autotable';", `import 'jspdf-autotable';\n${imp}`);
  } else {
    text = text.replace("import { jsPDF } from 'jspdf';", `import { jsPDF } from 'jspdf';\n${imp}`);
  }

  // Insert registerArabicFont(varName); after every new jsPDF() call
  text = text.replace(/(const (doc|pdf) = new jsPDF\([^)]*\);)/g, (match, full, varName) => {
    return `${full}\n        registerArabicFont(${varName});`;
  });

  writeFileSync(f, text, 'utf8');
  console.log('PATCHED:', f);
}
console.log('All done.');
