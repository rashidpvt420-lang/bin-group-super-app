// admin-panel/src/__tests__/pages/LiveMapPage.test.tsx
// LiveMapPage reads canonical Firestore listeners (maintenanceTickets, technicians,
// technician_live_locations, properties) and dispatches through adminAssignTechnician.
// Firebase and Google Maps are fully mocked: this test never opens a real listener.
// (The previous version mocked a REST apiClient the page no longer uses, so every render
// opened real listeners against the production project and all assertions failed.)
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

type Listener = { target: any; next: (snapshot: any) => void; error: (error: any) => void };
const listeners: Listener[] = [];
const mockAssignTechnician = jest.fn();

jest.mock('../../lib/firebase', () => ({ db: { mocked: 'db' }, functions: { mocked: 'functions' } }));
jest.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ collection: name }),
  query: (ref: any, ...constraints: any[]) => ({ ...ref, constraints }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  documentId: () => '__name__',
  onSnapshot: (target: any, next: any, error: any) => {
    listeners.push({ target, next, error });
    return () => undefined;
  },
}));
jest.mock('firebase/functions', () => ({
  httpsCallable: (_functions: unknown, name: string) => (payload: unknown) => mockAssignTechnician(name, payload),
}));
jest.mock('../../lib/googleMaps', () => ({
  loadAdminGoogleMaps: () => Promise.reject(new Error('GOOGLE_MAPS_API_KEY_MISSING')),
  googleMapsSearchUrl: (lat: number, lng: number) => `https://maps.example.invalid/?q=${lat},${lng}`,
}));

// eslint-disable-next-line import/first
import LiveMapPage from '../../pages/map/LiveMapPage';

const snapshot = (rows: Array<Record<string, any>>) => ({
  docs: rows.map(({ id, ...data }) => ({ id, data: () => data })),
});
const listenersFor = (name: string) => listeners.filter((listener) => listener.target.collection === name);

function emitTickets(rows: Array<Record<string, any>>) {
  // The page only publishes once every status chunk has answered.
  listenersFor('maintenanceTickets').forEach((listener, index) => listener.next(snapshot(index === 0 ? rows : [])));
}

beforeEach(() => {
  listeners.length = 0;
  mockAssignTechnician.mockReset();
});

test('renders the dispatch map from canonical listeners only', async () => {
  render(<LiveMapPage />);
  expect(screen.getByText('Operational Dispatch Map')).toBeInTheDocument();
  expect(listenersFor('maintenanceTickets').length).toBeGreaterThan(0);
  expect(listenersFor('technicians')).toHaveLength(1);
  expect(listenersFor('technician_live_locations')).toHaveLength(1);
  expect(listenersFor('technician_live_locations')[0].target.constraints).toEqual([{ field: 'isTracking', op: '==', value: true }]);
  expect(await screen.findByText(/Google Maps is unavailable: GOOGLE_MAPS_API_KEY_MISSING/)).toBeInTheDocument();
});

test('shows unresolved tickets once every status chunk has answered', async () => {
  render(<LiveMapPage />);
  const [first, ...rest] = listenersFor('maintenanceTickets');
  act(() => first.next(snapshot([{ id: 't1', status: 'UNASSIGNED', propertyName: 'Marina Tower 1204', issueDescription: 'AC leak' }])));
  expect(screen.queryByText('Marina Tower 1204')).not.toBeInTheDocument();
  act(() => rest.forEach((listener) => listener.next(snapshot([]))));
  expect(await screen.findByText('Marina Tower 1204')).toBeInTheDocument();
  expect(screen.getByText('1 unresolved tickets')).toBeInTheDocument();
  expect(screen.getByText('1 awaiting assignment')).toBeInTheDocument();
});

test('reports an empty feed without fabricating markers', async () => {
  render(<LiveMapPage />);
  act(() => emitTickets([]));
  expect(await screen.findByText('No unresolved tickets')).toBeInTheDocument();
  expect(screen.getByText('0 verified property pins')).toBeInTheDocument();
});

test('a failed ticket listener hides the whole feed (fail closed)', async () => {
  render(<LiveMapPage />);
  const [first, second] = listenersFor('maintenanceTickets');
  act(() => first.next(snapshot([{ id: 't1', status: 'UNASSIGNED', propertyName: 'Marina Tower 1204' }])));
  act(() => (second || first).error({ code: 'permission-denied' }));
  expect(await screen.findByText(/Unresolved ticket query \d+ of \d+ failed/)).toBeInTheDocument();
  expect(screen.queryByText('Marina Tower 1204')).not.toBeInTheDocument();
  expect(screen.queryByText('No unresolved tickets')).not.toBeInTheDocument();
});

test('a failed technician listener disables dispatch', async () => {
  render(<LiveMapPage />);
  act(() => emitTickets([{ id: 't1', status: 'UNASSIGNED', propertyName: 'Marina Tower 1204' }]));
  act(() => listenersFor('technicians')[0].error({ code: 'unavailable' }));
  expect(await screen.findByText(/Technician readiness data could not be loaded/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled();
});

test('assigning a ticket calls adminAssignTechnician with the ticket and technician ids', async () => {
  mockAssignTechnician.mockResolvedValue({ data: { status: 'SUCCESS' } });
  render(<LiveMapPage />);
  act(() => emitTickets([{ id: 't1', status: 'UNASSIGNED', propertyName: 'Marina Tower 1204' }]));
  act(() => listenersFor('technicians')[0].next(snapshot([
    { id: 'tech_a', displayName: 'Ahmed Al-Mansouri', trade: 'HVAC' },
    { id: 'tech_s', displayName: 'Suspended Tech', suspended: true },
  ])));
  expect(await screen.findByText('1 active technicians')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).queryByText('Suspended Tech')).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Assign' }));
  await waitFor(() => expect(mockAssignTechnician).toHaveBeenCalledWith('adminAssignTechnician', { ticketId: 't1', technicianId: 'tech_a' }));
});
