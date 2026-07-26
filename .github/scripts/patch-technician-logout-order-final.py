from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label} marker count was {count}, expected 1')
    return source.replace(old, new, 1)


path = Path('src/components/PortalSessionControls.tsx')
source = path.read_text(encoding='utf-8')
source = replace_once(
    source,
    "import { clearOnboardingSessionArtifacts } from '../lib/onboardingDb';\n",
    "import { clearOnboardingSessionArtifacts } from '../lib/onboardingDb';\n"
    "import { purgeTechnicianGpsRetryQueue, stopLiveTracking } from '../utils/liveTracking';\n",
    'tracking teardown import',
)
old = '''  const handleLogout = async () => {
    try {
      await clearSessionAndPreserveLanguage();
      await signOut(auth);
    } catch (error) {
      console.warn(`[${role}] Secure logout fallback triggered.`, error);
      try {
        await signOut(auth);
      } catch {
        // Navigation below still terminates the local portal session.
      }
    } finally {
      window.location.replace(logoutRedirect || `/login?intendedRole=${role}&logout=1`);
    }
  };
'''
new = '''  const handleLogout = async () => {
    const technicianUid = role === 'technician' ? auth.currentUser?.uid : undefined;
    try {
      if (technicianUid) {
        await stopLiveTracking(technicianUid);
        purgeTechnicianGpsRetryQueue(technicianUid);
      }
      await clearSessionAndPreserveLanguage();
      await signOut(auth);
    } catch (error) {
      console.warn(`[${role}] Secure logout fallback triggered.`, error);
      try {
        if (technicianUid) {
          await stopLiveTracking(technicianUid);
          purgeTechnicianGpsRetryQueue(technicianUid);
        }
        await clearSessionAndPreserveLanguage();
        await signOut(auth);
      } catch {
        // Navigation below still terminates the local portal session. The server
        // watchdog remains authoritative if the STOP callable was unavailable.
      }
    } finally {
      window.location.replace(logoutRedirect || `/login?intendedRole=${role}&logout=1`);
    }
  };
'''
source = replace_once(source, old, new, 'canonical logout handler')
path.write_text(source, encoding='utf-8')
