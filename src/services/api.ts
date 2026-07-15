// Fail-closed: there is no localhost REST API in this monorepo.
// Portal operations must use Firebase Auth + Firestore / HTTPS callables.

const REFUSED = () => {
  throw new Error(
    'Legacy REST apiClient is disabled. Use Firebase Auth and Cloud Functions callables; localStorage ownerToken is not an authorization source.',
  );
};

export const apiClient = {
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
