from pathlib import Path

path = Path('.github/scripts/apply-property-geo-server-authority-final.py')
source = path.read_text(encoding='utf-8')
old = """owner_ops = replace_once(
    owner_ops,
    '''  { cors: true, region: \"europe-west3\" },
''',
    '''  { cors: true, region: \"europe-west3\", enforceAppCheck: true },
''',
    'owner maintenance App Check',
)
"""
new = """owner_ops = replace_once(
    owner_ops,
    '''export const ownerCreateMaintenanceTicket = onCall(
  { cors: true, region: \"europe-west3\" },
''',
    '''export const ownerCreateMaintenanceTicket = onCall(
  { cors: true, region: \"europe-west3\", enforceAppCheck: true },
''',
    'owner maintenance App Check',
)
"""
if source.count(old) != 1:
    raise SystemExit(f'Owner App Check patch marker count was {source.count(old)}, expected 1')
path.write_text(source.replace(old, new, 1), encoding='utf-8')
