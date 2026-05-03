// admin-panel/src/services/api.ts
import axios from 'axios';
import type { AxiosInstance } from 'axios';

interface ApiConfig {
  baseURL: string;
  timeout?: number;
}

class AdminApiClient {
  private client: AxiosInstance;

  constructor(config: ApiConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
    });

    // Add JWT to requests
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('adminToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  // Auth
  async login(email: string, password: string) {
    const response = await this.client.post('/auth/login', { email, password });
    if (response.data.token) {
      localStorage.setItem('adminToken', response.data.token);
    }
    return response.data;
  }

  async logout() {
    localStorage.removeItem('adminToken');
  }

  // Admin endpoints
  async getLiveMap() {
    return this.client.get('/api/admin/technicians/live-map');
  }

  async getFinancialTicker() {
    return this.client.get('/api/admin/financials/daily');
  }

  async getSOSFeed() {
    return this.client.get('/api/admin/sos-tickets/live');
  }

  async getAllOwners() {
    return this.client.get('/api/admin/owners');
  }

  async getOwnerDetails(ownerId: string) {
    return this.client.get(`/api/admin/owners/${ownerId}`);
  }

  async suspendOwner(ownerId: string, reason: string) {
    return this.client.post(`/api/admin/owners/${ownerId}/suspend`, { reason });
  }

  async getTickets(filters?: Record<string, any>) {
    return this.client.get('/api/admin/tickets', { params: filters });
  }

  async getTechnicians() {
    return this.client.get('/api/admin/technicians');
  }

  async createTechnician(data: any) {
    return this.client.post('/api/admin/technicians', data);
  }

  async getReports(startDate: string, endDate: string) {
    return this.client.get('/api/admin/reports', {
      params: { startDate, endDate },
    });
  }

  async healthCheck() {
    return this.client.get('/health');
  }

  // Generic methods
  async get(url: string, config?: any) {
    return this.client.get(url, config);
  }

  async post(url: string, data?: any, config?: any) {
    return this.client.post(url, data, config);
  }
}

const adminApiClient = new AdminApiClient({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  timeout: 30000,
});

export const apiClient = adminApiClient;
export default adminApiClient;
