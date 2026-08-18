import admin from "firebase-admin";

admin.initializeApp();

const founderUid = process.env.FOUNDER_UID;

if (!founderUid) {
  throw new Error("FOUNDER_UID is required");
}

const auth = admin.auth();
const before = await auth.getUser(founderUid);

if (before.email?.toLowerCase() !== "ceo@bin-groups.com") {
  throw new Error("Founder identity mismatch. Stop.");
}

const factors =
  before.multiFactor?.toJSON().enrolledFactors ?? [];

const phoneFactors = factors.filter(
  (factor) => factor.factorId === "phone"
);

const totpFactors = factors.filter(
  (factor) => factor.factorId === "totp"
);

if (phoneFactors.length !== 1) {
  throw new Error(
    `Expected exactly one phone factor; found ${phoneFactors.length}`
  );
}

if (totpFactors.length !== 1) {
  throw new Error(
    `Expected exactly one TOTP factor; found ${totpFactors.length}`
  );
}

// Replacing enrolledFactors removes omitted factors.
// Preserve the phone factor and omit only TOTP.
await auth.updateUser(founderUid, {
  multiFactor: {
    enrolledFactors: phoneFactors,
  },
});

const after = await auth.getUser(founderUid);
const remaining =
  after.multiFactor?.enrolledFactors ?? [];

if (
  remaining.length !== 1 ||
  remaining[0]?.factorId !== "phone"
) {
  throw new Error(
    "Verification failed: expected one preserved phone factor"
  );
}

console.log(
  "SUCCESS: TOTP removed and phone MFA preserved."
);
