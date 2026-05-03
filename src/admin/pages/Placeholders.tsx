import React from 'react';
import { Typography, Container } from '@mui/material';

const PlaceholderPage: React.FC<{ title: string }> = ({ title }) => (
    <Container sx={{ mt: 4 }}>
        <Typography variant="h4" fontWeight="bold">{title}</Typography>
        <Typography sx={{ mt: 2 }}>This module is currently being finalized.</Typography>
    </Container>
);

export default PlaceholderPage;

export const FinancialTickerPage = () => <PlaceholderPage title="Financial Ticker" />;
export const OwnersPage = () => <PlaceholderPage title="Owner Management" />;
export const OwnerDetailsPage = () => <PlaceholderPage title="Owner Details" />;
export const TechniciansPage = () => <PlaceholderPage title="Technicians Performance" />;
export const TechnicianMapPage = () => <PlaceholderPage title="Technician Live Map" />;
