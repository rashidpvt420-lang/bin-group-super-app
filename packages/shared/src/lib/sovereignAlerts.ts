export type SovereignSeverity = 'success' | 'error' | 'warning' | 'info';

export const showSovereignToast = (
  message: string,
  severity: SovereignSeverity = 'error',
) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('sovereign_alert', {
      detail: { message, severity },
    }),
  );
};

export const setupSovereignAlertInterceptor = () => {
  if (typeof window === 'undefined') return;
  window.alert = (message?: unknown) => {
    showSovereignToast(String(message ?? ''), 'info');
  };
};
