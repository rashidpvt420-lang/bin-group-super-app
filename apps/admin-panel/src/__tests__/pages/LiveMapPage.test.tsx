// admin-panel/src/__tests__/pages/LiveMapPage.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LiveMapPage from '../../pages/map/LiveMapPage';
import { apiClient } from '../../services/api';

jest.mock('../../services/api');

describe('AdminPanel - LiveMapPage', () => {
  const mockTechnicians = [
    {
      technicianId: 'TECH_042',
      name: 'Ahmed Al-Mansouri',
      status: 'ON_ROUTE',
      currentLocation: { lat: 25.2048, lng: 55.2708 },
      nextJobETA: '8 min',
      jobsCompleted: 12,
      jobsRemaining: 3,
    },
    {
      technicianId: 'TECH_043',
      name: 'Sara Al-Zaabi',
      status: 'ARRIVED',
      currentLocation: { lat: 25.1972, lng: 55.2697 },
      nextJobETA: '0 min',
      jobsCompleted: 8,
      jobsRemaining: 2,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { technicians: mockTechnicians },
    });
  });

  test('should render live map page', async () => {
    render(<LiveMapPage />);

    expect(screen.getByText(/Live Technician Tracking/)).toBeTruthy();
  });

  test('should display technician cards', async () => {
    render(<LiveMapPage />);

    await waitFor(() => {
      expect(screen.getByText(/Ahmed Al-Mansouri/)).toBeTruthy();
      expect(screen.getByText(/Sara Al-Zaabi/)).toBeTruthy();
    });
  });

  test('should show technician status', async () => {
    render(<LiveMapPage />);

    await waitFor(() => {
      expect(screen.getByText(/ON_ROUTE|On Route/)).toBeTruthy();
      expect(screen.getByText(/ARRIVED|Arrived/)).toBeTruthy();
    });
  });

  test('should display coordinates', async () => {
    render(<LiveMapPage />);

    await waitFor(() => {
      expect(screen.getByText(/25\.2048|25.20/)).toBeTruthy();
      expect(screen.getByText(/55\.2708|55.27/)).toBeTruthy();
    });
  });

  test('should show ETA for on-route technicians', async () => {
    render(<LiveMapPage />);

    await waitFor(() => {
      expect(screen.getByText(/8 min/)).toBeTruthy(); // Ahmed
    });
  });

  test('should show job counts', async () => {
    render(<LiveMapPage />);

    await waitFor(() => {
      expect(screen.getByText(/12.*Completed|Completed.*12/)).toBeTruthy();
      expect(screen.getByText(/3.*Remaining|Remaining.*3/)).toBeTruthy();
    });
  });

  test('should refresh map every 30 seconds', async () => {
    jest.useFakeTimers();
    render(<LiveMapPage />);

    expect(apiClient.get).toHaveBeenCalled();

    jest.advanceTimersByTime(30000);

    expect(apiClient.get).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  test('should handle empty technician list', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: { technicians: [] },
    });

    render(<LiveMapPage />);

    await waitFor(() => {
      expect(screen.getByText(/No technicians/i)).toBeTruthy();
    });
  });
});
