import { readFileSync, writeFileSync } from 'fs';

const files = [
  'src/admin/pages/brokers/BrokerCommissionHubPage.tsx',
  'src/pages/OwnerMoneyControlPage.tsx',
  'src/owner/components/OwnerComplaintCommandCenter.tsx',
  'src/admin/pages/properties/AddPropertyPage.tsx',
  'src/owner/pages/OwnerComplaintPage.tsx',
  'src/admin/pages/pricing/PricingPage.tsx',
  'src/admin/components/AdminContractActivationApproval.tsx',
  'src/admin/components/tenants/AddTenantDialog.tsx',
  'src/pages/InvoiceDetailsPage.tsx',
];

for (const f of files) {
  let text = readFileSync(f, 'utf8');
  const hasT = text.includes("const { t") || text.includes("const {t") || text.includes("{ t,") || text.includes("{ t }");
  const hasUseLanguage = text.includes('useLanguage');
  
  if (!hasT) {
    if (hasUseLanguage) {
      // useLanguage imported but t not destructured — add t to existing destructure
      text = text.replace(
        /const \{(\s*[^}]+)\} = useLanguage\(\);/,
        (m, inner) => {
          if (inner.includes(' t')) return m;
          return `const { t,${inner}} = useLanguage();`;
        }
      );
      console.log('ADDED t to existing useLanguage destructure in:', f.split('/').pop());
    } else {
      // No useLanguage at all — need to add import and hook call
      // Find the path depth to context
      const depth = f.split('/').length - 1;
      const rel = depth === 3 ? '../../context/LanguageContext' : depth === 4 ? '../../../context/LanguageContext' : '../../context/LanguageContext';
      
      // Add import after last React import or first import
      if (!text.includes("'@bin/shared'") && !text.includes('"@bin/shared"')) {
        text = text.replace(
          /^(import React[^\n]*\n)/m,
          `$1import { useLanguage } from '${rel}';\n`
        );
      }
      
      // Find the component function body opening and insert useLanguage hook
      text = text.replace(
        /^(export default function \w+[^{]*\{)\n/m,
        `$1\n  const { t } = useLanguage();\n`
      );
      console.log('ADDED useLanguage import + t hook in:', f.split('/').pop());
    }
    writeFileSync(f, text, 'utf8');
  } else {
    console.log('SKIP (t already present):', f.split('/').pop());
  }
}
console.log('Done.');
