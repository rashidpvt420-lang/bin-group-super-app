from pathlib import Path

path = Path('src/utils/liveTracking.ts')
source = path.read_text(encoding='utf-8')
old = """    const data = (response as { data?: { superseded?: unknown; alreadyStopped?: unknown } }).data || {};
"""
new = """    const data = (response as {
        data?: { superseded?: unknown; alreadyStopped?: unknown; missingSession?: unknown };
    }).data || {};
"""
count = source.count(old)
if count != 1:
    raise SystemExit(f'missing-session callable response type: expected one marker, found {count}')
path.write_text(source.replace(old, new, 1), encoding='utf-8')
