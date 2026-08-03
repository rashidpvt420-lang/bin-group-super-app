import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import LoginPage from '../pages/auth/LoginPage';
import { useAuth } from '../context/AuthContext';

jest.mock('../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../components/security/AdminAppCheckGate', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-appcheck-gate">{children}</div>
  ),
}));

jest.mock('../components/UnifiedLogin', () => ({
  __esModule: true,
  default: () => <div data-testid="unified-login">Admin login</div>,
}));

const mockedUseAuth = useAuth as jest.Mock;

const Destination = () => {
  const location = useLocation();
  return (
    <div data-testid="admin-login-destination">
      {`${location.pathname}${location.search}${location.hash}`}
    </div>
  );
};

const renderLoginRoute = (entry: string) => render(
  <MemoryRouter initialEntries={[entry]}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<Destination />} />
    </Routes>
  </MemoryRouter>,
);

describe('Admin LoginPage route guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('redirects an already-authorized session to a sanitized internal returnTo before mounting login', () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      status: 'authorized',
    });

    renderLoginRoute('/login?returnTo=%2Fprofile%3Ftab%3Dmfa%23factors');

    expect(screen.getByTestId('admin-login-destination')).toHaveTextContent('/profile?tab=mfa#factors');
    expect(screen.queryByTestId('admin-appcheck-gate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('unified-login')).not.toBeInTheDocument();
  });

  test('rejects an external returnTo for an already-authorized session', () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      status: 'authorized',
    });

    renderLoginRoute('/login?returnTo=https%3A%2F%2Fevil.example%2Fsteal');

    expect(screen.getByTestId('admin-login-destination')).toHaveTextContent('/dashboard');
    expect(screen.queryByTestId('admin-appcheck-gate')).not.toBeInTheDocument();
  });

  test('does not redirect or expose protected content before authorization is complete', () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      status: 'verifying-profile',
    });

    renderLoginRoute('/login?returnTo=%2Fdashboard');

    expect(screen.getByTestId('admin-appcheck-gate')).toBeInTheDocument();
    expect(screen.getByTestId('unified-login')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-login-destination')).not.toBeInTheDocument();
  });

  test('keeps an unauthenticated session behind the App Check credential gate', () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: false,
      status: 'idle',
    });

    renderLoginRoute('/login');

    expect(screen.getByTestId('admin-appcheck-gate')).toBeInTheDocument();
    expect(screen.getByTestId('unified-login')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-login-destination')).not.toBeInTheDocument();
  });
});
