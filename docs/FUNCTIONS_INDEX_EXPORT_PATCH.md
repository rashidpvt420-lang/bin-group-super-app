# Required Functions Index Export Patch

The new runtime modules are ready:

- `functions/slaPolicy.ts`
- `functions/completionGuards.ts`
- `functions/ticketLifecycleV2.ts`

To deploy the new callable, add this export near the other top-level exports in `functions/index.ts`:

```ts
export { updateTicketLifecycleV2 } from './ticketLifecycleV2';
```

Recommended location:

```ts
export { deliverNotificationPush } from './notificationDelivery';
export { mintAdminBridgeToken } from './adminBridgeAuth';
export { updateTicketLifecycleV2 } from './ticketLifecycleV2';
```

## Why this is separate

`functions/index.ts` is a large file. The GitHub connector requires complete file replacement for updates, so the safer path in this PR is to add the implementation module and verifier first, then apply this one-line export from a local checkout or a patch-capable editor.

## Validation after applying

Run:

```bash
npm run build:functions
node scripts/verify-functions-module-readiness.mjs
node scripts/verify-functions-sla-policy.mjs
node scripts/verify-tech-close-gates.mjs
```

Do not mark Functions runtime complete until the export exists and the Functions build passes.
