// backend/tests/e2e/tenant-workflow.e2e.js
/**
 * E2E Test: Complete Tenant Workflow
 * Tests the full lifecycle from login to ticket completion
 */

describe('Tenant Complete Workflow E2E', () => {
  const BASE_URL = 'http://localhost:3000/api';

  describe('Authentication', () => {
    test('should register new tenant', async () => {
      const response = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'e2e-tenant@test.com',
          password: 'Test123456!',
          fullName: 'E2E Test Tenant',
          unitId: 'UNIT_501',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.token).toBeDefined();
      expect(data.user.role).toBe('TENANT');
    });

    test('should login tenant', async () => {
      // Register first
      await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'e2e-login-tenant@test.com',
          password: 'Test123456!',
          fullName: 'E2E Login Tenant',
          unitId: 'UNIT_502',
        }),
      });

      // Then login
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'e2e-login-tenant@test.com',
          password: 'Test123456!',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.token).toBeDefined();
    });
  });

  describe('Ticket Lifecycle', () => {
    let authToken: string;
    let tenantId: string;
    let ticketId: string;

    beforeAll(async () => {
      // Register and get token
      const registerRes = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'e2e-ticket-tenant@test.com',
          password: 'Test123456!',
          fullName: 'E2E Ticket Tenant',
          unitId: 'UNIT_503',
        }),
      });

      const registerData = await registerRes.json();
      authToken = registerData.token;
      tenantId = registerData.user.tenantId;
    });

    test('should create ticket with evidence', async () => {
      const response = await fetch(`${BASE_URL}/tickets/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          tenantId,
          unitId: 'UNIT_503',
          category: 'AC_ISSUE',
          description: 'AC not cooling properly',
          photoUrl: 'https://example.com/photo.jpg',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.ticketId).toBeDefined();
      expect(data.status).toBe('OPEN');
      ticketId = data.ticketId;
    });

    test('should fail creating ticket without evidence', async () => {
      const response = await fetch(`${BASE_URL}/tickets/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          tenantId,
          unitId: 'UNIT_503',
          category: 'AC_ISSUE',
          description: 'AC not cooling properly',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('VISUAL_GATE_FAILED');
    });

    test('should track ticket status', async () => {
      const response = await fetch(`${BASE_URL}/tickets/${ticketId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.ticketId).toBe(ticketId);
      expect(['OPEN', 'IN_PROGRESS', 'COMPLETED']).toContain(data.status);
    });
  });

  describe('Move-Out Request', () => {
    let authToken: string;
    let tenantId: string;

    beforeAll(async () => {
      const registerRes = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'e2e-moveout-tenant@test.com',
          password: 'Test123456!',
          fullName: 'E2E Move-Out Tenant',
          unitId: 'UNIT_504',
        }),
      });

      const registerData = await registerRes.json();
      authToken = registerData.token;
      tenantId = registerData.user.tenantId;
    });

    test('should request move-out with future date', async () => {
      // Calculate future date (7+ days)
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 14);
      const moveOutDate = futureDate.toISOString().split('T')[0];

      const response = await fetch(`${BASE_URL}/units/moveout-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          tenantId,
          unitId: 'UNIT_504',
          moveOutDate,
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.moveOutId).toBeDefined();
      expect(data.turnoverQuote).toBeDefined();
    });

    test('should fail with insufficient notice', async () => {
      // Calculate date < 7 days
      const shortDate = new Date();
      shortDate.setDate(shortDate.getDate() + 3);
      const moveOutDate = shortDate.toISOString().split('T')[0];

      const response = await fetch(`${BASE_URL}/units/moveout-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          tenantId,
          unitId: 'UNIT_504',
          moveOutDate,
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('INSUFFICIENT_NOTICE');
    });
  });
});
