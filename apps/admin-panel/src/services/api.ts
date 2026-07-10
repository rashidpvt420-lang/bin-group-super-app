// Compatibility adapter for legacy imports only.
// The production Admin Panel uses Firebase Auth, Firestore, Storage, and callable
// Cloud Functions. No localhost REST server exists in this repository.

export class AdminApiClient {
  private readonly baseURL: string;

  constructor(baseURL = String(process.env.REACT_APP_API_URL || '').trim()) {
    this.baseURL = baseURL.replace(/\/+$/, '');
  }

  private unavailable(endpoint: string): never {
    const suffix = this.baseURL ? ` Configured legacy base URL: ${this.baseURL}.` : '';
    throw new Error(`Legacy REST endpoint ${endpoint} is retired. Use the canonical Firebase service or callable Cloud Function.${suffix}`);
  }

  async login(_email: string, _password: string) { return this.unavailable('/auth/login'); }
  async logout() { localStorage.removeItem('adminToken'); }
  async getLiveMap() { return this.unavailable('/api/admin/technicians/live-map'); }
  async getFinancialTicker() { return this.unavailable('/api/admin/financials/daily'); }
  async getSOSFeed() { return this.unavailable('/api/admin/sos-tickets/live'); }
  async getAllOwners() { return this.unavailable('/api/admin/owners'); }
  async getOwnerDetails(ownerId: string) { return this.unavailable(`/api/admin/owners/${ownerId}`); }
  async suspendOwner(ownerId: string, _reason: string) { return this.unavailable(`/api/admin/owners/${ownerId}/suspend`); }
  async getTickets(_filters?: Record<string, unknown>) { return this.unavailable('/api/admin/tickets'); }
  async getTechnicians() { return this.unavailable('/api/admin/technicians'); }
  async createTechnician(_data: unknown) { return this.unavailable('/api/admin/technicians'); }
  async healthCheck() { return this.unavailable('/health'); }
  async get(url: string, _config?: unknown) { return this.unavailable(url); }
  async post(url: string, _data?: unknown, _config?: unknown) { return this.unavailable(url); }
}

export const apiClient = new AdminApiClient();
export default apiClient;
