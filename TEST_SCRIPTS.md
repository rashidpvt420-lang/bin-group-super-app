## Package.json Test Scripts Reference

Add these scripts to your `package.json` files:

### Backend (backend/package.json)
```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest tests/unit/",
    "test:integration": "jest tests/integration/",
    "test:e2e": "jest tests/e2e/",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:coverage:watch": "jest --coverage --watch",
    "test:debug": "node --inspect-brk node_modules/.bin/jest --runInBand"
  }
}
```

### Admin Panel (admin-panel/package.json)
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:coverage:watch": "jest --coverage --watch",
    "test:debug": "node --inspect-brk node_modules/.bin/jest --runInBand",
    "test:update-snapshots": "jest -u"
  }
}
```

### Tenant App (tenant-app/package.json)
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:coverage:watch": "jest --coverage --watch",
    "test:debug": "node --inspect-brk node_modules/.bin/jest --runInBand",
    "test:update-snapshots": "jest -u"
  }
}
```

## Installation Commands

Run in each package directory:

```bash
# Backend
cd backend
npm install --save-dev jest supertest

# Admin Panel
cd admin-panel
npm install --save-dev jest @testing-library/react @testing-library/jest-dom identity-obj-proxy

# Tenant App
cd tenant-app
npm install --save-dev jest @testing-library/react-native @testing-library/jest-dom
```

## Quick Test Commands

Run from workspace root:

```bash
# Test everything
npm run test:all

# Backend only
cd backend && npm test

# Admin only
cd admin-panel && npm test

# Tenant only
cd tenant-app && npm test

# All with coverage
npm run test:coverage:all
```
