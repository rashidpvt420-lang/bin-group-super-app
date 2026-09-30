import React from 'react';
import { Alert } from '@mui/material';
import { useRole } from '../../context/RoleContext';
import { ensureTechnicianInstallationRegistered } from '../utils/technicianInstallationBinding';
import { classifyTechnicianRegistrationFailure } from '../utils/technicianAccessDiagnostics';

type RegistrationState = 'not-native' | 'checking' | 'registered' | 'blocked' | 'account-inactive';

export default function TechnicianInstallationRegistration() {
  const { user } = useRole();
  const [state, setState] = React.useState<RegistrationState>('checking');
  const [message, setMessage] = React.useState('');

  const register = React.useCallback(async () => {
    if (!user?.uid || !navigator.onLine) return;
    setState('checking');
    setMessage('');
    try {
      const installationHash = await ensureTechnicianInstallationRegistered();
      setState(installationHash ? 'registered' : 'not-native');
    } catch (error: any) {
      // permission-denied from registerTechnicianDevice is only reachable after
      // App Check accepted the Play Integrity token, so account/profile refusals
      // are reported as account state, never as a Play Integrity failure.
      const failure = classifyTechnicianRegistrationFailure(error);
      setState(failure.kind === 'ACCOUNT_INACTIVE' ? 'account-inactive' : 'blocked');
      setMessage(failure.message);
    }
  }, [user?.uid]);

  React.useEffect(() => {
    void register();
    window.addEventListener('online', register);
    return () => window.removeEventListener('online', register);
  }, [register]);

  return (
    <>
      <span hidden data-testid="technician-installation-registration" data-registration-state={state} />
      {state === 'blocked' && <Alert severity="error" sx={{ mb: 2 }}>{message}</Alert>}
      {state === 'account-inactive' && <Alert severity="warning" sx={{ mb: 2 }}>{message}</Alert>}
    </>
  );
}
