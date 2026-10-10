// The retired Admin intake URL has one explicit canonical destination. Keep
// every other route exact so wildcard or authentication redirects still fail.
export function expectedAuthenticatedRoute(role: string, route: string): string {
  return role === 'Admin' && route === '/onboard-property' ? '/vault' : route;
}
