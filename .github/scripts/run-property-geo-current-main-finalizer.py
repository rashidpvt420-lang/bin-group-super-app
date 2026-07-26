from pathlib import Path
import runpy

patcher = Path('.github/scripts/apply-property-geo-current-main.py')
text = patcher.read_text(encoding='utf-8')

helper_old = '''def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one marker, found {count}")
    return text.replace(old, new, 1)
'''
helper_new = '''def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count == 1:
        return text.replace(old, new, 1)
    if count == 0 and new in text:
        return text
    raise SystemExit(f"{label}: expected one reviewed marker or existing secure state, found {count}")
'''
if helper_old not in text:
    raise SystemExit('replace_once helper definition was not found.')
text = text.replace(helper_old, helper_new, 1)

owner_old = '''text = replace_once(text,
    '{ cors: true, region: "europe-west3" },\\n  async (request) => {\\n    await assertOwnerRole(request.auth);',
    '{ cors: true, region: "europe-west3", enforceAppCheck: true },\\n  async (request) => {\\n    await assertOwnerRole(request.auth);',
    'owner App Check')
'''
owner_new = '''owner_insecure = 'export const ownerCreateMaintenanceTicket = onCall(\\n  { cors: true, region: "europe-west3" },'
owner_secure = 'export const ownerCreateMaintenanceTicket = onCall(\\n  { cors: true, region: "europe-west3", enforceAppCheck: true },'
if owner_insecure in text:
    text = text.replace(owner_insecure, owner_secure, 1)
elif owner_secure not in text:
    raise SystemExit('owner App Check: neither reviewed insecure nor secure marker exists')
'''
if owner_old not in text:
    raise SystemExit('Owner App Check patch definition was not found.')
patcher.write_text(text.replace(owner_old, owner_new, 1), encoding='utf-8')
runpy.run_path(str(patcher), run_name='__main__')
