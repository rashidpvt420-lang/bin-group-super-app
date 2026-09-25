import { setGlobalOptions } from "firebase-functions/v2";

// Phase 10 Firebase authority bootstrap.
//
// This module MUST be imported before any function-definition modules. All
// second-generation Firebase callables inherit App Check enforcement unless a
// raw HTTP endpoint explicitly opts out because it authenticates with a
// provider signature, one-time public token, or dedicated gateway credential.
setGlobalOptions({
  region: "europe-west3",
  enforceAppCheck: true,
});
