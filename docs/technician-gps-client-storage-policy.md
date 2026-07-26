# Technician GPS Client Storage Policy

## Foreground tracking

The controlled pilot uses foreground browser geolocation. A Technician is shown as live only while the mission page owns an active geolocation watch and the canonical server session remains fresh.

## Retry minimization

- Failed UPDATE coordinates remain in JavaScript memory only.
- UPDATE coordinates are never written to localStorage or sessionStorage.
- Only the latest failed UPDATE for one ticket/session is retained.
- Stale UPDATEs are discarded before another ticket session starts.
- Coordinate-free STOP/reconciliation records use a Technician-UID-scoped localStorage key so they can survive reload or restart without mixing accounts.
- STOP records never contain latitude, longitude, accuracy, heading or speed.
- Terminal STOP tombstones remain blocking until secure purge or successful server reconciliation.
- STOP queue saturation fails closed rather than silently deleting stop intent.

## Privacy boundaries

Legacy global queue keys are deleted. Starting under another Technician account removes other UID scopes. Secure Technician logout explicitly purges the authenticated UID queue in addition to the general portal storage cleanup.

## Admin map behavior

The Admin map renders only canonical verified property pins and fresh canonical Technician GPS. Markers are updated or removed in place. Freshness clock ticks do not reset the Admin’s manual pan or zoom; automatic fitting occurs only on the first non-empty canonical marker set.

This policy is a source contract, not physical-device or production evidence.
