// admin-panel/src/__tests__/pages/DashboardPage.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardPage from '../../pages/dashboard/DashboardPage';
import { apiClient } from '../../services/api';

jest.mock('../../services/api');
jest.mock('recharts', () => {
  // React is already imported at the top
  return {
    LineChart: (props: any) => <div data-testid="line-chart">{props.children}</div>,
    BarChart: (props: any) => <div data-testid="bar-chart">{props.children}</div>,
    Line: () => null,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
    ResponsiveContainer: (props: any) => <div>{props.children}</div>,
  };
});

describe('AdminPanel - DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('financials/daily')) {
        return Promise.resolve({
          data: {
            cashCollected: 125000,
            pending: 45000,
            overdue: 15000,
            successRate: 94.5,
            collections: { rent: 110000, services: 15000 },
            dailyTrend: [
              { date: '2026-02-13', collections: 80000, expenses: 32000 },
              { date: '2026-02-14', collections: 95000, expenses: 38000 },
            ],
            weeklyTrend: [
              { week: '1', amount: 180000 },
              { week: '2', amount: 220000 },
            ],
          },
        });
      }
      return Promise.reject(new Error('Not found'));
    });
  });

  test('should render dashboard', async () => {
    render(<DashboardPage />);

    expect(screen.getByText(/Dashboard/)).toBeTruthy();
  });

  test('should display KPI cards', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/Cash Collected/)).toBeTruthy();
    });
    expect(screen.getByText(/Pending Payments/)).toBeTruthy();
    expect(screen.getByText(/Overdue/)).toBeTruthy();
    expect(screen.getByText(/Success Rate/)).toBeTruthy();
  });

  test('should display financial metrics', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/125,000|125000/)).toBeTruthy(); // Cash collected
    });
    expect(screen.getByText(/45,000|45000/)).toBeTruthy();   // Pending
    expect(screen.getByText(/15,000|15000/)).toBeTruthy();   // Overdue
    expect(screen.getByText(/94.5%|94.5/)).toBeTruthy();     // Success rate
  });

  test('should render charts', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('bar-chart')).toBeTruthy();
    });
    expect(screen.getByTestId('line-chart')).toBeTruthy();
  });

  test('should refresh data on interval', async () => {
    jest.useFakeTimers();
    render(<DashboardPage />);

    expect(apiClient.get).toHaveBeenCalled();

    jest.advanceTimersByTime(30000); // Advance 30 seconds

    // Should have been called again
    expect(apiClient.get).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });
});
