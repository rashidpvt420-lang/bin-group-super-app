// admin-panel/src/__tests__/pages/DashboardPage.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardPage from '../../pages/dashboard/DashboardPage';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}));

describe('AdminPanel - DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should render dashboard command center', () => {
    render(<DashboardPage />);
    expect(screen.getByText(/ADMIN COMMAND CENTER/)).toBeInTheDocument();
    expect(screen.getByText(/Everything that needs control today/)).toBeInTheDocument();
  });

  test('should render all route actions', () => {
    render(<DashboardPage />);
    expect(screen.getByText(/SLA Command/)).toBeInTheDocument();
    expect(screen.getByText(/Live Dispatch/)).toBeInTheDocument();
    expect(screen.getByText(/Sovereign Control/)).toBeInTheDocument();
  });
});
