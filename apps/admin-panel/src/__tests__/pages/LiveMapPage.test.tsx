// admin-panel/src/__tests__/pages/LiveMapPage.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LiveMapPage from '../../pages/map/LiveMapPage';

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  documentId: jest.fn(),
  onSnapshot: (...args: any[]) => {
    const cb = args.find(a => typeof a === 'function');
    if (cb) cb({ docs: [] });
    return () => {};
  },
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(),
}));

jest.mock('../../lib/firebase', () => ({
  db: {},
  functions: {},
}));

jest.mock('../../lib/googleMaps', () => ({
  loadAdminGoogleMaps: () => Promise.resolve({
    Map: jest.fn(),
    Marker: jest.fn(),
    LatLngBounds: jest.fn(() => ({ extend: jest.fn() })),
    SymbolPath: { CIRCLE: 0, BACKWARD_CLOSED_ARROW: 1 },
  }),
  googleMapsSearchUrl: jest.fn(),
}));

// Provide a mock global google object if the component relies on window.google.maps
beforeAll(() => {
  (global as any).window.google = {
    maps: {
      Map: jest.fn(),
      Marker: jest.fn(),
      LatLngBounds: jest.fn(() => ({ extend: jest.fn() })),
      SymbolPath: { CIRCLE: 0, BACKWARD_CLOSED_ARROW: 1 },
    }
  };
});

describe('AdminPanel - LiveMapPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should render live map page', async () => {
    render(<LiveMapPage />);
    expect(screen.getByText(/Operational Dispatch Map/)).toBeInTheDocument();
  });

  test('should render stats chips correctly', async () => {
    render(<LiveMapPage />);
    expect(screen.getByText(/0 unresolved tickets/)).toBeInTheDocument();
    expect(screen.getByText(/0 awaiting assignment/)).toBeInTheDocument();
    expect(screen.getByText(/0 active technicians/)).toBeInTheDocument();
    expect(screen.getByText(/0 verified property pins/)).toBeInTheDocument();
    expect(screen.getByText(/0 fresh GPS sessions/)).toBeInTheDocument();
  });

  test('should display no tickets message', async () => {
    render(<LiveMapPage />);
    expect(screen.getByText(/No unresolved tickets/)).toBeInTheDocument();
  });
});
