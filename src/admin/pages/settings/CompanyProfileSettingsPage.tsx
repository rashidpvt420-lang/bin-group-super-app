import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Legacy compatibility route.
 *
 * The company profile has one canonical Admin editor:
 *   /admin/company-profile
 *
 * Keeping this file as a redirect prevents a second company profile UI from
 * being rendered or edited from an old settings path/import.
 */
export default function CompanyProfileSettingsPage() {
  return <Navigate to="/admin/company-profile" replace />;
}
