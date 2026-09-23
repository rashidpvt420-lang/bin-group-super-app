import React from 'react';
import { Alert } from '@mui/material';
import { useRole } from '../../context/RoleContext';
import { ensureTechnicianInstallationRegistered } from '../utils/technicianInstallationBinding';

type RegistrationState = 'not-native' | 'checking' | 'registered' | 'blocked';

const safeDiagnosticCode = (error: any): string => {
  const candidates = [
    error?.code,
    error?.details?.code,
    error?.cause?.code,
  ];
  for (const value of candidates) {
    const code = String(value || '').trim().toUpperCase();
    if (/^[A-Z0-9_-]{2,80}(?:__[A-Z0-9_-]{2,80}){0,4}$/.test(code)) return code;
  }
  return '';
};

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
      setState('blocked');
      const code = String(error?.code || '').toLowerCase();
      const diagnostic = safeDiagnosticCode(error);
      setMessage(
        code.includes('failed-precondition')
          ? 'This Technician account is bound to another installation. Ask an authorised administrator to use the controlled device re-registration process.'
          : `This Android installation could not be verified through Google Play Integrity. Physical arrival evidence is blocked.${diagnostic ? ` Diagnostic: ${diagnostic}` : ''}`,
      );
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
    </>
  );
}
