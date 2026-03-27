// backend/tests/integration/api.test.js
const request = require('supertest');
const app = require('../../src/index');
const { db } = require('../../src/data/store');

describe('API Integration Tests', () => {
  beforeEach(() => {
    // Clear test data
    db.tickets = [];
    db.turnoverQuotes = [];
    db.payments = [];
  });

  describe('POST /api/tickets/create', () => {
    test('should create ticket with photo', async () => {
      const response = await request(app)
        .post('/api/tickets/create')
        .send({
          tenantId: 'TENANT_001',
          unitId: 'UNIT_402',
          category: 'AC_ISSUE',
          description: 'AC not cooling',
          photoUrl: 'https://example.com/photo.jpg',
          isEmergency: false,
        });

      expect(response.status).toBe(201);
      expect(response.body.ticketId).toBeDefined();
      expect(response.body.status).toBe('OPEN');
      expect(response.body.emergencyCharge).toBe(0);
    });

    test('should fail without photo/video', async () => {
      const response = await request(app)
        .post('/api/tickets/create')
        .send({
          tenantId: 'TENANT_001',
          unitId: 'UNIT_402',
          description: 'AC not cooling',
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VISUAL_GATE_FAILED');
    });

    test('should charge AED 350 for emergency', async () => {
      const response = await request(app)
        .post('/api/tickets/create')
        .send({
          tenantId: 'TENANT_001',
          unitId: 'UNIT_402',
          description: 'AC not cooling',
          photoUrl: 'https://example.com/photo.jpg',
          isEmergency: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.emergencyCharge).toBe(350);
      expect(response.body.estimatedArrival).toBe('30 minutes');
    });
  });

  describe('GET /api/tickets/:ticketId', () => {
    test('should retrieve ticket', async () => {
      // First create a ticket
      const createRes = await request(app)
        .post('/api/tickets/create')
        .send({
          tenantId: 'TENANT_001',
          unitId: 'UNIT_402',
          photoUrl: 'https://example.com/photo.jpg',
        });

      const ticketId = createRes.body.ticketId;

      // Then retrieve it
      const getRes = await request(app).get(`/api/tickets/${ticketId}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.ticketId).toBe(ticketId);
    });
  });

  describe('POST /api/units/moveout-request', () => {
    test('should create move-out request with turnover quote', async () => {
      const response = await request(app)
        .post('/api/units/moveout-request')
        .send({
          tenantId: 'TENANT_001',
          unitId: 'UNIT_402',
          moveOutDate: '2026-03-01',
        });

      expect(response.status).toBe(201);
      expect(response.body.moveOutId).toBeDefined();
      expect(response.body.turnoverQuote.paintingCost).toBe(1050);
      expect(response.body.turnoverQuote.deepCleaningCost).toBe(350);
      expect(response.body.turnoverQuote.totalQuote).toBe(1400);
    });
  });

  describe('POST /api/owner/turnover-quotes/:quoteId/approve', () => {
    test('should approve turnover quote', async () => {
      // Create quote first
      const createRes = await request(app)
        .post('/api/units/moveout-request')
        .send({
          tenantId: 'TENANT_001',
          unitId: 'UNIT_402',
          moveOutDate: '2026-03-01',
        });

      // Get quote ID from response
      const moveOutId = createRes.body.moveOutId;
      const quoteRecord = db.turnoverQuotes.find((q) => q.moveOutId === moveOutId);
      const quoteId = quoteRecord?.quoteId;

      // Approve quote
      const approveRes = await request(app)
        .post(`/api/owner/turnover-quotes/${quoteId}/approve`)
        .send({ ownerId: 'OWNER_045' });

      expect(approveRes.status).toBe(201);
      expect(approveRes.body.status).toBe('APPROVED');
      expect(approveRes.body.workOrderId).toBeDefined();
    });
  });

  describe('GET /api/owner/:ownerId/financials', () => {
    test('should calculate financials correctly', async () => {
      // Add test data
      db.payments = [
        {
          ownerId: 'OWNER_045',
          amount: 45000,
          paymentType: 'RENT_COLLECTION',
          createdAt: new Date().toISOString(),
        },
      ];
      db.invoices = [
        { ownerId: 'OWNER_045', totalAmount: 6250, status: 'PENDING' },
      ];

      const response = await request(app)
        .get('/api/owner/OWNER_045/financials')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.totalRentCollected).toBe(45000);
      expect(response.body.breakdown.binGroupFee).toBe(-2250); // 5% of 45000
      expect(response.body.netPayout).toBe(36500);
    });
  });

  describe('POST /api/technician/morning-check-in', () => {
    test('should record morning check-in', async () => {
      const response = await request(app)
        .post('/api/technician/morning-check-in')
        .send({
          technicianId: 'TECH_042',
          checkInTime: new Date('2026-02-19T08:15:00Z').toISOString(),
          vanInventoryPhotoUrl: 'https://example.com/van.jpg',
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('CHECKED_IN');
      expect(response.body.appUnlocked).toBe(true);
    });

    test('should fail without van inventory photo', async () => {
      const response = await request(app)
        .post('/api/technician/morning-check-in')
        .send({
          technicianId: 'TECH_042',
          checkInTime: new Date().toISOString(),
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/technician/jobs/:jobId/close', () => {
    test('should close job with proof of work', async () => {
      const job = db.jobs[0];

      const response = await request(app)
        .post(`/api/technician/jobs/${job.jobId}/close`)
        .send({
          technicianId: 'TECH_042',
          beforePhotoUrl: 'https://example.com/before.jpg',
          afterPhotoUrl: 'https://example.com/after.jpg',
          customerSignature: 'DATA:IMAGE/PNG;BASE64...',
          partsUsed: [{ cost: 150, quantity: 1 }],
          workDescription: 'Replaced AC capacitor',
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('COMPLETED');
      expect(response.body.invoice.clientPrice).toBe(180); // 150 + 20% markup
    });

    test('should require all proof of work documents', async () => {
      const job = db.jobs[0];

      const response = await request(app)
        .post(`/api/technician/jobs/${job.jobId}/close`)
        .send({
          technicianId: 'TECH_042',
          beforePhotoUrl: 'https://example.com/before.jpg',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/admin/owners/:ownerId/suspend', () => {
    test('should suspend owner', async () => {
      const response = await request(app)
        .post('/api/admin/owners/OWNER_045/suspend')
        .send({ reason: 'Test suspension' });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('SUSPENDED');
      expect(response.body.accessBlocked).toBe(true);
      expect(response.body.emergencyServicesDisabled).toBe(true);
    });
  });

  describe('/health endpoint', () => {
    test('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.app).toBe('HOME OS Backend MVP');
      expect(response.body.version).toBe('1.0.0');
    });
  });
});
