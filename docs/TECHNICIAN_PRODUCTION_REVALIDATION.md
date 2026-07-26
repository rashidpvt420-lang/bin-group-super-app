# Technician Production Revalidation Gate

## Decision boundary

The Technician profile is **not launch-green** until all three evidence classes below refer to the same merged `main` commit:

1. source and emulator validation are green;
2. the protected Firebase production deployment and protected live-role workflow pass against the deployed SHA;
3. a physical mobile device records GPS and camera evidence.

Browser automation is required diagnostic evidence, but it must not be described as physical-device proof.

## Security design

- The portal lists only `maintenanceTickets` where `assignedTechnicianId` equals the authenticated Technician UID.
- Unassigned ticket details are not exposed as an open pool.
- Dispatch assigns the mission first; the approved Technician accepts it second.
- Assignment notifications are created server-side and identified per assignment event, so trigger retries are idempotent while a later reassignment generates a fresh alert.
- Arrival is never background-replayed because it requires fresh foreground GPS.
- Completion is never background-replayed because it requires foreground evidence upload.

## Automated protected evidence

The protected Technician suite must prove all of the following against production:

- the unassigned fixture is absent from the authenticated Technician query;
- dispatch assigns the fixture after login and the identity-bound query receives it;
- the assignment notification reaches `SUCCESS` or `PARTIAL` with at least one successful FCM delivery;
- the Technician accepts the dispatched mission;
- browser GPS moves the mission to `EN_ROUTE` and `ARRIVED`;
- denied location permission leaves the mission in `EN_ROUTE`;
- poor GPS accuracy leaves the mission in `EN_ROUTE`;
- the Technician uploads a new before-work image after arrival;
- the server verifies the Storage object, content type, size, ticket metadata, Technician metadata and assignment;
- PPE and safety confirmation precede `IN_PROGRESS`;
- the first after-work upload request is deliberately failed and a later retry succeeds;
- completion requests Tenant feedback;
- an offline `EN_ROUTE` action enters the local queue and automatically replays after connectivity returns;
- App Check, authenticated Firebase reads and same-SHA production provenance remain clean.

## Physical-device evidence

Record one uninterrupted run on a supported mobile device using the production PWA or application build:

1. receive the Technician assignment notification on the device;
2. open the assigned mission from the notification;
3. capture current GPS outdoors or in a location with acceptable accuracy;
4. deny location once and confirm arrival remains blocked;
5. restore location access and record successful arrival;
6. capture the actual work area with the device camera as before-work evidence;
7. disconnect the network, queue an eligible lifecycle action, reconnect and confirm automatic synchronisation;
8. capture after-work evidence and complete the mission;
9. confirm the Tenant receives the feedback request.

Retain the device model, OS version, app/PWA version, deployed commit SHA, timestamps, screenshots or screen recording, notification receipt, mission ID and final Firestore lifecycle state. Do not retain resident personal information in the public CI artifact.

## Release sequence

1. Merge the Technician repair only after PR checks pass.
2. Run the protected **Firebase Production Deploy** workflow from the merged `main` SHA.
3. Run the protected live-role/business evidence workflow against the production URLs.
4. Confirm the deployment document and evidence artifact contain that same SHA.
5. Execute and retain the physical-device evidence above.
6. Mark the Technician profile green only when every required item passes without skipped, fixture-only or stale-SHA evidence.
