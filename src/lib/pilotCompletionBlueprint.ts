export type PilotRole = 'owner' | 'tenant' | 'technician' | 'broker' | 'admin';

export type PilotCompletionItem = {
  title: string;
  purpose: string;
  nowAvailable: string[];
  nextProof: string;
};

export const PILOT_COMPLETION_PACK: Record<PilotRole, PilotCompletionItem[]> = {
  owner: [
    {
      title: 'Owner ROI & Savings Center',
      purpose: 'Make the owner see why BIN GROUP saves money, reduces disputes, and protects asset value.',
      nowAvailable: ['Cost saved by BIN GROUP model', 'Monthly ROI report outline', 'Emergency-cost avoidance tracker', 'Vendor quote savings tracker'],
      nextProof: 'Connect to real invoices, approved quotes, warranty claims, and tenant retention signals.',
    },
    {
      title: 'Owner Spending Thresholds',
      purpose: 'Stop uncontrolled maintenance spend while keeping emergency work fast.',
      nowAvailable: ['AED 0-250 auto-approve', 'AED 251-1,000 notify owner', 'AED 1,001+ approval required', 'Emergency audit rule'],
      nextProof: 'Persist thresholds per owner/property and enforce them in RFQ/ticket workflow.',
    },
    {
      title: 'Warranty & Handover Ledger',
      purpose: 'Reduce repeat-payment disputes and move-in/move-out evidence conflicts.',
      nowAvailable: ['Warranty ledger checklist', 'Move-in/out inspection checklist', 'Meter/photo/key handover fields', 'Repair reopen policy'],
      nextProof: 'Attach completed ticket evidence and signed unit handover documents.',
    },
  ],
  tenant: [
    {
      title: 'Three-Button Tenant Home',
      purpose: 'Make the tenant experience simple enough for daily use.',
      nowAvailable: ['Report issue', 'Track issue', 'Approve or dispute repair'],
      nextProof: 'Reorder dashboard above the fold on mobile and test with non-technical tenants.',
    },
    {
      title: 'Tenant Happiness Score',
      purpose: 'Turn service quality into a measurable owner-retention signal.',
      nowAvailable: ['Response time', 'Completion time', 'Rating trend', 'Dispute rate', 'Repeat issue rate'],
      nextProof: 'Calculate from real tickets and show monthly trend by building/unit.',
    },
    {
      title: 'Warranty Reopen & BIN Connect Proof',
      purpose: 'Give tenants a clear path when an issue repeats after repair.',
      nowAvailable: ['Repair warranty explanation', 'Reopen path', 'BIN Connect reply flow', 'Attachment and voice-note readiness fields'],
      nextProof: 'Add real media upload and push notification on admin/technician reply.',
    },
  ],
  technician: [
    {
      title: 'Field Proof Readiness',
      purpose: 'Make technician execution fast, auditable, and mobile-first.',
      nowAvailable: ['One-tap job stages', 'GPS check-in proof checklist', 'Before/after proof rule', 'Voice-note completion checklist'],
      nextProof: 'Test on low-end Android with real GPS, camera, offline mode, and slow network.',
    },
    {
      title: 'Offline Sync & Route Discipline',
      purpose: 'Protect field operations when network quality is weak.',
      nowAvailable: ['Offline sync proof checklist', 'Route optimization target', 'Failed upload recovery plan'],
      nextProof: 'Complete real offline capture and replay test with timestamped evidence.',
    },
  ],
  broker: [
    {
      title: 'Broker Commission Lifecycle',
      purpose: 'Make broker trust measurable from referral to payout.',
      nowAvailable: ['Referral submitted', 'Owner contacted', 'Quote sent', 'Contract signed', 'Payment received', 'Commission payable', 'Withdrawal requested', 'Admin approved'],
      nextProof: 'Bind commission states to real owner contracts and payment verification.',
    },
    {
      title: 'Broker Growth Tools',
      purpose: 'Help brokers bring owners into the system with proof and transparency.',
      nowAvailable: ['Public referral link plan', 'Broker ranking model', 'Commission payout proof checklist'],
      nextProof: 'Generate unique referral links and show live conversion analytics.',
    },
  ],
  admin: [
    {
      title: 'BIN Connect Conversion Desk',
      purpose: 'Turn messages into operational work instead of leaving them as chat.',
      nowAvailable: ['Convert to ticket', 'Convert to complaint', 'Convert to RFQ', 'Convert to HR/support task', 'Convert to feature request'],
      nextProof: 'Add callable/server-backed creation flow and audit log for each conversion.',
    },
    {
      title: 'Launch Evidence Dashboard',
      purpose: 'Keep hard-launch proof honest and visible.',
      nowAvailable: ['App Check proof checklist', 'Push proof checklist', 'Payment activation proof checklist', 'Every-button audit checklist', 'Device proof checklist'],
      nextProof: 'Attach screenshot/log/date/tester/device/role for every required gate.',
    },
  ],
};

export const OWNER_ROI_FORMULA = [
  'Emergency cost avoided',
  'Repeat repair reduction',
  'Vendor quote savings',
  'Warranty claims recovered',
  'Vacancy-risk reduction',
  'Asset health improvement',
  'BIN GROUP service cost',
];

export const FRIENDS_PILOT_CHECKLIST = [
  'Login works and correct role opens',
  'Dashboard loads on mobile',
  'Language switch works',
  'BIN Connect opens, sends, inbox opens, and reply works',
  'Tenant can submit issue',
  'Technician can view job flow',
  'Owner can view approvals, ROI, tickets, and property trust data',
  'Broker can view referral and commission lifecycle',
  'Admin can view BIN Connect inbox and conversion desk',
  'Logout works cleanly',
];
