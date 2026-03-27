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

const BulkImporter: React.FC = () => {
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
        setLogs(['Reading file...']);

        try {
            const text = await file.text();
            const rows = parseCSV(text);
            setLogs(prev => [...prev, `Found ${rows.length} records. Starting batch upload...`]);

            const BATCH_SIZE = 500;
            let processed = 0;

            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = writeBatch(db);
                const chunk = rows.slice(i, i + BATCH_SIZE);

                chunk.forEach(row => {
                    // V2 Mapping: Bldg_Name -> properties.name, Bldg_Zone -> properties.zone
                    const propRef = doc(collection(db, 'properties'));
                    batch.set(propRef, {
                        name: row.Bldg_Name || 'Unnamed Building',
                        zone: row.Bldg_Zone || 'General',
                        unitsCount: parseInt(row.Units_Count) || 53,
                        ownerId: row.Owner_UID || 'PENDING',
                        status: 'unlocked',
                        createdAt: new Date().toISOString(),
                        v2Scale: true
                    });
                });

                await batch.commit();
                const currentBatchIndex = Math.floor(i / BATCH_SIZE) + 1;
                const newlyProcessed = processed + chunk.length;
                processed = newlyProcessed;
                
                setProgress((newlyProcessed / rows.length) * 100);
                setLogs(prev => [...prev, `Committed batch ${currentBatchIndex} (${newlyProcessed}/${rows.length})`]);
            }

            setLogs(prev => [...prev, 'Import Successful! 500+ Properties Ready.']);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <Box p={4}>
            <Typography variant="h4" gutterBottom className="font-bold text-[#1a237e]">
                V2 Bulk Property Importer
            </Typography>
            <Typography variant="body1" color="textSecondary" mb={3}>
                Scale BIN Construction portfolio to 500+ properties instantly via CSV.
            </Typography>

            <Paper variant="outlined" className="p-8 text-center border-2 border-dashed border-[#ccc]">
                <input
                    accept=".csv"
                    className="hidden"
                    id="raised-button-file"
                    type="file"
                    onChange={handleFileChange}
                />
                <label htmlFor="raised-button-file">
                    <Button
                        variant="contained"
                        component="span"
                        startIcon={<CloudUpload />}
                        className="mb-4 bg-[#1a237e]"
                    >
                        Select Property CSV
                    </Button>
                </label>
                {file && <Typography variant="subtitle1">{file.name}</Typography>}
            </Paper>

            {uploading && (
                <Box mt={3}>
                    <LinearProgress variant="determinate" value={progress} className="h-[10px] rounded-[5px]" />
                    <Typography variant="caption" mt={1} display="block">Uploading... {Math.round(progress)}%</Typography>
                </Box>
            )}

            {error && <Alert severity="error" className="mt-4">{error}</Alert>}

            <Box mt={4}>
                <Button
                    variant="contained"
                    color="success"
                    disabled={!file || uploading}
                    onClick={startImport}
                    fullWidth
                    size="large"
                >
                    {uploading ? 'Processing Architecture...' : 'EXECUTE PRODUCTION LOAD'}
                </Button>
            </Box>

            {logs.length > 0 && (
                <Paper variant="outlined" className="mt-8 p-4 bg-[#f5f5f5] max-h-[200px] overflow-auto">
                    {logs.map((log, i) => (
                        <Typography key={i} variant="caption" display="block" className="font-mono">
                            {`> ${log}`}
                        </Typography>
                    ))}
                </Paper>
            )}
        </Box>
    );
};

export default BulkImporter;
