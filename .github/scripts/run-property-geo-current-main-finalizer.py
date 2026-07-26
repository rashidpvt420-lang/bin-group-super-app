from pathlib import Path
import runpy

patcher = Path('.github/scripts/apply-property-geo-current-main.py')
text = patcher.read_text(encoding='utf-8')
old = '''text = replace_once(text,
    '{ cors: true, region: "europe-west3" },\\n  async (request) => {\\n    await assertOwnerRole(request.auth);',
    '{ cors: true, region: "europe-west3", enforceAppCheck: true },\\n  async (request) => {\\n    await assertOwnerRole(request.auth);',
    'owner App Check')
'''
new = '''text = replace_once(text,
    'export const ownerCreateMaintenanceTicket = onCall(\\n  { cors: true, region: "europe-west3" },',
    'export const ownerCreateMaintenanceTicket = onCall(\\n  { cors: true, region: "europe-west3", enforceAppCheck: true },',
    'owner App Check')
'''
if old not in text:
    raise SystemExit('Owner App Check patch definition was not found.')
patcher.write_text(text.replace(old, new, 1), encoding='utf-8')
runpy.run_path(str(patcher), run_name='__main__')
