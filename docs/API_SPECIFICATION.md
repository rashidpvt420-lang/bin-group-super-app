# API SPECIFICATION - HOME OS Backend

## Base URL
```
Production: https://api.homeos.ae
Development: http://localhost:3000
```

---

## Authentication
All endpoints (except `/auth/login`, `/auth/register`) require JWT in header:
```
Authorization: Bearer <JWT_TOKEN>
```

---

## TENANT APP ENDPOINTS

### 1. Submit Maintenance Ticket
**POST** `/api/tickets/create`

**Request:**
```json
{
  "tenantId": "TENANT_001",
  "unitId": "UNIT_402",
  "category": "AC_Issue",
  "description": "AC not cooling",
  "photoUrl": "https://...jpg",
  "videoUrl": "https://...mp4",
  "isEmergency": false,
  "timestamp": "2026-02-19T10:00:00Z"
}
```

**Response (201):**
```json
{
  "ticketId": "TKT_78234",
  "status": "OPEN",
  "assignedTechnicianId": "TECH_042",
  "estimatedArrival": "2 hours",
  "message": "Ticket submitted. Technician assigned."
}
```

**Validation Rules:**
- `photoUrl` OR `videoUrl` required (Visual Gate)
- AI auto-tags category if not provided
- Emergency flag triggers AED 150 fine warning pop-up

---

### 2. Move-Out Request
**POST** `/api/units/moveout-request`

**Request:**
```json
{
  "tenantId": "TENANT_001",
  "unitId": "UNIT_402",
  "moveOutDate": "2026-03-01",
  "reason": "Personal relocation"
}
```

**Response (201):**
```json
{
  "moveOutId": "MOVEOUT_001",
  "status": "PENDING_OWNER_APPROVAL",
  "turnoverQuote": {
    "paintingCost": 1200,
    "deepCleaningCost": 450,
    "totalQuote": 1650,
    "currency": "AED"
  },
  "ownerNotified": true
}
```

**Backend Action:** Triggers Turnover Engine for Owner

---

### 3. Track Ticket Status
**GET** `/api/tickets/{ticketId}`

**Response (200):**
```json
{
  "ticketId": "TKT_78234",
  "status": "IN_PROGRESS",
  "assignedTechnician": {
    "name": "Ahmed Al-Mansouri",
    "rating": 4.8,
    "eta": "45 minutes",
    "liveLocation": {
      "lat": 25.2048,
      "lng": 55.2708
    }
  },
  "updates": [
    {
      "timestamp": "2026-02-19T10:30:00Z",
      "message": "Technician on the way"
    }
  ]
}
```

---

## OWNER APP ENDPOINTS

### 1. Get Turnover Engine Quote
**GET** `/api/owner/turnover-quotes/{unitId}`

**Response (200):**
```json
{
  "unitId": "UNIT_402",
  "unitType": "1-BED",
  "moveOutDate": "2026-03-01",
  "quote": {
    "painting": 1200,
    "deepCleaning": 450,
    "total": 1650
  },
  "approvalDeadline": "2026-02-25",
  "status": "PENDING_APPROVAL"
}
```

---

### 2. Approve Refurbishment
**POST** `/api/owner/turnover-quotes/{quoteId}/approve`

**Request:**
```json
{
  "quoteId": "QUOTE_001",
  "ownerId": "OWNER_045"
}
```

**Response (201):**
```json
{
  "status": "APPROVED",
  "workOrderId": "WO_12345",
  "scheduledDate": "2026-03-02",
  "estimatedCompletion": "2026-03-04"
}
```

---

### 3. Get Health Score
**GET** `/api/owner/{ownerId}/properties/{propertyId}/health-score`

**Response (200):**
```json
{
  "propertyId": "PROP_045",
  "healthScore": 78,
  "scoreBreakdown": {
    "openTickets": -15,
    "completedPPM": 20,
    "latePayments": -5,
    "tenantRating": 15,
    "maintenanceResponsiveness": 43
  },
  "recommendation": "Schedule preventive maintenance to improve score"
}
```

---

### 4. Reject Critical Repair (Liability Waiver)
**POST** `/api/owner/critical-repairs/{ticketId}/reject`

**Request:**
```json
{
  "ticketId": "TKT_78234",
  "ownerId": "OWNER_045",
  "acceptLiability": true
}
```

**Validation Rule:** `acceptLiability` must be `true` to proceed. System triggers mandatory pop-up: "I accept full legal liability for municipal fines and damages caused by delaying this repair."

**Response (201):**
```json
{
  "status": "REJECTED_BY_OWNER",
  "liabilityWaiverId": "WAIVER_001",
  "timestamp": "2026-02-19T11:00:00Z",
  "auditLog": "Recorded for compliance"
}
```

---

### 5. Financial Dashboard
**GET** `/api/owner/{ownerId}/financials`

**Response (200):**
```json
{
  "period": "February 2026",
  "totalRentCollected": 45000,
  "totalExpenses": 8500,
  "netPayout": 36500,
  "breakdown": {
    "rentalIncome": 45000,
    "binGroupFee": -2250,
    "maintenanceExpenses": -6250,
    "turnoverCosts": 0
  },
  "currency": "AED"
}
```

---

## TECHNICIAN APP ENDPOINTS

### 1. Morning Gate - Stock Check
**POST** `/api/technician/morning-check-in`

**Request:**
```json
{
  "technicianId": "TECH_042",
  "checkInTime": "2026-02-19T08:15:00Z",
  "vanInventoryPhotoUrl": "https://...jpg"
}
```

**Validation Rule:** Must be submitted between 07:00 - 08:30 AM. After 08:30, app locked until submission.

**Response (201):**
```json
{
  "status": "CHECKED_IN",
  "appUnlocked": true,
  "assignedJobs": 4,
  "message": "Ready to work!"
}
```

---

### 2. Asset Tagging - QR Code Generation
**POST** `/api/technician/assets/register`

**Request:**
```json
{
  "assetType": "AC_UNIT",
  "serialNumber": "AC_SN_12345",
  "brand": "Daikin",
  "installDate": "2023-06-15",
  "unitId": "UNIT_402",
  "qrCodeData": "QR_DATA_STRING"
}
```

**Response (201):**
```json
{
  "assetId": "ASSET_8734",
  "qrCode": "https://qr.homeos.ae/ASSET_8734.png",
  "registered": true
}
```

---

### 3. Close Job (Proof of Work)
**POST** `/api/technician/jobs/{jobId}/close`

**Request:**
```json
{
  "jobId": "JOB_001",
  "technicianId": "TECH_042",
  "beforePhotoUrl": "https://...jpg",
  "afterPhotoUrl": "https://...jpg",
  "customerSignature": "DATA:IMAGE/PNG;BASE64...",
  "customerName": "Ahmed Al-Mansoori",
  "workDescription": "Replaced AC capacitor",
  "partsUsed": [
    {
      "partName": "Capacitor",
      "cost": 150,
      "quantity": 1
    }
  ]
}
```

**Validation Rules:**
- Before photo required
- After photo required
- Digital signature required (X.509 certificate)

**Response (201):**
```json
{
  "jobId": "JOB_001",
  "status": "COMPLETED",
  "invoice": {
    "partsTotal": 150,
    "markup": 30,
    "clientPrice": 180,
    "laborCharges": 200,
    "total": 380
  },
  "currency": "AED"
}
```

---

### 4. Get Daily Schedule
**GET** `/api/technician/{technicianId}/schedule`

**Response (200):**
```json
{
  "date": "2026-02-19",
  "jobs": [
    {
      "jobId": "JOB_001",
      "unitId": "UNIT_402",
      "tenantName": "Ahmed Al-Mansoori",
      "issueCategory": "AC_Issue",
      "priority": "HIGH",
      "scheduledTime": "10:00",
      "address": "Downtown Dubai, UAE",
      "coordinates": {
        "lat": 25.2048,
        "lng": 55.2708
      }
    }
  ],
  "totalJobs": 4
}
```

---

## ADMIN PANEL ENDPOINTS

### 1. Live Technician Tracking
**GET** `/api/admin/technicians/live-map`

**Response (200):**
```json
{
  "technicians": [
    {
      "technicianId": "TECH_042",
      "name": "Ahmed Al-Mansouri",
      "status": "ON_ROUTE",
      "currentLocation": {
        "lat": 25.2048,
        "lng": 55.2708
      },
      "nextJobETA": "12 minutes",
      "jobsCompleted": 3,
      "jobsRemaining": 1
    }
  ]
}
```

---

### 2. Financial Ticker
**GET** `/api/admin/financials/daily`

**Response (200):**
```json
{
  "date": "2026-02-19",
  "cashCollected": 125000,
  "overdue": 45000,
  "pending": 32000,
  "collections": {
    "rent": 100000,
    "services": 25000
  },
  "currency": "AED"
}
```

---

### 3. SOS Live Feed
**GET** `/api/admin/sos-tickets/live`

**Response (200):**
```json
{
  "activeSOSTickets": [
    {
      "ticketId": "TKT_78234",
      "unitId": "UNIT_402",
      "tenantName": "Ahmed Al-Mansoori",
      "issueType": "LEAK",
      "submittedAt": "2026-02-19T10:00:00Z",
      "status": "TECHNICIAN_ASSIGNED",
      "technicianETA": "8 minutes",
      "priority": "CRITICAL"
    }
  ],
  "totalActive": 3
}
```

---

### 4. Broker Portal - Agent Credits
**POST** `/api/admin/broker/credit-agent`

**Request:**
```json
{
  "agentCode": "AGENT_123",
  "tenantId": "TENANT_001",
  "creditAmount": 100
}
```

**Response (201):**
```json
{
  "agentId": "AGENT_123",
  "creditAdded": 100,
  "totalCredits": 2500,
  "currency": "AED"
}
```

---

### 5. Owner Suspension (Two-Strike Rule)
**POST** `/api/admin/owners/{ownerId}/suspend`

**Request:**
```json
{
  "ownerId": "OWNER_045",
  "reason": "Unpaid invoices >= 2",
  "suspensionType": "FULL"
}
```

**Response (201):**
```json
{
  "ownerId": "OWNER_045",
  "status": "SUSPENDED",
  "accessBlocked": true,
  "emergencyServicesDisabled": true,
  "notificationSent": true
}
```

---

## Error Responses

**400 Bad Request:**
```json
{
  "error": "INVALID_REQUEST",
  "message": "Photo or video is required",
  "code": "VISUAL_GATE_FAILED"
}
```

**401 Unauthorized:**
```json
{
  "error": "INVALID_TOKEN",
  "message": "JWT expired or invalid",
  "code": "AUTH_FAILED"
}
```

**403 Forbidden:**
```json
{
  "error": "SUSPENDED_ACCOUNT",
  "message": "Owner account suspended due to unpaid invoices",
  "code": "TWO_STRIKE_RULE"
}
```

**500 Internal Server Error:**
```json
{
  "error": "INTERNAL_ERROR",
  "message": "Service temporarily unavailable",
  "code": "SERVER_ERROR"
}
```

---

## Rate Limiting

- **Standard Endpoints**: 100 requests/minute per user
- **File Upload**: 5 requests/minute (photos/videos)
- **Admin Endpoints**: 500 requests/minute per API key

---

## Pagination

For list endpoints:
```
/api/resource?page=1&limit=20&sort=createdAt:DESC
```

Response includes:
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

---

## Webhook Events

Subscribe to webhooks for real-time updates:

- `ticket.created`
- `ticket.assigned`
- `ticket.completed`
- `moveout.requested`
- `payment.received`
- `owner.suspended`

POST endpoint configuration in admin panel.
