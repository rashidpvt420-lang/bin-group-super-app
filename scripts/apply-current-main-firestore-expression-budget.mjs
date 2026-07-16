// Compatibility entry point retained for historical workflows and local tooling.
// The old implementation reintroduced four overlapping ticket-update rules,
// which recreated the Firestore 1,000-expression overflow it was meant to fix.
// Delegate only to the canonical bounded authority transforms.
await import('./apply-ticket-rule-binding.mjs');
await import('./harden-broker-kyc-rules.mjs');
await import('./harden-final-firestore-authority.mjs');

console.log('[current-main-expression-budget] canonical bounded Firestore authority applied');
