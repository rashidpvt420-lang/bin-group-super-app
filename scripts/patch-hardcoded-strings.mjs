import { readFileSync, writeFileSync } from 'fs';

const patches = [
  // InvoiceDetailsPage.tsx - VAT (5%)
  {
    file: 'src/pages/InvoiceDetailsPage.tsx',
    find: '>VAT (5%)</Typography>',
    replace: '>{t(\'common.vat_5\')}</Typography>',
  },
  // BrokerCommissionHubPage.tsx - AMOUNT (AED)
  {
    file: 'src/admin/pages/brokers/BrokerCommissionHubPage.tsx',
    find: '>AMOUNT (AED)</TableCell>',
    replace: '>{t(\'common.amount_aed\').toUpperCase()}</TableCell>',
  },
  // OwnerMoneyControlPage.tsx - AMOUNT (AED)
  {
    file: 'src/pages/OwnerMoneyControlPage.tsx',
    find: '}} align="right">AMOUNT (AED)</TableCell>',
    replace: '}} align="right">{t(\'common.amount_aed\').toUpperCase()}</TableCell>',
  },
  // OwnerComplaintCommandCenter.tsx - COST (AED)
  {
    file: 'src/owner/components/OwnerComplaintCommandCenter.tsx',
    find: '>COST (AED)</TableCell>',
    replace: '>{t(\'common.cost_aed\').toUpperCase()}</TableCell>',
  },
  // AddPropertyPage.tsx - SLA label and basic support
  {
    file: 'src/admin/pages/properties/AddPropertyPage.tsx',
    find: '>SERVICE LEVEL AGREEMENT (SLA)</Typography>',
    replace: '>{t(\'common.sla_label\').toUpperCase()}</Typography>',
  },
  {
    file: 'src/admin/pages/properties/AddPropertyPage.tsx',
    find: '>Basic Support (48h Response)</MenuItem>',
    replace: '>{t(\'common.sla_basic\')}</MenuItem>',
  },
  // OwnerComplaintPage.tsx - Unit (Optional) and Urgent (Priority 4h)
  {
    file: 'src/owner/pages/OwnerComplaintPage.tsx',
    find: '>Unit (Optional)</InputLabel>',
    replace: '>{t(\'common.unit_optional\')}</InputLabel>',
  },
  {
    file: 'src/owner/pages/OwnerComplaintPage.tsx',
    find: '>Urgent (Priority 4h)</MenuItem>',
    replace: '>{t(\'common.urgent_priority\')}</MenuItem>',
  },
  // PricingPage.tsx - Annual Rent (AED)
  {
    file: 'src/admin/pages/pricing/PricingPage.tsx',
    find: 'label="Annual Rent (AED)"',
    replace: 'label={t(\'common.annual_rent_aed\')}',
  },
  // AdminContractActivationApproval.tsx - CONFIRMED AMOUNT (AED)
  {
    file: 'src/admin/components/AdminContractActivationApproval.tsx',
    find: 'label="CONFIRMED AMOUNT (AED)"',
    replace: 'label={t(\'common.confirmed_amount_aed\').toUpperCase()}',
  },
  // AddTenantDialog.tsx - Email Address, Phone Number, Property Assignment, Unit Assignment
  {
    file: 'src/admin/components/tenants/AddTenantDialog.tsx',
    find: 'label="Email Address"',
    replace: 'label={t(\'common.email_address\')}',
  },
  {
    file: 'src/admin/components/tenants/AddTenantDialog.tsx',
    find: 'label="Phone Number"',
    replace: 'label={t(\'common.phone_number\')}',
  },
  {
    file: 'src/admin/components/tenants/AddTenantDialog.tsx',
    find: 'label="Property Assignment"',
    replace: 'label={t(\'common.property_assignment\')}',
  },
  {
    file: 'src/admin/components/tenants/AddTenantDialog.tsx',
    find: 'label="Unit Assignment"',
    replace: 'label={t(\'common.unit_assignment\')}',
  },
];

let patched = 0;
let skipped = 0;

for (const { file, find, replace } of patches) {
  try {
    let text = readFileSync(file, 'utf8');
    if (text.includes(find)) {
      // Ensure t is available — check if useLanguage is imported
      const needsT = !text.includes('const { t') && !text.includes('const {t');
      if (needsT && text.includes('useLanguage')) {
        // Already imports useLanguage, just need to destructure t
        text = text.replace(/(const \{)([^}]*)(} = useLanguage\(\))/, (m, a, mid, c) => {
          if (mid.includes('t')) return m;
          return `${a} t,${mid}${c}`;
        });
      }
      text = text.replace(find, replace);
      writeFileSync(file, text, 'utf8');
      console.log(`PATCHED [${find.substring(0, 40)}] in ${file.split('/').pop()}`);
      patched++;
    } else {
      console.log(`SKIP (not found) [${find.substring(0, 40)}] in ${file.split('/').pop()}`);
      skipped++;
    }
  } catch (e) {
    console.error(`ERROR ${file}: ${e.message}`);
  }
}

console.log(`\nDone: ${patched} patched, ${skipped} skipped.`);
