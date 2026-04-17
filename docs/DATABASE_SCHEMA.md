# DATABASE SCHEMA - HOME OS
**Cloud Database: Firebase/AWS UAE Region**

---

## Collections Overview

```
├── users/
├── tenants/
├── owners/
├── technicians/
├── properties/
├── units/
├── tickets/
├── turnover-quotes/
├── jobs/
├── assets/
├── invoices/
├── payments/
└── audit-logs/
```

---

## USERS Collection

Master user registry (authentication layer).

```javascript
{
  userId: "USER_001",
  email: "user@example.ae",
  phoneNumber: "HIDDEN",
  role: "TENANT" | "OWNER" | "TECHNICIAN" | "ADMIN",
  firstName: "Ahmed",
  lastName: "Al-Mansoori",
  avatar: "https://...jpg",
  status: "ACTIVE" | "SUSPENDED" | "DELETED",
  createdAt: Timestamp,
  updatedAt: Timestamp,
  lastLogin: Timestamp,
  passwordHash: "***ENCRYPTED***",
  fcmTokens: ["token1", "token2"],
  privacySettings: {
    phoneVisible: false,
    locationSharing: true
  }
}
```

**Indexes:**
- `email` (unique)
- `role` + `status`
- `createdAt` (descending)

---

## TENANTS Collection

Tenant-specific data.

```javascript
{
  tenantId: "TENANT_001",
  userId: "USER_001",
  currentUnitId: "UNIT_402",
  leaseStartDate: Date,
  leaseEndDate: Date,
  rentAmount: 2500,
  currency: "AED",
  moveOutDate: null, // Set when move-out requested
  moveOutApprovedAt: null,
  properties: ["PROP_001"],
  emergencyContacts: [
    {
      name: "Fatima Al-Mansoori",
      phone: "HIDDEN",
      relationship: "Spouse"
    }
  ],
  proofOfResidence: "https://...pdf",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Indexes:**
- `userId` (unique)
- `currentUnitId`
- `leaseStartDate`, `leaseEndDate`
- `moveOutDate`

---

## OWNERS Collection

Owner-specific and financial data.

```javascript
{
  ownerId: "OWNER_045",
  userId: "USER_045",
  companyName: "Al-Mansoori Properties LLC",
  taxId: "TAX_12345",
  bankAccount: "***ENCRYPTED***",
  properties: ["PROP_001", "PROP_002", "PROP_003", "PROP_004"],
  totalProperties: 4,
  discountApplicable: true, // If >= 4 properties: 3.3% discount
  suspensionStatus: "ACTIVE" | "SUSPENDED",
  suspensionReason: null,
  unpaidInvoiceCount: 0,
  twoStrikeActive: false, // Triggered if unpaidInvoiceCount >= 2
  bankDetails: {
    bankName: "Emirates NBD",
    accountHolder: "Al-Mansoori Properties LLC",
    iban: "***ENCRYPTED***"
  },
  createdAt: Timestamp,
  updatedAt: Timestamp,
  lastSuspensionAt: null
}
```

**Indexes:**
- `userId` (unique)
- `suspensionStatus`
- `unpaidInvoiceCount`
- `totalProperties`
- `twoStrikeActive`

---

## TECHNICIANS Collection

Field technician data and performance metrics.

```javascript
{
  technicianId: "TECH_042",
  userId: "USER_042",
  nameForCustomer: "Ahmed Al-Mansouri",
  specializations: ["AC", "Plumbing", "Electrical"],
  rating: 4.8,
  totalJobsCompleted: 156,
  responseTime: "12 minutes", // Average
  costPrice: "Internal use only",
  vanAssignment: "VAN_042",
  certifications: [
    {
      certification: "HVAC",
      expiryDate: "2027-06-15",
      documentUrl: "https://...pdf"
    }
  ],
  morningCheckInRequired: true,
  lastCheckInAt: Timestamp,
  lastCheckInPhoto: "https://...jpg",
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Indexes:**
- `userId` (unique)
- `status`
- `specializations`
- `rating` (descending)
- `lastCheckInAt`

---

## PROPERTIES Collection

Physical properties/buildings owned.

```javascript
{
  propertyId: "PROP_001",
  ownerId: "OWNER_045",
  propertyName: "Downtown Dubai Towers",
  propertyType: "TOWER" | "VILLA" | "APARTMENT_BUILDING",
  address: "123 Sheikh Zayed Road, Dubai, UAE",
  coordinates: {
    lat: 25.2048,
    lng: 55.2708
  },
  units: ["UNIT_401", "UNIT_402", "UNIT_403"],
  totalUnits: 3,
  healthScore: 78,
  scoringComponents: {
    openTickets: -15,
    completedPPM: 20,
    latePayments: -5,
    tenantRating: 15,
    maintenanceResponsiveness: 43
  },
  amc: {
    packageType: "TOWER",
    annualCost: 36,
    costUnit: "AED/sq.ft",
    nextRenewalDate: "2027-02-19"
  },
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Indexes:**
- `ownerId`
- `propertyType`
- `healthScore` (descending)
- `address` (geospatial)

---

## UNITS Collection

Individual apartments/villas/studios.

```javascript
{
  unitId: "UNIT_402",
  propertyId: "PROP_001",
  ownerId: "OWNER_045",
  unitNumber: "402",
  unitType: "1-BED" | "2-BED" | "STUDIO" | "VILLA",
  squareFeet: 950,
  currentTenantId: "TENANT_001",
  rentAmount: 2500,
  currency: "AED",
  leaseStartDate: Date,
  leaseEndDate: Date,
  moveOutPending: false,
  moveOutDate: null,
  assets: ["ASSET_8734"], // ACs, pumps, etc.
  maintenanceHistory: ["TKT_78234", "TKT_78235"],
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Indexes:**
- `propertyId`
- `currentTenantId`
- `unitType`
- `moveOutPending`

---

## TICKETS Collection

Maintenance issues and SOS tickets.

```javascript
{
  ticketId: "TKT_78234",
  unitId: "UNIT_402",
  tenantId: "TENANT_001",
  technicianId: "TECH_042",
  category: "AC_ISSUE" | "LEAK" | "ELECTRICAL" | "PLUMBING" | "other",
  description: "AC not cooling bedroom",
  priority: "ROUTINE" | "HIGH" | "CRITICAL",
  isEmergency: false,
  sourceChannel: "TENANT_APP" | "PHONE" | "EMAIL",
  status: "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CLOSED", 
  submittedAt: Timestamp,
  assignedAt: Timestamp,
  completedAt: null,
  
  // Evidence (Visual Gate)
  photoUrl: "https://...jpg",
  videoUrl: null,
  aiAnalysis: {
    detectedCategory: "AC_Issue",
    confidence: 0.94,
    description: "AC compressor humming without cooling"
  },
  
  // SOS Logic
  emergencyToggleUsed: false,
  emergencyWarningAcknowledged: true,
  
  // Customer Interaction
  tenantName: "Ahmed Al-Mansoori",
  tenantPhone: "HIDDEN",
  preferredContactTime: "10:00-12:00",
  accessInstructions: "Key at reception",
  
  // Technician Work
  techniciansAssigned: [
    {
      technicianId: "TECH_042",
      name: "Ahmed Al-Mansouri",
      eta: "2026-02-19T10:45:00Z",
      accepted: true
    }
  ],
  
  // Resolution
  resolutionNotes: "Replaced capacitor",
  partsUsed: [
    {
      partId: "PART_001",
      partName: "AC Capacitor",
      technicianCost: 150,
      clientMarkup: 20,
      clientPrice: 180
    }
  ],
  laborCost: 200,
  totalInvoiced: 380,
  
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Indexes:**
- `unitId` + `status`
- `tenantId`
- `technicianId`
- `priority` + `status`
- `isEmergency` + `submittedAt`
- `createdAt` (descending)

---

## TURNOVER-QUOTES Collection

Move-out refurbishment quotes.

```javascript
{
  quoteId: "QUOTE_001",
  moveOutId: "MOVEOUT_001",
  unitId: "UNIT_402",
  tenantId: "TENANT_001",
  ownerId: "OWNER_045",
  moveOutDate: "2026-03-01",
  unitType: "1-BED",
  
  costBreakdown: {
    paintingCost: 1200,
    deepCleaningCost: 450,
    otherRepairs: 0
  },
  totalQuote: 1650,
  currency: "AED",
  discountApplied: 0, // 3.3% only if owner has >= 4 properties
  finalPrice: 1650,
  
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "COMPLETED",
  approvalDeadline: "2026-02-25",
  approvedAt: null,
  rejectedAt: null,
  completedAt: null,
  
  workOrderId: null,
  scheduledDate: null,
  estimatedCompletion: null,
  
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Indexes:**
- `unitId` + `status`
- `ownerId` + `moveOutDate`
- `status` + `approvalDeadline`

---

## JOBS Collection

Work orders for technicians.

```javascript
{
  jobId: "JOB_001",
  ticketId: "TKT_78234",
  technicianId: "TECH_042",
  unitId: "UNIT_402",
  tenantId: "TENANT_001",
  ownerId: "OWNER_045",
  
  jobType: "MAINTENANCE" | "TURNOVER" | "PREVENTIVE",
  issueCategory: "AC_ISSUE",
  priority: "ROUTINE" | "HIGH" | "CRITICAL",
  
  scheduledDate: "2026-02-19",
  scheduledTime: "10:00",
  estimatedDuration: "1 hour",
  address: "Downtown Dubai, UAE",
  coordinates: {
    lat: 25.2048,
    lng: 55.2708
  },
  
  status: "ASSIGNED" | "ON_ROUTE" | "ARRIVED" | "IN_PROGRESS" | "COMPLETED",
  
  // Proof of Work (Image tagging)
  beforePhoto: "https://...jpg",
  afterPhoto: "https://...jpg",
  customerSignature: "DATA:IMAGE/PNG;BASE64...",
  customerName: "Ahmed Al-Mansoori",
  
  partsUsed: [
    {
      partId: "PART_001",
      partName: "AC Capacitor",
      technicianCost: 150,
      clientPrice: 180
    }
  ],
  laborCost: 200,
  totalInvoiced: 380,
  currency: "AED",
  
  completedAt: null,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Indexes:**
- `technicianId` + `status`
- `unitId`
- `scheduledDate` + `status`
- `jobType`

---

## ASSETS Collection

Physical assets (ACs, pumps, water heaters, etc.)

```javascript
{
  assetId: "ASSET_8734",
  assetType: "AC_UNIT" | "WATER_PUMP" | "WATER_HEATER",
  unitId: "UNIT_402",
  propertyId: "PROP_001",
  
  serialNumber: "AC_SN_12345",
  brand: "Daikin",
  model: "FTKM80CRVI",
  installDate: "2023-06-15",
  warrantyExpiryDate: "2025-06-15",
  lastMaintenanceDate: "2026-01-15",
  
  qrCode: "QR_DATA_STRING",
  qrCodeUrl: "https://qr.homeos.ae/ASSET_8734.png",
  
  maintenanceHistory: [],
  status: "OPERATIONAL" | "MAINTENANCE_REQUIRED" | "FAULTY",
  
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Indexes:**
- `unitId`
- `propertyId`
- `assetType`
- `status`

---

## INVOICES Collection

Financial billing records.

```javascript
{
  invoiceId: "INV_001",
  ownerId: "OWNER_045",
  invoiceType: "MAINTENANCE" | "AMC" | "TURNOVER",
  description: "Monthly maintenance for UNIT_402",
  
  itemizedCharges: [
    {
      description: "AC Repair Parts",
      amount: 180
    },
    {
      description: "Labor",
      amount: 200
    }
  ],
  
  subtotal: 380,
  binGroupFee: 0, // Deducted separately
  taxAmount: 0,
  totalAmount: 380,
  currency: "AED",
  
  status: "PENDING" | "PAID" | "OVERDUE",
  dueDate: "2026-02-28",
  issuedDate: "2026-02-19",
  paidDate: null,
  
  tickets: ["TKT_78234"],
  
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Indexes:**
- `ownerId` + `status`
- `dueDate`
- `invoiceType` + `status`

---

## PAYMENTS Collection

Payment transaction records.

```javascript
{
  paymentId: "PAY_001",
  ownerId: "OWNER_045",
  
  paymentType: "RENT_COLLECTION" | "MAINTENANCE_INVOICE" | "MANUAL_TRANSFER",
  amount: 45000,
  currency: "AED",
  
  // Rent Collection Waterfall Logic
  waterfall: {
    totalCollected: 45000,
    binGroupFeeDeducted: 2250, // 5%
    maintenanceInvoicesDeducted: 6250,
    netTransferredToOwner: 36500
  },
  
  paymentGateway: "STRIPE" | "NETWORK_INTERNATIONAL" | "BANK_TRANSFER",
  transactionId: "TRAN_12345",
  reference: "RNT_FEB_2026",
  
  status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED",
  processedAt: Timestamp,
  settledAt: null,
  
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Indexes:**
- `ownerId` + `paymentType`
- `status` + `processedAt`
- `dueDate`

---

## AUDIT-LOGS Collection

Compliance and monitoring.

```javascript
{
  logId: "LOG_001",
  timestamp: Timestamp,
  userId: "USER_001",
  userRole: "ADMIN" | "OWNER" | "TECHNICIAN" | "TENANT",
  action: "TICKET_CREATED" | "OWNER_SUSPENDED" | "PAYMENT_PROCESSED",
  resourceId: "TKT_78234",
  resourceType: "TICKET" | "OWNER" | "PAYMENT",
  
  oldValues: {},
  newValues: {},
  
  details: "Owner rejected critical repair, accepted liability waiver",
  ipAddress: "192.168.1.1",
  userAgent: "Mozilla/5.0...",
  
  status: "SUCCESS" | "FAILURE",
  errorMessage: null,
  
  createdAt: Timestamp
}
```

**Indexes:**
- `userId` + `timestamp`
- `action` + `timestamp`
- `resourceId`
- `resourceType`

---

## Summary Indexes

**Critical for Performance:**
```
tickets: propertyId + status + createdAt
invoices: ownerId + status + dueDate
payments: ownerId + status + processedAt
properties: ownerId + healthScore
owners: totalProperties + suspensionStatus
```

---

## Data Retention Policy

- Audit logs: 7 years (compliance)
- Completed tickets: 3 years
- Deleted users: Anonymized after 1 year
- Payment records: 7 years (financial compliance)

---

## Backup Strategy

- Daily snapshots to AWS S3 (USD region)
- Weekly full backups (regional redundancy)
- Real-time replication to secondary UAE zone
