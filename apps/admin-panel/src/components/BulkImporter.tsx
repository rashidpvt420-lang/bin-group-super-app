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
import { db } from '../lib/firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';
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
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        return lines.slice(1).filter(line => line.trim()).map(line => {
            const values = line.split(',').map(v => v.trim());
            const entry: any = {};
            headers.forEach((h, i) => {
                entry[h] = values[i];
            });
            return entry;
        });
    };

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
                    if (type === 'PROPERTY') {
                        const propRef = doc(collection(db, 'properties'));
                        batch.set(propRef, {
                            name: row.Bldg_Name || row.Name || 'Unnamed Building',
                            zone: row.Bldg_Zone || row.Zone || 'General',
                            unitsCount: parseInt(row.Units_Count || row.Units) || 0,
                            ownerId: row.Owner_UID || row.OwnerId || 'PENDING',
                            status: 'unlocked',
                            createdAt: new Date().toISOString(),
                            v2Scale: true
                        });
                    } else if (type === 'UNIT') {
                        const unitRef = doc(collection(db, 'units'));
                        batch.set(unitRef, {
                            unitNumber: row.Unit_Number || row.Number,
                            floorNumber: row.Floor || 0,
                            propertyId: row.Property_ID || row.PropertyId,
                            occupancyStatus: 'VACANT',
                            createdAt: new Date().toISOString()
                        });
                    } else if (type === 'TENANT') {
                        const userRef = doc(collection(db, 'users'));
                        batch.set(userRef, {
                            displayName: row.Name || row.FullName,
                            email: (row.Email || '').toLowerCase(),
                            role: 'tenant',
                            status: 'active',
                            createdAt: new Date().toISOString()
                        });
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
