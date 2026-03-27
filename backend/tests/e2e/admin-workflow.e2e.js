// backend/tests/e2e/admin-workflow.e2e.js
/**
 * E2E Test: Admin Dashboard Workflow
 * Tests admin panel operations and financial tracking
 */

describe('Admin Dashboard Workflow E2E', () => {
  const BASE_URL = 'http://localhost:3000/api';

  describe('Admin Authentication', () => {
    test('should login admin', async () => {
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@homeOS.com',
          password: 'SecureAdminPass123!',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.token).toBeDefined();
      expect(data.user.role).toBe('ADMIN');
    });
  });

  describe('Financial Dashboard', () => {
    let adminToken: string;

    beforeAll(async () => {
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@homeOS.com',
          password: 'SecureAdminPass123!',
        }),
      });

      const data = await response.json();
      adminToken = data.token;
    });

    test('should fetch financial ticker', async () => {
      const response = await fetch(`${BASE_URL}/admin/financial-ticker`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.cashCollectedToday).toBeGreaterThanOrEqual(0);
      expect(data.pendingPayments).toBeGreaterThanOrEqual(0);
      expect(data.overdueAmount).toBeGreaterThanOrEqual(0);
      expect(data.successRate).toBeLessThanOrEqual(100);
    });

    test('should fetch live map data', async () => {
      const response = await fetch(`${BASE_URL}/admin/live-map`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.technicians)).toBe(true);
    });

    test('should get owner financials', async () => {
      const response = await fetch(`${BASE_URL}/owner/OWNER_045/financials`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.totalRentCollected).toBeDefined();
      expect(data.breakdown).toBeDefined();
      expect(data.netPayout).toBeDefined();
    });
  });

  describe('Owner Management', () => {
    let adminToken: string;

    beforeAll(async () => {
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@homeOS.com',
          password: 'SecureAdminPass123!',
        }),
      });

      const data = await response.json();
      adminToken = data.token;
    });

    test('should fetch all owners', async () => {
      const response = await fetch(`${BASE_URL}/admin/owners`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.owners)).toBe(true);
    });

    test('should suspend owner', async () => {
      const response = await fetch(`${BASE_URL}/admin/owners/OWNER_999/suspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ reason: 'Test suspension' }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.suspensionStatus).toBe('SUSPENDED');
    });
  });

  describe('Ticket Management', () => {
    let adminToken: string;

    beforeAll(async () => {
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@homeOS.com',
          password: 'SecureAdminPass123!',
        }),
      });

      const data = await response.json();
      adminToken = data.token;
    });

    test('should fetch all tickets', async () => {
      const response = await fetch(`${BASE_URL}/admin/tickets`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.tickets)).toBe(true);
    });

    test('should filter tickets by status', async () => {
      const response = await fetch(
        `${BASE_URL}/admin/tickets?status=OPEN`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      // All tickets should have OPEN status
      data.tickets.forEach((ticket: any) => {
        expect(ticket.status).toBe('OPEN');
      });
    });
  });
});
