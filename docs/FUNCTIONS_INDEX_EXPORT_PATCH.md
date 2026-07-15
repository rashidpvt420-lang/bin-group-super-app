# Functions Runtime Export Status

`functions/package.json` points Firebase Functions to `lib/runtimeAll.js`.
`runtimeAll.ts` exports `runtime.ts`, and `runtime.ts` exports the canonical
`updateTicketLifecycle` callable from `index.ts`.

`ticketLifecycleV2.ts` remains a non-deployed reference module. It is not
exported because two independently callable lifecycle writers would split
transition authority and evidence requirements.

## Validation before public launch

Run:

```bash
npm run build:functions
node scripts/verify-functions-module-readiness.mjs
node scripts/verify-functions-sla-policy.mjs
node scripts/verify-tech-close-gates.mjs
```

Do not mark the Functions runtime complete until the Functions build passes and
the canonical callable is verified through the protected deployment workflow.
