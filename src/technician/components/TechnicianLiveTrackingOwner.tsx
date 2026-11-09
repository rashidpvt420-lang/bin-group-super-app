import { useEffect } from 'react';
import { useRole } from '../../context/RoleContext';
import { stopLiveTracking } from '../../utils/liveTracking';

/**
 * Nov 9 audit (P1-6): live GPS belongs to the technician portal, not to a single
 * page. Leaving the job page (Home, HR, chat, map) must NOT stop the feed while
 * the technician is still en route; lifecycle actions on the job page stop it
 * with an explicit final status. The feed is only released here when the whole
 * technician portal unmounts (portal switch / sign-out) or the identity changes.
 */
export default function TechnicianLiveTrackingOwner() {
    const { user } = useRole();
    const uid = user?.uid;
    useEffect(() => {
        return () => {
            if (uid) stopLiveTracking(uid).catch(() => undefined);
        };
    }, [uid]);
    return null;
}
