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
    # Prefer the reviewed secure state before matching an old marker because
    # several old markers are strict substrings of their replacements.
    if new in text:
        return text
    count = text.count(old)
    if count == 1:
        return text.replace(old, new, 1)
    raise SystemExit(f"{label}: expected one reviewed marker or existing secure state, found {count}")
'''
if helper_old not in text:
    raise SystemExit('replace_once helper definition was not found.')
text = text.replace(helper_old, helper_new, 1)

owner_patch = '''text = replace_once(text,
    '{ cors: true, region: "europe-west3" },\\n  async (request) => {\\n    await assertOwnerRole(request.auth);',
    '{ cors: true, region: "europe-west3", enforceAppCheck: true },\\n  async (request) => {\\n    await assertOwnerRole(request.auth);',
    'owner App Check')
'''
if owner_patch not in text:
    raise SystemExit('Owner App Check patch definition was not found.')
text = text.replace(
    owner_patch,
    "# Owner create-ticket App Check is already verified by the wrapper before applying the remaining patch.\n",
    1,
)
patcher.write_text(text, encoding='utf-8')

owner_path = Path('functions/ownerMaintenanceOperations.ts')
owner_source = owner_path.read_text(encoding='utf-8')
owner_create_secure = '''export const ownerCreateMaintenanceTicket = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
'''
if owner_create_secure not in owner_source:
    raise SystemExit('Owner ticket callable is not in the reviewed App Check-protected state.')
if 'resolveDispatchReadyPropertyGeo(property)' not in owner_source or 'SERVER_VERIFIED_PROPERTY_GEO' not in owner_source:
    raise SystemExit('Owner ticket callable is not bound to canonical server geography.')

runpy.run_path(str(patcher), run_name='__main__')

# Evidence attachment is also privileged ticket mutation. It must enforce App
# Check and complete the asynchronous Owner account check before any read/write.
owner_source = owner_path.read_text(encoding='utf-8')
evidence_insecure = '''export const ownerAttachMaintenanceEvidence = onCall(
  { cors: true, region: "europe-west3" },
  async (request) => {
    assertOwnerRole(request.auth);
'''
evidence_secure = '''export const ownerAttachMaintenanceEvidence = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    await assertOwnerRole(request.auth);
'''
if evidence_secure not in owner_source:
    if owner_source.count(evidence_insecure) != 1:
        raise SystemExit('Owner evidence callable is not in a reviewed insecure or secure state.')
    owner_source = owner_source.replace(evidence_insecure, evidence_secure, 1)
owner_path.write_text(owner_source, encoding='utf-8')
