# Getting Started - HOME OS Development

**Last Updated**: February 19, 2026  
**Status**: All applications ready for local development

---

## Prerequisites

You'll need:
- Node.js 18+ and npm 9+
- Git
- VS Code (recommended)
- For mobile apps: React Native dev environment (optional)
- For Firebase: GCP account (for production only)

**Verify Installation**:
```bash
node --version    # Should be v18.x or higher
npm --version     # Should be 9.x or higher
```

---

## Quick Start (5 minutes)

### 1. Start the Backend Server
```bash
cd "c:\Users\My-PC\Desktop\bin app\backend"
npm install
npm start
```
✓ Server runs on http://localhost:5000  
✓ All 40+ endpoints available  
✓ In-memory database initialized

**Test the backend**:
```bash
curl http://localhost:5000/health
# Response: { "status": "ok" }
```

### 2. Start the Admin Panel (React Web)
```bash
cd "c:\Users\My-PC\Desktop\bin app\admin-panel"
npm install
npm start
```
✓ Opens http://localhost:3000  
✓ Login with test credentials (see below)  
✓ Full dashboard, owner management, SOS feed available

### 3. Run Tests
```bash
cd "c:\Users\My-PC\Desktop\bin app\backend"
npm test -- --coverage

cd "c:\Users\My-PC\Desktop\bin app\admin-panel"
npm test -- --coverage
```

---

## Complete Setup Instructions

### Backend Setup

```bash
cd "c:\Users\My-PC\Desktop\bin app\backend"

# Install dependencies
npm install

# Create environment file (if needed)
echo FIREBASE_PROJECT_ID=test-project > .env
echo FIREBASE_API_KEY=test-key >> .env

# Start development server
npm start
```

**Available Scripts**:
```bash
npm start              # Start server on port 5000
npm test               # Run all tests
npm test -- --watch   # Watch mode
npm test -- --coverage # Coverage report
npm run dev            # Start with nodemon
```

**API Endpoints Available**:
```
POST   /api/auth/login                    (Email login)
POST   /api/auth/register                 (Account creation)
POST   /api/tickets/create                (Create maintenance ticket)
GET    /api/tickets/:ticketId/quote       (Get quote for ticket)
GET    /api/owner/:ownerId/buildings      (List owner properties)
GET    /api/owner/:ownerId/health-score   (Health score analysis)
GET    /api/health                        (Server health check)
... and 33+ more endpoints
```

**Test Credentials** (for in-memory testing):
```
Email: test@owner.com
Password: password123
Role: OWNER

Email: admin@bingroup.ae
Password: admin123
Role: ADMIN

Email: tech@bingroup.ae
Password: tech123
Role: TECHNICIAN
```

---

### Admin Panel Setup

```bash
cd "c:\Users\My-PC\Desktop\bin app\admin-panel"

# Install dependencies
npm install

# Create environment file
echo REACT_APP_API_URL=http://localhost:5000 > .env
echo REACT_APP_FIREBASE_CONFIG='{}' >> .env

# Start development server
npm start
```

**Features to Explore**:
1. **Dashboard** (http://localhost:3000/dashboard)
   - Financial KPIs, collections vs expenses chart
   - Weekly revenue trend, success rate metrics

2. **Live Map** (http://localhost:3000/map)
   - Real-time technician locations (mock data)
   - Status color-coding, ETA display, job counts

3. **Owner Management** (http://localhost:3000/owners)
   - Owner list with suspension controls
   - Financial tracking, suspension dialogs

4. **Tickets** (http://localhost:3000/tickets)
   - Filter by status, priority, search
   - Response time calculations, status management

5. **Technicians** (http://localhost:3000/technicians)
   - Performance cards with ratings
   - Completion rates, job counts, earnings

6. **Reports** (http://localhost:3000/reports)
   - Date range filtering, analytics charts
   - CSV export functionality

7. **SOS Feed** (http://localhost:3000/sos)
   - Live emergency notifications
   - Auto-refresh every 5 seconds, priority color-coding

**Available Scripts**:
```bash
npm start              # Start on port 3000
npm test               # Run tests
npm test -- --watch   # Watch mode
npm run build          # Production build
npm run lint           # ESLint
```

---

### Tenant App Setup

```bash
cd "c:\Users\My-PC\Desktop\bin app\tenant-app"

# Install dependencies
npm install

# Configure API endpoint
echo REACT_APP_API_URL=http://localhost:5000 > .env

# For React Native (Expo)
npx expo start
```

**Screens Available**:
1. **Login Screen** - Email/password authentication
2. **Create Ticket Screen** - Visual Gate (photo/video required)
3. **Home Screen** - Open/total tickets dashboard
4. **Move-Out Screen** - Request with 7-day minimum notice
5. **Profile Screen** - Account settings and logout

**Mobile Testing**:
```bash
# iOS (macOS only)
npx expo start --ios

# Android
npx expo start --android

# Web (Recommended for quick testing)
npx expo start --web
```

---

### Owner App Setup

```bash
cd "c:\Users\My-PC\Desktop\bin app\owner-app"

# Install dependencies
npm install

# Configure API endpoint
echo REACT_APP_API_URL=http://localhost:5000 > .env

# Start development
npm start
```

**Pages Available**:
1. **Dashboard** - Property overview with occupancy
2. **Health Score** - Score analysis with trends
3. **Turnover Engine** - Quote approval workflow
4. **Financial Dashboard** - Waterfall breakdown
5. **Property Management** - Building/unit listing

**Login with**:
```
Email: test@owner.com
Password: password123
```

---

### Technician App Setup

```bash
cd "c:\Users\My-PC\Desktop\bin app\technician-app"

# Install dependencies
npm install

# Configure API endpoint
echo REACT_APP_API_URL=http://localhost:5000 > .env

# Start with React Native
npx expo start
```

**Screens Available**:
1. **Morning Gate** - 08:00 AM check-in with photo
2. **Daily Schedule** - Job routing with priorities
3. **Proof of Work** - Before/after + signature
4. **Earnings Track** - Real-time earnings display
5. **QR Scanner** - Asset validation

**Login with**:
```
Email: tech@bingroup.ae
Password: tech123
```

---

## Development Workflow

### 1. Working on Backend

```bash
# Terminal 1: Backend
cd backend
npm run dev    # Starts with auto-reload

# Terminal 2: Run tests in watch mode
cd backend
npm test -- --watch

# Terminal 3: Test API calls
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@bingroup.ae","password":"admin123"}'
```

### 2. Working on Admin Panel

```bash
# Terminal 1: Backend (keep running)
cd backend
npm start

# Terminal 2: Admin Panel
cd admin-panel
npm start    # Opens http://localhost:3000

# Terminal 3: Tests in watch mode
cd admin-panel
npm test -- --watch
```

### 3. Working on Mobile Apps

```bash
# Terminal 1: Backend (keep running)
cd backend
npm start

# Terminal 2: Start mobile dev server
cd tenant-app
npx expo start

# Terminal 3: Run on web
npx expo start --web

# Or scan QR code on your phone to test with Expo app
```

---

## Debugging Tips

### Backend Debugging

Enable detailed logging:
```javascript
// In backend/src/index.js, uncomment:
process.env.DEBUG_MODE = true;
```

View request/response logs:
```bash
# Check console output for incoming requests
# Look for: [REQUEST] POST /api/tickets/create
# And: [RESPONSE] Status: 201
```

### Admin Panel Debugging

Open React Developer Tools:
```bash
# In Chrome DevTools:
# Go to Components tab to inspect React component tree
# Use Profiler to check performance
# Redux DevTools to trace state changes
```

**Common Issues**:
- **CORS Error**: Make sure backend is running on http://localhost:5000
- **API 401 Error**: Check that test credentials are correct
- **Login Page Stuck**: Clear browser cache and localStorage

```javascript
// Clear localStorage in browser console:
localStorage.clear();
location.reload();
```

### Mobile App Debugging

Use Expo DevTools:
```bash
# After running: npx expo start
# Press 'j' to open debugger
# Press 'r' to reload app
# Press 'i' to open iOS simulator
# Press 'a' to open Android emulator
```

View network requests:
```bash
# In Expo DevTools, look for network tab
# All axios requests will be logged
```

---

## Testing

### Run All Tests

```bash
# Backend tests
cd backend
npm test -- --coverage

# Admin panel tests
cd admin-panel
npm test -- --coverage

# Tenant app tests
cd tenant-app
npm test -- --coverage
```

### Expected Coverage
- Backend: 75%+ coverage
- Admin Panel: 70%+ coverage
- Tenant App: 65%+ coverage

### Run Specific Tests

```bash
# Test a single file
npm test -- LoginScreen.test.tsx

# Test with specific pattern
npm test -- --testNamePattern="health score"

# Run in watch mode
npm test -- --watch
```

### Debug Failing Tests

```bash
# Run test with descriptive output
npm test -- --verbose

# Run single test file only
npm test -- services.test.ts

# See all available test cases
npm test -- --listTests
```

---

## Environment Configuration

### Backend (.env)

```env
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_API_KEY=your-api-key
FIREBASE_AUTH_DOMAIN=your-auth-domain

# Database
DB_TYPE=firestore          # or 'memory' for development

# Server
PORT=5000
NODE_ENV=development

# Security
JWT_SECRET=your-secret-key
JWT_EXPIRY=7d

# Feature Flags
ENABLE_AUTO_DISPATCH=true
ENABLE_SMS_ALERTS=true
MAINTENANCE_MODE=false
```

### Frontend (.env)

```env
# API Configuration
REACT_APP_API_URL=http://localhost:5000
REACT_APP_API_TIMEOUT=30000

# Firebase
REACT_APP_FIREBASE_CONFIG={...}
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...

# Feature Flags
REACT_APP_ENABLE_MAPS=true
REACT_APP_ENABLE_ANALYTICS=true
REACT_APP_DEBUG_MODE=false
```

---

## Production Deployment

### Pre-Deployment Checklist

```bash
# 1. Run all tests
npm test -- --coverage

# 2. Build frontend
npm run build

# 3. Security audit
npm audit

# 4. Environment variables
# Set all production .env values

# 5. Database migration
npm run migrate

# 6. Firebase deploy
firebase deploy

# 7. Health check
curl https://api.homeos.ae/health
```

### Deployment Commands

```bash
# Backend (Node.js + Express)
npm run build
npm run start:prod

# Admin Panel (React)
npm run build
# Upload build/ folder to web server

# Mobile Apps (React Native)
# iOS: eas build --platform ios
# Android: eas build --platform android
```

---

## Common Commands Reference

### Backend
```bash
npm start              # Start server
npm test               # Run tests
npm run dev            # Start with auto-reload
npm run migrate        # Run database migrations
npm audit              # Security check
```

### Admin Panel
```bash
npm start              # Start dev server
npm build              # Production build
npm test               # Run tests
npm run lint           # Check code style
npm audit              # Security check
```

### Tenant App
```bash
npx expo start         # Start dev server
npx expo start --web   # Start web version
npm test               # Run tests
eas build              # Build for iOS/Android
```

### Owner App
```bash
npm start              # Start dev server
npm build              # Production build
npm test               # Run tests
npm run lint           # Check code style
```

### Technician App
```bash
npx expo start         # Start dev server
npx expo start --web   # Start web version
npm test               # Run tests
eas build              # Build for iOS/Android
```

---

## Troubleshooting

### Port Already in Use

```bash
# Find what's using port 5000
netstat -ano | findstr :5000

# Kill the process (Windows)
taskkill /PID <PID> /F

# Kill the process (Mac/Linux)
kill -9 <PID>
```

### npm install Issues

```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules
rm -rf node_modules
rm package-lock.json

# Reinstall
npm install
```

### Database Connection Issues

```bash
# Check if backend is running
curl http://localhost:5000/health

# If not responding, restart:
npm start

# Check console for error messages
# Look for: "Database connected" confirmation
```

### API Timeout

```bash
# Increase timeout in frontend .env
REACT_APP_API_TIMEOUT=60000

# Or in Axios config:
api.defaults.timeout = 60000;
```

### Authentication Issues

```bash
# Clear stored tokens
localStorage.clear();
sessionStorage.clear();

# Check backend auth logs
# Look for: [AUTH] Token validation

# Verify test credentials work
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@bingroup.ae","password":"admin123"}'
```

---

## Next Steps

1. ✅ **Start Backend** - `npm start` in backend folder
2. ✅ **Start Admin Panel** - `npm start` in admin-panel folder
3. ✅ **Explore Features** - Navigate to http://localhost:3000
4. ✅ **Run Tests** - `npm test` in each folder
5. ✅ **Customize Styling** - Update Material-UI theme
6. ✅ **Integrate Firebase** - Set up real GCP project
7. ✅ **Add Third-Party APIs** - Google Maps, OpenAI, Stripe

---

## Documentation Links

- 📖 [API Specification](./docs/API_SPECIFICATION.md) - 40+ endpoints
- 📊 [Database Schema](./docs/DATABASE_SCHEMA.md) - 11 collections
- 💰 [Financial Logic](./docs/FINANCIAL_LOGIC.md) - Algorithms
- 🧪 [Testing Guide](./TESTING.md) - Test coverage
- 🚀 [Deployment Guide](./docs/DEPLOYMENT.md) - Production setup
- 🗺️ [Project Roadmap](./docs/ROADMAP.md) - 16-week timeline

---

## Support & Questions

- **Backend Issues**: Check `backend/logs/` folder
- **Frontend Issues**: Open browser DevTools (F12)
- **Mobile Issues**: Check Expo console output
- **Database Issues**: Check Firebase console

---

**Ready to start?** Run these commands in order:

```bash
# Terminal 1: Backend
cd "c:\Users\My-PC\Desktop\bin app\backend"
npm install && npm start

# Terminal 2: Admin Panel
cd "c:\Users\My-PC\Desktop\bin app\admin-panel"
npm install && npm start

# Terminal 3: Tests
cd "c:\Users\My-PC\Desktop\bin app\backend"
npm test -- --coverage
```

**Happy coding!** 🚀
