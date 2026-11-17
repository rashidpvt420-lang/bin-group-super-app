# BIN GROUP — PR #2014 FINANCE DEMOTION GOVERNANCE AUDIT
**Authoritative Security Governance & Verification Report**

- **Repository:** `rashidpvt420-lang/bin-group-super-app`
- **Branch:** `fix/financial-approval-ceo-superadmin-segregation`
- **Starting HEAD SHA:** `bbcad92743fc3c1884ee80d272ab3a7f00bb2210`
- **Baseline Commit:** `982e2679eb803820e0825cb5a69865a9584a2b7a` (`origin/main`)
- **PR:** #2014 (`fix/financial-approval-ceo-superadmin-segregation`)
- **Environment:** Local Firebase Emulators & Pre-Merge Branch Inspection
- **Audit Date:** November 17, 2026
- **Status:** **PASS**

---

## 1. OBJECTIVE & GOVERNANCE PRINCIPLES

This audit validates the implementation of **Two-Person Governance for Finance Approver Demotion, Removal, and Revocation** in `functions/adminUserProvisioning.ts`.

Historically, appointment governance required two-person authorization to promote staff into a Finance role (`finance_admin`, `finance_manager`, `finance_controller`), but unilateral demotion or revocation remained vulnerable to single-administrator execution.

Under the updated BIN GROUP Segregation-of-Duties (SoD) framework:
1. **Symmetric Governance:** Demoting, revoking, or removing a Finance approver must adhere to the exact same two-person dual-control governance as appointment and promotion.
2. **Prior Request Creation:** A demotion/revocation authorization document must be initiated and recorded before any role change or claims mutation occurs.
3. **Independent Second Approver:** A separate, distinct authorized approver (`super_admin`, `ceo`, or `finance_controller`) holding an active MFA session and live claims must independently review and approve the demotion.
4. **Strict Segregation of Duties:**
   - The requester cannot approve their own demotion request.
   - The target user cannot approve their own demotion or revocation.
5. **Anti-Escalation Shield:** A demotion workflow cannot be weaponized by a generic Admin, CEO, or Super Admin to acquire financial approval authority. The proposed demotion target role must strictly be a standard, non-finance staff role.
6. **State Staleness & Invariant Protection:** The target user's profile and live role must be re-read inside the transaction. If underlying conditions have changed since the request was initiated, the approval is rejected.
7. **Consistent 24-Hour Expiry:** The demotion authorization expires exactly 24 hours after creation.
8. **Token Revocation & Immutable Auditing:** Successful demotion strips all finance claims, revokes all active Firebase Auth refresh tokens, and records an immutable audit log (`FINANCE_ROLE_DEMOTION_APPROVED`).

---

## 2. GOVERNANCE ARCHITECTURE & STATE MACHINE

```
                           [ Requester: Super Admin / CEO with MFA ]
                                               │
                                 Calls: adminRequestFinanceRoleAssignment
                                 payload: {
                                   targetUid: "<target_uid>",
                                   targetRole: "operations_admin",
                                   actionType: "DEMOTE_STAFF"
                                 }
                                               │
                                               ▼
                         ┌──────────────────────────────────────────────┐
                         │ Pre-Request Validation:                      │
                         │ - Target currently holds Finance Role? YES   │
                         │ - Proposed targetRole is Non-Finance? YES    │
                         │ - Target != Requester? YES                   │
                         │                                              │
                         │ Result:                                      │
                         │ - Doc created: finance_role_authorizations   │
                         │ - Status: PENDING_INDEPENDENT_APPROVAL       │
                         │ - Audit: ADMIN_REQUEST_FINANCE_ROLE_DEMOTION │
                         └──────────────────────┬───────────────────────┘
                                                │
                                       [ Two-Person Dual Gate ]
                                                │
                                                ▼
                         ┌──────────────────────────────────────────────┐
                         │ Attempt: Single-Person Direct Demotion       │
                         │ via adminUpdateStaffAccess (No Auth ID)      │
                         │                                              │
                         │ Outcome: REJECTED (failed-precondition)     │
                         └──────────────────────────────────────────────┘
                                                │
                                                ▼
                         ┌──────────────────────────────────────────────┐
                         │ Approver: Independent Authority with MFA     │
                         │ Calls: adminApproveFinanceRoleAssignment     │
                         │                                              │
                         │ Transactional Re-Check (Inside tx):          │
                         │ 1. Approver != Requester (SoD)               │
                         │ 2. Approver != Target (Self-Action Guard)    │
                         │ 3. Age < 24 Hours (TTL Expiry Guard)         │
                         │ 4. Re-read users/{targetUid}:                │
                         │    - Live role == previousRole?              │
                         │    - Still holds Finance Role?               │
                         │ 5. Target role NOT in Finance Roles          │
                         │                                              │
                         │ Commit:                                      │
                         │ - authRef.status = "APPROVED"                │
                         │ - users/{targetUid}.role = "operations_admin"│
                         │ - staffAccess/{targetUid}.role = ...         │
                         │ - audit_logs: FINANCE_ROLE_DEMOTION_APPROVED │
                         │                                              │
                         │ Post-Commit (Auth API):                      │
                         │ - Strips: finance_admin: false               │
                         │ - Strips: finance_manager: false             │
                         │ - Strips: finance_controller: false          │
                         │ - admin.auth().revokeRefreshTokens(targetUid)│
                         └──────────────────────────────────────────────┘
```

---

## 3. SECURITY IMPLEMENTATION SPECIFICATION

### 3.1 Initiating Demotion (`adminRequestFinanceRoleAssignment`)

```typescript
const isDemotion = actionType === "DEMOTE_STAFF" || actionType === "REVOKE_AUTHORITY" || actionType === "DEMOTE_FINANCE_APPROVER" || actionType === "REVOKE_FINANCE_APPROVER";

if (targetUid === actorId) {
  throw new HttpsError("permission-denied", isDemotion
    ? "Self-demotion prohibited: you cannot request demotion or revocation for yourself."
    : "Self-assignment prohibited: you cannot request Finance authority for yourself.");
}

if (isDemotion) {
  if (!FINANCE_APPROVER_ROLES.has(currentRole)) {
    throw new HttpsError("failed-precondition", `Target user is not currently a Finance approver (current role: ${currentRole}). Demotion request invalid.`);
  }
  if (!STAFF_ROLES.has(targetRole)) {
    throw new HttpsError("invalid-argument", `Invalid demotion target role: ${targetRole}. Must be a valid staff role.`);
  }
  if (FINANCE_APPROVER_ROLES.has(targetRole)) {
    throw new HttpsError("invalid-argument", `Demotion workflow cannot assign a Finance approver role (${targetRole}). Authority escalation prohibited.`);
  }
}
```

### 3.2 Unilateral Access Modification Guard (`adminUpdateStaffAccess`)

In `adminUpdateStaffAccess`:
```typescript
const isFinanceApproverChange = (FINANCE_APPROVER_ROLES.has(role) || FINANCE_APPROVER_ROLES.has(currentRole)) && role !== currentRole;
if (isFinanceApproverChange) {
  if (!authorizationId) {
    throw new HttpsError(
      "failed-precondition",
      "Two-person authorization required: promoting staff into a Finance approver role or changing an existing Finance approver's role requires independent second-person approval. Request authorization and supply the approved authorizationId.",
    );
  }
  ...
}
```
Any unilateral call to demote a Finance approver directly fails with `failed-precondition`.

### 3.3 Transactional Approval & Claims Demotion (`adminApproveFinanceRoleAssignment`)

Inside the authoritative Firestore transaction:
1. **Re-Read Target User Doc:** `const userSnap = await tx.get(userRef);`
2. **Underlying Condition Invariance:**
   ```typescript
   if (authData.previousRole && liveTargetRole !== authData.previousRole) {
     throw new HttpsError(
       "failed-precondition",
       `Underlying condition changed: target user role (${liveTargetRole}) no longer matches authorization previous role (${authData.previousRole}).`,
     );
   }
   ```
3. **Anti-Escalation Check:**
   ```typescript
   if (isDemotion) {
     if (!FINANCE_APPROVER_ROLES.has(liveTargetRole)) {
       throw new HttpsError("failed-precondition", "Target user does not currently hold a Finance approver role to demote.");
     }
     if (FINANCE_APPROVER_ROLES.has(targetRole)) {
       throw new HttpsError("failed-precondition", "Demotion cannot grant financial approval authority.");
     }
   }
   ```
4. **Audit Record Generation:**
   Writes `FINANCE_ROLE_DEMOTION_APPROVED` containing requester, approver, target, previousRole, proposedRole, timestamps, decision (`"APPROVED"`), reason, and `twoPersonVerified: true`.
5. **Claims Stripping & Token Revocation:**
   ```typescript
   finance_admin: false,
   finance_manager: false,
   finance_controller: false,
   financeApprovalPending: false
   ```
   Followed by `await admin.auth().revokeRefreshTokens(targetUid);`.

### 3.4 External Auth Failure Handling & Recoverable State Architecture

Because `admin.auth().revokeRefreshTokens(targetUid)` and `admin.auth().setCustomUserClaims(...)` are external Firebase Auth API operations and cannot be atomically enrolled inside the Firestore transaction, a network timeout, transient Auth service error, or quota failure could otherwise leave an ambiguous state (e.g. Firestore role updated to non-finance, but active session retaining Finance claims).

To eliminate this ambiguity, `adminApproveFinanceRoleAssignment` implements an **explicit failure-state and recovery mechanism**:
1. **Explicit Error Capture & Auditing:** If post-transaction Auth operations fail, the error is caught immediately. An immutable security audit log `FINANCE_ROLE_DEMOTION_AUTH_SYNC_FAILED` is written.
2. **Persistent Flagging:** The authorization document is updated with `authSyncStatus: "FAILED"`, `authSyncRetryRequired: true`, and the exact error. The target user document in `users` is also updated with `authSyncRetryRequired: true`.
3. **Fail-Closed Notification:** The callable throws an `HttpsError("internal")` informing the operator of the exact state: the transaction committed, but external Auth sync failed, and the security recovery flag is set.
4. **Deterministic Recovery Retry:** When an independent authorized approver re-calls `adminApproveFinanceRoleAssignment` with this `authorizationId`, the transaction detects `status === "APPROVED"` with `authSyncRetryRequired === true`. It securely re-executes `setCustomUserClaims` and `revokeRefreshTokens`. Upon successful sync, it updates `authSyncStatus: "COMPLETED"`, clears `authSyncRetryRequired: false` on both documents, and writes an immutable `FINANCE_ROLE_DEMOTION_AUTH_SYNC_RECOVERED` audit record.

---

## 4. ACCEPTANCE TEST MATRIX & RESULTS

Tested against local Firebase Emulators (Auth, Firestore, Storage) in `test/emulator-callables/money-approval-acceptance.test.cjs`:

| Test ID | Test Scenario | Expected Outcome | Actual Outcome | Status |
|---|---|---|---|---|
| **DEM-01** | Single-person Finance approver demotion attempt via `adminUpdateStaffAccess` | DENIED (`failed-precondition`) | `HttpsError: failed-precondition` | **PASS** |
| **DEM-02** | Requester approving their own demotion request | DENIED (`permission-denied`, SoD violation) | `HttpsError: permission-denied` | **PASS** |
| **DEM-03** | Target user approving their own demotion | DENIED (`permission-denied`, Self-action violation) | `HttpsError: permission-denied` | **PASS** |
| **DEM-04** | Valid independent second approver with MFA approves demotion | PERMITTED (`twoPersonVerified: true`, claims revoked) | Claims stripped, role updated to operations_admin | **PASS** |
| **DEM-05** | Second approver missing MFA session | DENIED (`permission-denied`, MFA required) | `HttpsError: permission-denied` | **PASS** |
| **DEM-06** | Suspended or stale authorization claims on approver | DENIED (`permission-denied`, live claims check) | `HttpsError: permission-denied` | **PASS** |
| **DEM-07** | Expired demotion request (age > 24 hours) | DENIED (`failed-precondition`, TTL expired) | `HttpsError: failed-precondition` | **PASS** |
| **DEM-08** | Concurrent approval attempts on the same demotion request | Exactly 1 success, 1 rejected (`failed-precondition`) | 1 fulfilled, 1 rejected | **PASS** |
| **DEM-09** | Successful demotion produces immutable audit event | `FINANCE_ROLE_DEMOTION_APPROVED` recorded | Audit document verified in Firestore | **PASS** |
| **DEM-10** | Failed demotion results in zero role/claims mutation | Target retains `finance_admin` role and claims | Custom claims and documents unchanged | **PASS** |
| **DEM-11** | External token revocation failure handling & recovery retry | Unambiguous failure state recorded (`authSyncRetryRequired: true`), recovery retry completes cleanly | `FINANCE_ROLE_DEMOTION_AUTH_SYNC_FAILED` and `RECOVERED` verified | **PASS** |

---

## 5. AUDIT DETERMINATION

- **PR #2014 Finance Demotion Governance Remediation:** **PASS**
- **Segregation of Duties Parity:** Established 100% parity between Finance appointment and Finance demotion/revocation.
- **External Auth Post-Transaction Integrity:** 100% fail-closed, recoverable, and auditable.
- **Production Status:** Remediation branch `fix/financial-approval-ceo-superadmin-segregation` remains unmerged and undeployed.
