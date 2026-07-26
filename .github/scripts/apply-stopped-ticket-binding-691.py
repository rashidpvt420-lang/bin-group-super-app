from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label} marker count was {count}, expected 1')
    return source.replace(old, new, 1)


path = Path('functions/technicianLiveLocation.ts')
source = path.read_text(encoding='utf-8')
source = replace_once(
    source,
    """          activeTicketId: null,
          isTracking: false,
          trackingSessionId,
          stopReason: "TECHNICIAN_REQUESTED",
""",
    """          activeTicketId: null,
          isTracking: false,
          trackingSessionId,
          lastStoppedTicketId: ticketId,
          stopReason: "TECHNICIAN_REQUESTED",
""",
    'technician STOP ticket binding',
)
source = replace_once(
    source,
    """        isTracking: true,
        trackingSessionId,
        sequence,
""",
    """        isTracking: true,
        trackingSessionId,
        lastStoppedTicketId: null,
        sequence,
""",
    'new UPDATE clears stopped ticket binding',
)
source = replace_once(
    source,
    """          activeTicketId: null,
          isTracking: false,
          stopReason: "SERVER_EXPIRY_WATCHDOG",
""",
    """          activeTicketId: null,
          isTracking: false,
          lastStoppedTicketId: ticketId || null,
          stopReason: "SERVER_EXPIRY_WATCHDOG",
""",
    'watchdog stopped ticket binding',
)
for marker in [
    'lastStoppedTicketId: ticketId,',
    'lastStoppedTicketId: null,',
    'lastStoppedTicketId: ticketId || null,',
]:
    if marker not in source:
        raise SystemExit(f'missing stopped-ticket binding marker: {marker}')
path.write_text(source, encoding='utf-8')
