// admin-panel/src/__tests__/services/api.test.ts
import { apiClient } from '../../services/api';

describe('Admin Panel legacy REST API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.removeItem = jest.fn();
  });

  test('exposes compatibility methods for legacy imports', () => {
    expect(apiClient.get).toBeDefined();
    expect(apiClient.post).toBeDefined();
    expect(apiClient.getLiveMap).toBeDefined();
    expect(apiClient.getAllOwners).toBeDefined();
    expect(apiClient.suspendOwner).toBeDefined();
  });

  test('fails closed instead of calling localhost REST APIs', () => {
    expect(() => apiClient.get('/api/admin/reports')).toThrow(/REST apiClient is disabled/i);
    expect(() => apiClient.post('/auth/login', {})).toThrow(/REST apiClient is disabled/i);
  });

  test('logout only clears the legacy token cache', () => {
    const removeSpy = jest.spyOn(Storage.prototype, 'removeItem');
    apiClient.logout();
    expect(removeSpy).toHaveBeenCalledWith('adminToken');
  });
});
