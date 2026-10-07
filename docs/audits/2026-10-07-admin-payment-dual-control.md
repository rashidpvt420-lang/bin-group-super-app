# Admin payment stability repair — 7 October 2026

Baseline: main `28808371938a7a6e2df62ac5e3bd8e3fd829a19b`.
Existing repair: PR #1621, original head `b8e3f3d04186debc92c3f41958085abeb5f20528`.
This repair implements Rashid's instruction to stabilize the app while hard clearance is paused.

## Defects and resulting behavior

| Trigger | Baseline behavior | Repair and proof |
| --- | --- | --- |
| Finance Admin uploads a mobilisation receipt | Payment page immediately calls approval with the same identity | Recording stops with a second-reviewer notice. Server binds the recording UID and refuses the same UID before invoice work and again inside the approval transaction. |
| Legacy Admin-recorded evidence lacks a recorder | Approval cannot demonstrate a second reviewer | Fail closed with `DUAL_CONTROL_RECORDER_UNKNOWN`; re-record the evidence before separate review. |
| A second MFA Finance Admin approves valid receipt evidence | No durable record of the separation of duties | Payment and approval audit bind recorder and approver; actual secure callable wrapper is exercised through activation, PDF storage and idempotent replays. |
| Approval finishes while another receipt is uploading | Initial state check occurs before upload; the later batch can reopen an approved payment | Transaction compares fresh payment and contract update times with the pre-upload snapshots, aborting stale recording before any financial state or audit write. Uploaded evidence is retained. |
| Callable returns structured error details | React may attempt to render an object | Payment approval, rejection, receipt repair, intake mutations, inspection evidence saving and portfolio completion render string details or the message. |
| Production evidence runner records and approves | Same Founder MFA identity performs both operations | Separate Finance Admin completes real TOTP sign-in, SDK token/revocation verification, identity/role/factor checks and distinct UID validation. Both identities authenticate before Owner evidence records are reset. Approval and replay use the second session. |

## Validation at publication

- Node 22: Functions build, root typecheck and lint passed.
- Launch honesty: 2,041 passed, zero failed, two existing skips; lifecycle suite: five passed, zero failed.
- Focused source/MFA tests: nine passed, zero failed.
- Baseline reproduction: four selected regressions failed against the compiled baseline functions (recorder binding, same-Admin refusal, unknown-recorder refusal, upload race). Restoring the repaired functions gives eight focused callable passes, zero failures.
- Focused callable coverage includes recorder binding, audited same-Admin refusal, missing-recorder refusal, Owner-submitted evidence behavior, successful second-reviewer activation through the deployed MFA wrapper, exactly-once approval, receipt generation/replay, and upload/approval race prevention.
- The Storage emulator has no IAM URL signing service. The successful activation test stubs only `File.getSignedUrl`; receipt upload, hashes, object generations, Firestore transactions and financial gates execute against emulators. It does not prove hosted signed URLs or live MFA.
- Admin/shared/main builds, repository/stability/mobile guards and full rules/callables are being completed. Final results and exact GitHub head/check URLs are retained in PR #1621 and tracker #1691.

## Operational requirement and remaining Admin audit

The protected evidence jobs now consume `E2E_FINANCE_APPROVER_EMAIL`, `E2E_FINANCE_APPROVER_PASSWORD`, and `E2E_FINANCE_APPROVER_TOTP_SECRET`. These must belong to an existing, authorized, verified MFA Finance Admin distinct from the Founder recorder. No account, role grant, MFA enrollment or secret value was created or changed by this repair. Missing or invalid configuration fails before evidence record mutation; there is no same-Admin fallback.

The workflow edits only bind these inputs for the compatible evidence runner. No hard-clearance gate, frozen SHA, pilot, deployment permission or evidence artifact is reset or bypassed. No production deployment or live evidence workflow is dispatched.

This is one verified Admin payment repair, not full Admin acceptance. The remaining audit includes document/location review, physical inspection and technician assignment, quotes/contracts, activation prerequisites, tenant links, broker KYC, disputes, notifications, HR, reports, settings and authenticated responsive/Arabic UI. Design deposits retain their separate existing approval policy; extending four-eyes control to them is outside this mobilisation defect.
