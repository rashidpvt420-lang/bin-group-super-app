// admin-panel/src/__tests__/pages/DashboardPage.test.tsx
// DashboardPage renders the route-safe Admin command centre (AdminSimpleDashboardPage). It has no
// data source: every action must go to a registered route, the SLA ladder must match the canonical
// policy, and pilot metrics must say "Not measured" instead of showing invented KPIs.
// (The previous version mocked a REST financial API the page no longer calls and rendered it
// outside a Router, so every case failed.)
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import DashboardPage from '../../pages/dashboard/DashboardPage';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

test('renders the Admin command centre', () => {
  renderDashboard();
  expect(screen.getByText('ADMIN COMMAND CENTER')).toBeInTheDocument();
  expect(screen.getByText('Everything that needs control today')).toBeInTheDocument();
  expect(screen.getByText('Hard launch remains evidence-gated')).toBeInTheDocument();
});

test.each([
  ['Payment Approvals', '/payments'],
  ['Live Dispatch', '/technicians/map'],
  ['Owner Activation', '/owners'],
  ['HR Command', '/hr'],
  ['Audit Log', '/audit'],
])('the %s action opens %s', (label, route) => {
  renderDashboard();
  fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));
  expect(screen.getByTestId('location')).toHaveTextContent(route);
});

test('shows the canonical SLA ladder', () => {
  renderDashboard();
  const minutes = screen.getAllByText(/^\d+m$/).map((node) => node.textContent);
  expect(minutes).toEqual(['30m', '120m', '240m', '480m', '1440m']);
  for (const key of ['EMERGENCY', 'HIGH', 'MEDIUM', 'STANDARD', 'LOW']) expect(screen.getByText(key)).toBeInTheDocument();
});

test('pilot metrics are reported as not measured, never as invented values', () => {
  renderDashboard();
  expect(screen.getAllByText('Not measured')).toHaveLength(6);
  for (const bar of screen.getAllByRole('progressbar')) expect(bar).toHaveAttribute('aria-valuenow', '0');
});
