// admin-panel/src/services/api.ts
// Fail-closed: production Admin must not call localhost or an undeployed REST API.
// Admin operations must use Firebase Auth, Firestore, Storage, and HTTPS callables.

type RefusedMethod = (...args: any[]) => never;

const REFUSED: RefusedMethod = () => {
  throw new Error(
    'Admin REST apiClient is disabled. Use Firebase Auth, Firestore, and Cloud Functions callables; localStorage adminToken is not an authorization source.',
  );
};

export const apiClient = {
  login: REFUSED,
  logout: () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('adminToken');
    }
  },
  getLiveMap: REFUSED,
  getFinancialTicker: REFUSED,
  getSOSFeed: REFUSED,
  getAllOwners: REFUSED,
  getOwnerDetails: REFUSED,
  suspendOwner: REFUSED,
  getTickets: REFUSED,
  getTechnicians: REFUSED,
  createTechnician: REFUSED,
  healthCheck: REFUSED,
  get: REFUSED,
  post: REFUSED,
  put: REFUSED,
  patch: REFUSED,
  delete: REFUSED,
  request: REFUSED,
  interceptors: {
    request: { use: () => undefined },
    response: { use: () => undefined },
  },
};

export default apiClient;
