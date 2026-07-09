# Functions Runtime Export Status

The new runtime modules are ready and now exposed through the active Functions runtime aggregator:

- `functions/slaPolicy.ts`
- `functions/completionGuards.ts`
- `functions/ticketLifecycleV2.ts`
- `functions/runtimeAll.ts`

`functions/package.json` points Firebase Functions to `lib/runtimeAll.js`, so the deployable TypeScript export must live in `functions/runtimeAll.ts`.

## Applied export

The following export has been added to `functions/runtimeAll.ts`:

```ts
export { updateTicketLifecycleV2 } from './ticketLifecycleV2';
```

## Validation before public launch

Run:

```bash
npm run build:functions
node scripts/verify-functions-module-readiness.mjs
node scripts/verify-functions-sla-policy.mjs
node scripts/verify-tech-close-gates.mjs
```

Do not mark the Functions runtime complete until the Functions build passes and the callable is verified in Firebase after deploy.
