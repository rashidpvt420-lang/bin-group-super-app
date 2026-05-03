import React, { useState } from 'react';
import {
    Box,
    Button,
    Typography,
    Paper,
    LinearProgress,
    Alert
} from '@mui/material';
import { CloudUpload } from '@mui/icons-material';
import { db } from '@/lib/firebase';
import { writeBatch, doc } from 'firebase/firestore';
import { useLanguage } from '@bin/shared';

const BulkImporter: React.FC = () => {
    const { t, isRTL } = useLanguage();
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [logs, setLogs] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const parseCSV = (text: string) => {
        const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
        const headers = (lines[0] || '').split(',').map(h => h.trim());
        return lines.slice(1).filter(line => line.trim()).map((line, rowIndex) => {
            const values = line.split(',').map(v => v.trim());
            const entry: any = { __rowNumber: rowIndex + 2 };
            headers.forEach((h, i) => {
                entry[h] = values[i] || '';
            });
            return entry;
        });
    };

    const requireField = (row: any, fields: string[]) => {
        const value = fields.map(f => row[f]).find(Boolean);
        if (!value) throw new Error(`CSV row ${row.__rowNumber}: missing required field (${fields.join(' or ')})`);
        return value;
    };

    const createSlug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `row-${Date.now()}`;

    const startImport = async () => {
        if (!file) return;
        setUploading(true);
        setLogs([t('admin.reading_file')]);

        try {
            const text = await file.text();
            const rows = parseCSV(text);
            setLogs(prev => [...prev, t('admin.found_records', { count: rows.length })]);

            const BATCH_SIZE = 500;
            let processed = 0;

            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = writeBatch(db);
                const chunk = rows.slice(i, i + BATCH_SIZE);

                chunk.forEach(row => {
                    const type = (row.TYPE || 'PROPERTY').toUpperCase();
                    const now = new Date().toISOString();

                    if (type === 'PROPERTY') {
                        const ownerId = requireField(row, ['Owner_UID', 'OwnerId', 'ownerId']);
                        const propertyId = row.Property_ID || row.PropertyId || createSlug(row.Bldg_Name || row.Name || `property-${row.__rowNumber}`);
                        const propRef = doc(db, 'properties', propertyId);
                        batch.set(propRef, {
                            propertyId,
                            name: row.Bldg_Name || row.Name || 'Unnamed Building',
                            propertyName: row.Bldg_Name || row.Name || 'Unnamed Building',
                            zone: row.Bldg_Zone || row.Zone || 'General',
                            unitsCount: parseInt(row.Units_Count || row.Units || '0', 10) || 0,
                            ownerId,
                            emirate: row.Emirate || row.emirate || 'Abu Dhabi',
                            propertyType: row.Property_Type || row.PropertyType || 'Building',
                            status: 'active',
                            createdAt: now,
                            updatedAt: now,
                            v2Scale: true
                        }, { merge: true });
                        batch.set(doc(db, 'propertyPassports', propertyId), {
                            propertyId,
                            ownerId,
                            propertyType: row.Property_Type || row.PropertyType || 'Building',
                            emirate: row.Emirate || row.emirate || 'Abu Dhabi',
                            city: row.City || row.city || '',
                            zone: row.Bldg_Zone || row.Zone || 'General',
                            units: parseInt(row.Units_Count || row.Units || '0', 10) || 0,
                            status: 'ACTIVE_ADMIN_IMPORTED',
                            source: 'ADMIN_BULK_IMPORT',
                            createdAt: now,
                            updatedAt: now
                        }, { merge: true });
                    } else if (type === 'UNIT') {
                        const propertyId = requireField(row, ['Property_ID', 'PropertyId', 'propertyId']);
                        const unitNumber = requireField(row, ['Unit_Number', 'Number', 'Unit']);
                        const unitId = row.Unit_ID || row.UnitId || createSlug(`${propertyId}-${unitNumber}`);
                        const unitData = {
                            unitId,
                            unitNumber,
                            floorNumber: parseInt(row.Floor || '0', 10) || 0,
                            propertyId,
                            ownerId: row.Owner_UID || row.OwnerId || '',
                            tenantId: row.Tenant_UID || row.TenantId || '',
                            occupancyStatus: row.Tenant_UID || row.TenantId ? 'OCCUPIED' : 'VACANT',
                            createdAt: now,
                            updatedAt: now,
                            source: 'ADMIN_BULK_IMPORT'
                        };
                        batch.set(doc(db, 'units', unitId), unitData, { merge: true });
                        batch.set(doc(db, 'properties', propertyId, 'units', unitId), unitData, { merge: true });
                    } else if (type === 'TENANT') {
                        const propertyId = requireField(row, ['Property_ID', 'PropertyId', 'propertyId']);
                        const email = String(requireField(row, ['Email', 'email'])).toLowerCase();
                        const tenantId = row.Tenant_UID || row.TenantId || createSlug(email);
                        const unitId = row.Unit_ID || row.UnitId || createSlug(`${propertyId}-${row.Unit_Number || row.Unit || tenantId}`);
                        const tenantData = {
                            tenantId,
                            authUid: row.Auth_UID || row.AuthUid || '',
                            displayName: row.Name || row.FullName || email,
                            email,
                            phone: row.Phone || row.Mobile || '',
                            role: 'tenant',
                            status: 'invited',
                            propertyId,
                            unitId,
                            ownerId: row.Owner_UID || row.OwnerId || '',
                            createdAt: now,
                            updatedAt: now,
                            source: 'ADMIN_BULK_IMPORT'
                        };
                        batch.set(doc(db, 'tenantInvitations', tenantId), {
                            ...tenantData,
                            invitationStatus: 'PENDING_AUTH_CREATION',
                            note: 'Create/send Firebase Auth invite from server-side function before tenant login.'
                        }, { merge: true });
                        batch.set(doc(db, 'properties', propertyId, 'tenants', tenantId), tenantData, { merge: true });
                        batch.set(doc(db, 'tenants', tenantId), tenantData, { merge: true });
                        batch.set(doc(db, 'properties', propertyId, 'units', unitId), {
                            unitId,
                            propertyId,
                            tenantId,
                            tenantEmail: email,
                            occupancyStatus: 'OCCUPIED',
                            updatedAt: now
                        }, { merge: true });
                    } else {
                        throw new Error(`CSV row ${row.__rowNumber}: unsupported TYPE '${type}'`);
                    }
                });

                await batch.commit();
                const currentBatchIndex = Math.floor(i / BATCH_SIZE) + 1;
                const newlyProcessed = processed + chunk.length;
                processed = newlyProcessed;
                
                setProgress((newlyProcessed / rows.length) * 100);
                setLogs(prev => [...prev, t('admin.committed_batch', { index: currentBatchIndex, current: newlyProcessed, total: rows.length })]);
            }

            setLogs(prev => [...prev, t('admin.import_success_msg')]);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <Box p={4} sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 900, color: '#1a237e', textAlign: isRTL ? 'right' : 'left' }}>
                {t('admin.v2_bulk_importer')}
            </Typography>
            <Typography variant="body1" color="textSecondary" mb={3} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                {t('admin.bulk_importer_desc')}
            </Typography>

            <Paper variant="outlined" sx={{ p: 8, textAlign: 'center', border: '2px dashed #ccc' }}>
                <input
                    accept=".csv"
                    className="hidden"
                    id="raised-button-file"
                    style={{ display: 'none' }}
                    type="file"
                    onChange={handleFileChange}
                />
                <label htmlFor="raised-button-file">
                    <Button
                        variant="contained"
                        component="span"
                        startIcon={<CloudUpload />}
                        sx={{ mb: 4, bgcolor: '#1a237e' }}
                    >
                        {t('admin.select_csv_btn')}
                    </Button>
                </label>
                {file && <Typography variant="subtitle1" sx={{ textAlign: 'center' }}>{file.name}</Typography>}
            </Paper>

            {uploading && (
                <Box mt={3}>
                    <LinearProgress variant="determinate" value={progress} sx={{ h: '10px', borderRadius: '5px' }} />
                    <Typography variant="caption" mt={1} display="block" sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                        {t('onboarding.payment.verifying')} {Math.round(progress)}%
                    </Typography>
                </Box>
            )}

            {error && <Alert severity="error" sx={{ mt: 4, textAlign: isRTL ? 'right' : 'left' }}>{error}</Alert>}

            <Box mt={4}>
                <Button
                    variant="contained"
                    color="success"
                    disabled={!file || uploading}
                    onClick={startImport}
                    fullWidth
                    size="large"
                    sx={{ fontWeight: 900 }}
                >
                    {uploading ? t('admin.proc_arch') : t('admin.exec_prod_load')}
                </Button>
            </Box>

            {logs.length > 0 && (
                <Paper variant="outlined" sx={{ mt: 8, p: 4, bgcolor: '#f5f5f5', maxHeight: '200px', overflow: 'auto' }}>
                    {logs.map((log, i) => (
                        <Typography key={i} variant="caption" display="block" sx={{ fontStyle: 'monospace', textAlign: isRTL ? 'right' : 'left' }}>
                            {`> ${log}`}
                        </Typography>
                    ))}
                </Paper>
            )}
        </Box>
    );
};

export default BulkImporter;
