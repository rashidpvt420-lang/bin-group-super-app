# Test Suite Documentation

## Overview

Comprehensive test coverage across all HOME OS applications using industry-standard testing frameworks:
- **Backend**: Jest (Node.js) for unit and integration tests
- **Frontend**: Jest + React Testing Library for component tests
- **E2E**: Jest for end-to-end workflow testing

## Running Tests

### Backend Tests

```bash
cd backend

# Run all tests
npm test

# Run specific test file
npm test tests/unit/services.test.js

# Run with coverage report
npm test -- --coverage

# Watch mode (re-run on file changes)
npm test -- --watch

# Run integration tests only
npm test tests/integration/

# Run E2E tests only
npm test tests/e2e/
```

### Admin Panel Tests

```bash
cd admin-panel

# Run all tests
npm test

# Run specific test file
npm test -- DashboardPage.test.tsx

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch

# Update snapshots
npm test -- -u
```

### Tenant App Tests

```bash
cd tenant-app

# Run all tests
npm test

# Run specific test
npm test -- LoginScreen.test.tsx

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

## Test Structure

### Backend Tests (`backend/tests/`)

#### Unit Tests (`tests/unit/services.test.js`)
- **calculateEnterpriseDiscount**: 3.3% discount for 4+ buildings
- **calculateTurnoverQuote**: 1-BED, STUDIO calculations with discounts
- **applyPartsMarkup**: 20% markup calculation
- **calculateHealthScore**: Base 100, -5 per open ticket, +10 per completed PPM
- **processRentWaterfall**: 5% BIN fee, invoice deduction, owner payout
- **enforceTwoStrike**: Suspension at 2+ unpaid invoices

#### Integration Tests (`tests/integration/api.test.js`)
- POST /api/tickets/create (with/without photos, emergency charges)
- GET /api/tickets/:ticketId
- POST /api/units/moveout-request
- POST /api/owner/turnover-quotes/:quoteId/approve
- GET /api/owner/:ownerId/financials
- POST /api/technician/morning-check-in
- POST /api/technician/jobs/:jobId/close
- POST /api/admin/owners/:ownerId/suspend
- GET /health

#### E2E Tests (`tests/e2e/`)
- **tenant-workflow.e2e.js**: Register → Login → Create Ticket → Track Status → Move-Out Request
- **admin-workflow.e2e.js**: Admin Login → Financial Dashboard → Owner Management → Ticket Management

### Admin Panel Tests (`admin-panel/src/__tests__/`)

#### Component Tests
- **DashboardPage.test.tsx**: KPI display, financial metrics, chart rendering, 30-sec refresh
- **LiveMapPage.test.tsx**: Technician cards, status color-coding, location display, ETA, job counts

#### Service Tests
- **api.test.ts**: Login/logout, live map data, financial ticker, owner management, tickets, SOS feed

### Tenant App Tests (`tenant-app/src/__tests__/`)

#### Component Tests
- **LoginScreen.test.tsx**: Form rendering, credential submission, error alerts, loading states
- **CreateTicketScreen.test.tsx**: Visual Gate enforcement, SOS warning, photo requirements
- **HomeScreen.test.tsx**: Dashboard metrics, ticket list, action buttons

#### Service Tests
- **api.test.ts**: JWT handling, token storage, ticket operations, move-out operations

## Coverage Targets

| Package | Branches | Functions | Lines | Statements |
|---------|----------|-----------|-------|-----------|
| backend | 70% | 75% | 75% | 75% |
| admin-panel | 65% | 70% | 70% | 70% |
| tenant-app | 60% | 65% | 65% | 65% |

## Key Testing Patterns

### 1. Mocking API Calls
```typescript
jest.mock('../../services/api');

(apiClient.get as jest.Mock).mockResolvedValue({
  data: { /* response data */ }
});
```

### 2. Async Rendering
```typescript
render(<Component />);

await waitFor(() => {
  expect(screen.getByText('Expected Text')).toBeTruthy();
});
```

### 3. User Interactions
```typescript
fireEvent.changeText(input, 'text');
fireEvent.press(button);
```

### 4. Firebase Auth Testing
```typescript
jest.spyOn(firebase.auth(), 'signInWithEmailAndPassword')
  .mockResolvedValueOnce({ user: { uid: 'test-uid' } });
```

## Coverage Reports

Generate coverage after running tests:

```bash
# Backend
npm test -- --coverage
# View: backend/coverage/lcov-report/index.html

# Admin Panel
npm test -- --coverage
# View: admin-panel/coverage/lcov-report/index.html

# Tenant App
npm test -- --coverage
# View: tenant-app/coverage/lcov-report/index.html
```

## Continuous Integration

### GitHub Actions Workflow

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: cd backend && npm install && npm test -- --coverage
      - uses: codecov/codecov-action@v2

  admin:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: cd admin-panel && npm install && npm test -- --coverage
      - uses: codecov/codecov-action@v2

  tenant:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: cd tenant-app && npm install && npm test -- --coverage
      - uses: codecov/codecov-action@v2
```

## Testing Checklist

- [x] Unit tests for business logic (services)
- [x] Integration tests for API endpoints
- [x] E2E workflow tests (tenant, admin)
- [x] Component tests (login, create ticket, dashboard)
- [x] API client service tests
- [x] Jest configuration for all packages
- [x] Coverage thresholds defined
- [ ] Firebase auth mocking in CI
- [ ] Performance benchmark tests
- [ ] Security penetration tests

## Debugging Tests

### Run Single Test
```bash
npm test -- --testNamePattern="should create ticket"
```

### Debug in Node Inspector
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Print Debug Output
```typescript
screen.debug(); // React Testing Library
console.log(response.data); // HTTP responses
```

## Test Maintenance

- Update tests when business logic changes
- Mock external dependencies (Firebase, APIs, image picker)
- Keep test data realistic but minimal
- Use `beforeEach` to reset mocks
- Document complex test scenarios
- Run coverage reports before commits

## Next Steps

1. **Run backend tests** to verify business logic:
   ```bash
   cd backend && npm install && npm test -- --coverage
   ```

2. **Run admin panel tests**:
   ```bash
   cd admin-panel && npm install && npm test -- --coverage
   ```

3. **Run tenant app tests**:
   ```bash
   cd tenant-app && npm install && npm test -- --coverage
   ```

4. **Check coverage** for all packages (target: 70%+)

5. **Set up CI/CD** with GitHub Actions

6. **Deploy test environment** with Firebase Emulator Suite

