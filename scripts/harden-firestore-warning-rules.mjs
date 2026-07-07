import { readFileSync, writeFileSync } from 'node:fs';

const path = 'firestore.rules';
let s = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
let n = 0;

const patch = (label, before, after) => {
  if (s.includes(after)) return console.log(`Already hardened: ${label}`);
  if (!s.includes(before)) return console.warn(`Skipped: ${label}`);
  s = s.replace(before, after);
  n += 1;
  console.log(`Patched: ${label}`);
};

patch('safe authEmail',
  "function authEmail() { return (signedIn() && 'email' in request.auth.token) ? request.auth.token.email : null; }",
  "function authEmail() { return signedIn() ? request.auth.token.get('email', null) : null; }"
);

patch('safe isAdmin',
  "request.auth.token.admin == true",
  "request.auth.token.get('admin', false) == true"
);
patch('safe isAdmin isAdmin',
  "request.auth.token.isAdmin == true",
  "request.auth.token.get('isAdmin', false) == true"
);
patch('safe isAdmin superAdmin',
  "request.auth.token.superAdmin == true",
  "request.auth.token.get('superAdmin', false) == true"
);
patch('safe isAdmin super_admin',
  "request.auth.token.super_admin == true",
  "request.auth.token.get('super_admin', false) == true"
);
patch('safe isAdmin ceo',
  "request.auth.token.ceo == true",
  "request.auth.token.get('ceo', false) == true"
);
patch('safe isAdmin manager',
  "request.auth.token.manager == true",
  "request.auth.token.get('manager', false) == true"
);
patch('safe admin role', "request.auth.token.role in ['admin', 'super_admin', 'ceo', 'manager', 'operations_admin', 'finance_admin', 'hr_admin', 'support_admin']", "request.auth.token.get('role', '') in ['admin', 'super_admin', 'ceo', 'manager', 'operations_admin', 'finance_admin', 'hr_admin', 'support_admin']");
patch('safe admin userRole', "request.auth.token.userRole in ['admin', 'super_admin', 'ceo', 'manager', 'operations_admin', 'finance_admin', 'hr_admin', 'support_admin']", "request.auth.token.get('userRole', '') in ['admin', 'super_admin', 'ceo', 'manager', 'operations_admin', 'finance_admin', 'hr_admin', 'support_admin']");
patch('safe admin primaryRole', "request.auth.token.primaryRole in ['admin', 'super_admin', 'ceo', 'manager', 'operations_admin', 'finance_admin', 'hr_admin', 'support_admin']", "request.auth.token.get('primaryRole', '') in ['admin', 'super_admin', 'ceo', 'manager', 'operations_admin', 'finance_admin', 'hr_admin', 'support_admin']");

patch('safe ownership helper ownerId', 'data.ownerId', "data.get('ownerId', null)");
patch('safe ownership helper ownerUid', 'data.ownerUid', "data.get('ownerUid', null)");
patch('safe ownership helper authUid', 'data.authUid', "data.get('authUid', null)");
patch('safe ownership helper userId', 'data.userId', "data.get('userId', null)");
patch('safe ownership helper createdBy', 'data.createdBy', "data.get('createdBy', null)");
patch('safe ownership helper createdByUid', 'data.createdByUid', "data.get('createdByUid', null)");
patch('safe tenantUid', 'data.tenantUid', "data.get('tenantUid', null)");
patch('safe assignedTechnicianId', 'data.assignedTechnicianId', "data.get('assignedTechnicianId', null)");
patch('safe technicianId', 'data.technicianId', "data.get('technicianId', null)");
patch('safe techId', 'data.techId', "data.get('techId', null)");
patch('safe brokerId', 'data.brokerId', "data.get('brokerId', null)");
patch('safe brokerUid', 'data.brokerUid', "data.get('brokerUid', null)");
patch('safe email', 'data.email', "data.get('email', null)");
patch('safe ownerEmail', 'data.ownerEmail', "data.get('ownerEmail', null)");
patch('safe tenantEmail', 'data.tenantEmail', "data.get('tenantEmail', null)");
patch('safe technicianEmail', 'data.technicianEmail', "data.get('technicianEmail', null)");
patch('safe staffEmail', 'data.staffEmail', "data.get('staffEmail', null)");
patch('safe brokerEmail', 'data.brokerEmail', "data.get('brokerEmail', null)");
patch('safe recipientEmail', 'data.recipientEmail', "data.get('recipientEmail', null)");
patch('safe contactEmail', 'data.contactEmail', "data.get('contactEmail', null)");

if (n) {
  writeFileSync(path, s);
  console.log(`Firestore warning hardening complete: ${n} changes.`);
} else {
  console.log('Firestore warning hardening already present.');
}
