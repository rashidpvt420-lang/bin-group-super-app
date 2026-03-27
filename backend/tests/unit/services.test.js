// backend/tests/unit/services.test.js
const {
  calculateEnterpriseDiscount,
  calculateTurnoverQuote,
  applyPartsMarkup,
  calculateHealthScore,
  processRentWaterfall,
  enforceTwoStrike,
  findOwner,
} = require('../../src/services/rules');

const { db } = require('../../src/data/store');

describe('Business Logic - Services', () => {
  beforeEach(() => {
    // Reset in-memory database
    db.owners = [
      {
        ownerId: 'OWNER_045',
        totalBuildings: 4,
        unpaidInvoiceCount: 0,
        suspensionStatus: 'ACTIVE',
      },
      {
        ownerId: 'OWNER_046',
        totalBuildings: 2,
        unpaidInvoiceCount: 0,
        suspensionStatus: 'ACTIVE',
      },
    ];
    db.invoices = [];
  });

  describe('calculateEnterpriseDiscount', () => {
    test('should apply 3.3% discount for 4+ buildings', () => {
      const result = calculateEnterpriseDiscount('OWNER_045', 1000);
      expect(result.applicable).toBe(true);
      expect(result.percent).toBe(3.3);
      expect(result.discountAmount).toBe(33);
      expect(result.finalAmount).toBe(967);
    });

    test('should not apply discount for < 4 buildings', () => {
      const result = calculateEnterpriseDiscount('OWNER_046', 1000);
      expect(result.applicable).toBe(false);
      expect(result.discountAmount).toBe(0);
      expect(result.finalAmount).toBe(1000);
    });

    test('should return 0 for non-existent owner', () => {
      const result = calculateEnterpriseDiscount('OWNER_INVALID', 1000);
      expect(result.applicable).toBe(false);
    });
  });

  describe('calculateTurnoverQuote', () => {
    test('should calculate 1-BED turnover quote', () => {
      const result = calculateTurnoverQuote('1-BED', 'OWNER_045');
      expect(result.totalQuote).toBe(1400);
      expect(result.paintingCost).toBe(1050);
      expect(result.deepCleaningCost).toBe(350);
      expect(result.discountApplied).toBe(46.2); // 3.3% of 1400
      expect(result.finalPrice).toBeCloseTo(1353.8, 1);
    });

    test('should calculate STUDIO turnover quote', () => {
      const result = calculateTurnoverQuote('STUDIO', 'OWNER_046');
      expect(result.totalQuote).toBe(950);
      expect(result.finalPrice).toBe(950); // No discount for 2 buildings
    });

    test('should handle unit type variations', () => {
      const result1 = calculateTurnoverQuote('1BED', 'OWNER_045');
      const result2 = calculateTurnoverQuote('1-bed', 'OWNER_045');
      expect(result1.totalQuote).toBe(1400);
      expect(result2.totalQuote).toBe(1400);
    });
  });

  describe('applyPartsMarkup', () => {
    test('should apply 20% markup on parts', () => {
      const parts = [
        { cost: 150, quantity: 1 },
        { cost: 75, quantity: 1 },
      ];
      const result = applyPartsMarkup(parts);
      expect(result.technicianCost).toBe(225);
      expect(result.markup).toBe(45);
      expect(result.clientPrice).toBe(270);
    });

    test('should handle empty parts list', () => {
      const result = applyPartsMarkup([]);
      expect(result.technicianCost).toBe(0);
      expect(result.markup).toBe(0);
      expect(result.clientPrice).toBe(0);
    });

    test('should calculate with quantities', () => {
      const parts = [{ cost: 100, quantity: 3 }];
      const result = applyPartsMarkup(parts);
      expect(result.technicianCost).toBe(300);
      expect(result.clientPrice).toBe(360);
    });
  });

  describe('calculateHealthScore', () => {
    test('should calculate health score correctly', () => {
      db.properties = [
        { propertyId: 'PROP_045', ownerId: 'OWNER_045', completedPPM: 2 },
      ];
      db.units = [
        { unitId: 'UNIT_401', propertyId: 'PROP_045', propertyId: 'PROP_045' },
      ];
      db.tickets = [
        { unitId: 'UNIT_401', status: 'OPEN' },
        { unitId: 'UNIT_401', status: 'OPEN' },
      ];

      const result = calculateHealthScore('PROP_045');
      expect(result.healthScore).toBeLessThanOrEqual(100);
      expect(result.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.scoreBreakdown.openTickets).toBe(-10);
      expect(result.scoreBreakdown.completedPPM).toBe(20);
    });
  });

  describe('processRentWaterfall', () => {
    test('should process rent waterfall correctly', () => {
      db.invoices = [
        { invoiceId: 'INV_001', ownerId: 'OWNER_045', totalAmount: 380, status: 'PENDING' },
        { invoiceId: 'INV_002', ownerId: 'OWNER_045', totalAmount: 250, status: 'PENDING' },
      ];

      const result = processRentWaterfall('OWNER_045', 2500);

      expect(result.waterfall.totalCollected).toBe(2500);
      expect(result.waterfall.binGroupFeeDeducted).toBe(125); // 5% of 2500
      expect(result.waterfall.maintenanceInvoicesDeducted).toBe(630); // Full payment of invoices
      expect(result.waterfall.netTransferredToOwner).toBe(1745);
    });

    test('should handle partial invoice payment', () => {
      db.invoices = [
        { invoiceId: 'INV_001', ownerId: 'OWNER_045', totalAmount: 1000, status: 'PENDING' },
      ];

      const result = processRentWaterfall('OWNER_045', 1100);

      expect(result.waterfall.binGroupFeeDeducted).toBe(55); // 5% of 1100
      expect(result.waterfall.maintenanceInvoicesDeducted).toBe(1000);
      expect(result.waterfall.netTransferredToOwner).toBe(45);
    });
  });

  describe('enforceTwoStrike', () => {
    test('should suspend owner at 2+ unpaid invoices', () => {
      db.invoices = [
        { invoiceId: 'INV_001', ownerId: 'OWNER_045', status: 'PENDING' },
        { invoiceId: 'INV_002', ownerId: 'OWNER_045', status: 'PENDING' },
      ];

      const result = enforceTwoStrike('OWNER_045');
      const owner = findOwner('OWNER_045');

      expect(result.suspended).toBe(true);
      expect(owner.suspensionStatus).toBe('SUSPENDED');
    });

    test('should not suspend with < 2 unpaid invoices', () => {
      db.invoices = [{ invoiceId: 'INV_001', ownerId: 'OWNER_045', status: 'PENDING' }];

      const result = enforceTwoStrike('OWNER_045');
      const owner = findOwner('OWNER_045');

      expect(result.suspended).toBe(false);
      expect(owner.suspensionStatus).toBe('ACTIVE');
    });
  });
});
