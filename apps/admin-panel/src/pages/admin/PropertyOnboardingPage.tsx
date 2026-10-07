import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Legacy Admin property onboarding has been retired.
 * Canonical property creation and review now live in the five-page Owner intake workflow.
 */
export default function PropertyOnboardingPage() {
  return <Navigate to="/vault" replace />;
}
