# Company stamp asset

Statements and newly signed contracts use a drawn text seal ("Digitally issued") until the real stamp is supplied.

To switch to the real BIN GROUP stamp:

1. Add a transparent PNG (about 600x600 px) to this folder, e.g. `bin-group-stamp.png`.
2. In `functions/companySeal.ts` set `COMPANY_SEAL_CONFIG.stampImageFile = "bin-group-stamp.png"`.
3. Set `signatoryName`, `signatoryTitle` (and the Arabic fields) in the same config.

No other code changes are needed. Documents already issued are not re-stamped.
