from pathlib import Path

tracking_path = Path('src/utils/liveTracking.ts')
tracking = tracking_path.read_text(encoding='utf-8')
old = """    while (active.length > MAX_QUEUE_SIZE) {
        let index = active.findIndex((entry) => entry.status === 'TERMINAL');
        if (index < 0) index = active.findIndex((entry) => entry.action === 'UPDATE');
        if (index < 0) index = 0;
        const [removed] = active.splice(index, 1);
        if (removed) disposed.push(removed);
    }
"""
new = """    while (active.length > MAX_QUEUE_SIZE) {
        let index = active.findIndex((entry) => entry.status === 'TERMINAL' && entry.action === 'UPDATE');
        if (index < 0) index = active.findIndex((entry) => entry.action === 'UPDATE');
        if (index < 0) {
            throw new Error('GPS_STOP_QUEUE_CAPACITY_EXCEEDED');
        }
        const [removed] = active.splice(index, 1);
        if (removed) disposed.push(removed);
    }
"""
if old not in tracking:
    raise SystemExit('GPS saturation marker not found')
tracking = tracking.replace(old, new, 1)
tracking_path.write_text(tracking, encoding='utf-8')

test_path = Path('tests/launch/gps-queue-durability-privacy.test.mjs')
test_source = test_path.read_text(encoding='utf-8')
marker = "  assert.match(tracking, /entry\\.action === 'UPDATE'/);\n"
replacement = marker + "  assert.match(tracking, /GPS_STOP_QUEUE_CAPACITY_EXCEEDED/);\n  assert.doesNotMatch(tracking, /if \\(index < 0\\) index = 0/);\n"
if marker not in test_source:
    raise SystemExit('GPS saturation test marker not found')
test_source = test_source.replace(marker, replacement, 1)
test_path.write_text(test_source, encoding='utf-8')
