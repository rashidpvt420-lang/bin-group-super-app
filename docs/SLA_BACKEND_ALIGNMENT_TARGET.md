# SLA Backend Alignment Target

Tenant request creation and the admin Simple Command screen now show the same SLA ladder. Backend logic must use the same values before full commercial launch.

## SLA ladder

| Priority | Minutes |
|---|---:|
| EMERGENCY | 30 |
| HIGH | 120 |
| MEDIUM | 240 |
| STANDARD | 480 |
| LOW | 1440 |

## Backend places to align

- Ticket creation normalization.
- Auto-dispatch scoring.
- SLA breach scans.
- Escalation notifications.
- Owner reports.
- Admin SLA queues.
- SLA credit calculations.

## Required behavior checks

- emergency maps to 30 minutes.
- urgent and high map to 120 minutes.
- medium maps to 240 minutes.
- normal and standard map to 480 minutes.
- low maps to 1440 minutes.

## Current PR status

This PR already aligns tenant request creation and admin Simple Command UI. Backend alignment remains a follow-up until a safe Functions edit is committed.
