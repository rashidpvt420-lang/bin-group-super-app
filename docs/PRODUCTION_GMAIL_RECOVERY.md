# Protected production Gmail recovery

The production run stops before Firebase deployment if either Owner or Broker Gmail verification fails. An HTTP 400 alone does not establish whether a token expired, was revoked, or belongs to a different client. Do not skip this gate or reuse the Owner mailbox as the Broker mailbox.

The Gmail reader logs only allowlisted OAuth error codes and fixed recovery guidance. It never logs response descriptions, credentials, access tokens, or raw transport exceptions.

## Correct the protected credential set

An authorized repository/environment administrator must review these three Broker secrets together in the scope consumed by the protected `production` workflow:

- `E2E_BROKER_MAILBOX_CLIENT_ID`
- `E2E_BROKER_MAILBOX_CLIENT_SECRET`
- `E2E_BROKER_MAILBOX_REFRESH_TOKEN`

Also check the configured `E2E_BROKER_MAILBOX_EMAIL` variable/secret. It must match the authenticated Broker Gmail profile and differ from every other role account. An environment-level secret can override the repository-level value. Never paste values into issues, PRs, chat, or workflow inputs.

| Safe error code | Required action |
| --- | --- |
| `invalid_client` | Check the client ID/secret pair against the active Google OAuth client. |
| `invalid_grant` | Confirm client/account binding; the mailbox owner must reauthorize and securely replace the refresh token if the grant is invalid. |
| `invalid_grant` / `invalid_rapt` | Complete the interactive reauthentication required by Google session policy. |
| `deleted_client` | Have the Google Cloud owner review the deleted client and provision an authorized active client/grant. |
| `admin_policy_enforced` | Ask the Workspace administrator to review the restriction; do not bypass it. |
| `unclassified_oauth_error` | Investigate the protected configuration without exposing the provider response. Do not assume token expiry. |

These distinctions follow [Google's OAuth error guidance](https://developers.google.com/identity/protocols/oauth2/web-server#errors). If reauthorization is needed, use the intended Broker account and the same configured OAuth client through an approved consent flow with offline access and the Gmail read permission required by the existing OTP reader. Do not request broader write/send permissions to repair a read-only test inbox.

For long-lived automation, check the consent app's publishing configuration: external apps in Testing can receive seven-day refresh tokens for Gmail scopes. Revocation, password changes and session policy can also invalidate access. None of these causes is established by the historical generic HTTP 400. See [Google's refresh-token lifecycle](https://developers.google.com/identity/protocols/oauth2#expiration).

## Verify before deployment

After merging the source repair, run the existing protected **Production Readiness Preflight** from current `main`, with confirmation `VERIFY_PRODUCTION_READINESS_BIN_GROUP_57C60` and `launch_mode=bank-pilot`. It performs no deployment. Its Gmail identity step must succeed for both distinct mailboxes using the corrected secrets.

Then follow the existing exact-SHA production release sequence in [TESTING.md](../TESTING.md). Fresh deployment, five-role/provider evidence and physical-device checks remain mandatory; a successful OAuth exchange or source test is not hard-public-launch clearance.
