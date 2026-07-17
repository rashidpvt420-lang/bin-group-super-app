import fs from 'node:fs';

const path = 'functions/secureOwnerRegistrationRequest.ts';
let source = fs.readFileSync(path, 'utf8');
const before = `  const previewResult = await previewOwnerOnboardingQuoteHandler({
    auth: request.auth,
    data: {
      properties: data.properties,
      selectedAddOns: data.serviceDetails.selectedAddOns,
    },
  });
  const quote = previewResult?.data || previewResult;`;
const after = `  const quote = await previewOwnerOnboardingQuoteHandler({
    auth: request.auth,
    data: {
      properties: data.properties,
      selectedAddOns: data.serviceDetails.selectedAddOns,
    },
  });`;
if (!source.includes(before)) throw new Error('Owner preview result block not found.');
source = source.replace(before, after);
if (source.includes('previewResult?.data')) throw new Error('Callable envelope fallback remains.');
fs.writeFileSync(path, source);
console.log('Owner preview handler result fixed.');
