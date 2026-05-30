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
import { writeBatch, doc, increment } from 'firebase/firestore';
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
            setError(null);
            setProgress(0);
            setLogs([]);
        }
    };

    const splitCsvLine = (line: string) => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i += 1) {
            const char = line[i];
            const next = line[i + 1];

            if (char === '"' && next === '"') {
                current += '"';
                i += 1;
            } else if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current.trim());
        return result;
    };

    const parseCSV = (text: string) => {
        const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
        const headers = splitCsvLine(lines[0] || '').map(h => h.trim());
        return lines.slice(1).filter(line => line.trim()).map((line, rowIndex) => {
            const values = splitCsvLine(line);
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

    const getField = (row: any, keys: string[]) => {
        return keys.map(k => row[k]).find(val => val !== undefined && val !== null && val !== '') || '';
    };

    const toInt = (value: any, fallback = 0) => {
        const parsed = parseInt(String(value || ''), 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    const makeFloorId = (propertyId: string, floorNumber: string | number) => createSlug(`${propertyId}-floor-${floorNumber}`);

    const setFloorRecord = (batch: ReturnType<typeof writeBatch>, args: {
        propertyId: string;
        ownerId?: string;
        floorNumber: string | number;
        floorLabel?: string;
        now: string;
    }) => {
        const floorId = makeFloorId(args.propertyId, args.floorNumber);
        const floorData = {
            floorId,
            propertyId: args.propertyId,
            ownerId: args.ownerId || '',
            floorNumber: toInt(args.floorNumber),
            floorLabel: args.floorLabel || `Floor ${args.floorNumber}`,
            status: 'ACTIVE_ADMIN_IMPORTED',
            source: 'ADMIN_BULK_IMPORT',
            updatedAt: args.now,
            createdAt: args.now
        };

        batch.set(doc(db, 'floors', floorId), floorData, { merge: true });
        batch.set(doc(db, 'properties', args.propertyId, 'floors', floorId), floorData, { merge: true });
        return floorId;
    };

    const touchPropertyPassport = (batch: ReturnType<typeof writeBatch>, propertyId: string, now: string, data: Record<string, any> = {}) => {
        batch.set(doc(db, 'propertyPassports', propertyId), {
            propertyId,
            source: 'ADMIN_BULK_IMPORT',
            status: 'ACTIVE_ADMIN_IMPORTED',
            updatedAt: now,
            ...data
        }, { merge: true });
    };

    const startImport = async () => {
        if (!file) return;
        setUploading(true);
        setError(null);
        setLogs([t('admin.reading_file')]);

        try {
            const text = await file.text();
            const rows = parseCSV(text);
            if (!rows.length) throw new Error('CSV contains no import rows.');
            setLogs(prev => [...prev, t('admin.found_records', { count: rows.length })]);

            const BATCH_SIZE = 50;
            let processed = 0;

            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = writeBatch(db);
                const chunk = rows.slice(i, i + BATCH_SIZE);

                chunk.forEach(row => {
                    const now = new Date().toISOString();
                    const hasExplicitType = row.TYPE !== undefined && row.TYPE !== null && row.TYPE !== '';

                    if (hasExplicitType) {
                        const type = String(row.TYPE).toUpperCase();
                        if (type === 'PROPERTY') {
                            const ownerId = requireField(row, ['Owner_UID', 'OwnerId', 'ownerId']);
                            const propertyId = row.Property_ID || row.PropertyId || createSlug(row.Bldg_Name || row.Name || `property-${row.__rowNumber}`);
                            const floorsCount = toInt(row.Floors || row.Floors_Count || row.Floor_Count);
                            const unitsCount = toInt(row.Units_Count || row.Units);
                            const propRef = doc(db, 'properties', propertyId);
                            batch.set(propRef, {
                                propertyId,
                                name: row.Bldg_Name || row.Name || 'Unnamed Building',
                                propertyName: row.Bldg_Name || row.Name || 'Unnamed Building',
                                zone: row.Bldg_Zone || row.Zone || 'General',
                                floorsCount,
                                unitsCount,
                                ownerId,
                                emirate: row.Emirate || row.emirate || 'Abu Dhabi',
                                propertyType: row.Property_Type || row.PropertyType || 'Building',
                                status: 'active',
                                createdAt: now,
                                updatedAt: now,
                                v2Scale: true
                            }, { merge: true });
                            touchPropertyPassport(batch, propertyId, now, {
                                ownerId,
                                propertyType: row.Property_Type || row.PropertyType || 'Building',
                                emirate: row.Emirate || row.emirate || 'Abu Dhabi',
                                city: row.City || row.city || '',
                                zone: row.Bldg_Zone || row.Zone || 'General',
                                floors: floorsCount,
                                units: unitsCount,
                                lifts: toInt(row.Lifts || row.Elevators),
                                parking: toInt(row.Parking || row.Parking_Spaces),
                                age: toInt(row.Age || row.Building_Age),
                                complianceStatus: 'PENDING_ADMIN_REVIEW',
                                activeTenants: toInt(row.Active_Tenants || row.Occupied_Units)
                            });
                        } else if (type === 'FLOOR') {
                            const propertyId = requireField(row, ['Property_ID', 'PropertyId', 'propertyId']);
                            const floorNumber = requireField(row, ['Floor', 'Floor_Number', 'FloorNumber']);
                            const ownerId = row.Owner_UID || row.OwnerId || '';
                            setFloorRecord(batch, {
                                propertyId,
                                ownerId,
                                floorNumber,
                                floorLabel: row.Floor_Label || row.FloorLabel,
                                now
                            });
                            touchPropertyPassport(batch, propertyId, now, {
                                ownerId,
                                floors: increment(1),
                                complianceStatus: 'PENDING_ADMIN_REVIEW'
                            });
                        } else if (type === 'UNIT') {
                            const propertyId = requireField(row, ['Property_ID', 'PropertyId', 'propertyId']);
                            const unitNumber = requireField(row, ['Unit_Number', 'Number', 'Unit']);
                            const unitId = row.Unit_ID || row.UnitId || createSlug(`${propertyId}-${unitNumber}`);
                            const floorNumber = toInt(row.Floor || row.Floor_Number || row.FloorNumber);
                            const ownerId = row.Owner_UID || row.OwnerId || '';
                            if (floorNumber) {
                                setFloorRecord(batch, { propertyId, ownerId, floorNumber, now });
                            }
                            const unitData = {
                                unitId,
                                unitNumber,
                                floorNumber,
                                floorId: floorNumber ? makeFloorId(propertyId, floorNumber) : '',
                                propertyId,
                                ownerId,
                                tenantId: row.Tenant_UID || row.TenantId || '',
                                occupancyStatus: row.Tenant_UID || row.TenantId ? 'OCCUPIED' : 'VACANT',
                                createdAt: now,
                                updatedAt: now,
                                source: 'ADMIN_BULK_IMPORT'
                            };
                            batch.set(doc(db, 'units', unitId), unitData, { merge: true });
                            batch.set(doc(db, 'properties', propertyId, 'units', unitId), unitData, { merge: true });
                            touchPropertyPassport(batch, propertyId, now, {
                                ownerId,
                                units: increment(1),
                                activeTenants: unitData.occupancyStatus === 'OCCUPIED' ? increment(1) : increment(0)
                            });
                        } else if (type === 'TENANT') {
                            const propertyId = requireField(row, ['Property_ID', 'PropertyId', 'propertyId']);
                            const email = String(requireField(row, ['Email', 'email'])).toLowerCase();
                            const tenantId = row.Tenant_UID || row.TenantId || createSlug(email);
                            const unitId = row.Unit_ID || row.UnitId || createSlug(`${propertyId}-${row.Unit_Number || row.Unit || tenantId}`);
                            const floorNumber = toInt(row.Floor || row.Floor_Number || row.FloorNumber);
                            const ownerId = row.Owner_UID || row.OwnerId || '';
                            if (floorNumber) {
                                setFloorRecord(batch, { propertyId, ownerId, floorNumber, now });
                            }
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
                                floorNumber,
                                floorId: floorNumber ? makeFloorId(propertyId, floorNumber) : '',
                                ownerId,
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
                                ownerId,
                                tenantId,
                                tenantEmail: email,
                                floorNumber,
                                floorId: floorNumber ? makeFloorId(propertyId, floorNumber) : '',
                                occupancyStatus: 'OCCUPIED',
                                updatedAt: now
                            }, { merge: true });
                            touchPropertyPassport(batch, propertyId, now, {
                                ownerId,
                                activeTenants: increment(1),
                                complianceStatus: 'PENDING_ADMIN_REVIEW'
                            });
                        } else {
                            throw new Error(`CSV row ${row.__rowNumber}: unsupported TYPE '${type}'`);
                        }
                    } else {
                        // Hierarchical layout: one row may create property + floor + unit + tenant.
                        const bldgName = getField(row, ['Bldg_Name', 'Name', 'BuildingName', 'Building_Name', 'Property_Name', 'PropertyName']);
                        const ownerId = getField(row, ['Owner_UID', 'OwnerId', 'ownerId', 'Owner_Id', 'OwnerUid']);
                        if (bldgName || ownerId) {
                            const actualOwnerId = ownerId || 'SYSTEM_DEFAULT_OWNER';
                            const propertyId = getField(row, ['Property_ID', 'PropertyId', 'propertyId', 'Property_Id']) || createSlug(bldgName || `property-${row.__rowNumber}`);
                            const floorsCount = toInt(getField(row, ['Floors', 'Floors_Count', 'Floor_Count']));
                            const unitsCount = toInt(getField(row, ['Units_Count', 'Units', 'UnitsCount']));
                            const propRef = doc(db, 'properties', propertyId);
                            batch.set(propRef, {
                                propertyId,
                                name: bldgName || 'Unnamed Building',
                                propertyName: bldgName || 'Unnamed Building',
                                zone: getField(row, ['Bldg_Zone', 'Zone', 'BldgZone', 'Zone_Code']) || 'General',
                                floorsCount,
                                unitsCount,
                                ownerId: actualOwnerId,
                                emirate: getField(row, ['Emirate', 'emirate', 'State', 'Region']) || 'Abu Dhabi',
                                propertyType: getField(row, ['Property_Type', 'PropertyType', 'Property_Type']) || 'Building',
                                status: 'active',
                                createdAt: now,
                                updatedAt: now,
                                v2Scale: true
                            }, { merge: true });
                            touchPropertyPassport(batch, propertyId, now, {
                                ownerId: actualOwnerId,
                                propertyType: getField(row, ['Property_Type', 'PropertyType', 'Property_Type']) || 'Building',
                                emirate: getField(row, ['Emirate', 'emirate', 'State', 'Region']) || 'Abu Dhabi',
                                city: getField(row, ['City', 'city']) || '',
                                zone: getField(row, ['Bldg_Zone', 'Zone', 'BldgZone', 'Zone_Code']) || 'General',
                                floors: floorsCount,
                                units: unitsCount,
                                lifts: toInt(getField(row, ['Lifts', 'Elevators'])),
                                parking: toInt(getField(row, ['Parking', 'Parking_Spaces'])),
                                age: toInt(getField(row, ['Age', 'Building_Age'])),
                                complianceStatus: 'PENDING_ADMIN_REVIEW'
                            });

                            const floorNumber = getField(row, ['Floor', 'floor', 'FloorNumber', 'Floor_Number']);
                            if (floorNumber) {
                                setFloorRecord(batch, {
                                    propertyId,
                                    ownerId: actualOwnerId,
                                    floorNumber,
                                    floorLabel: getField(row, ['Floor_Label', 'FloorLabel']),
                                    now
                                });
                            }

                            // Unit creation
                            const unitNumber = getField(row, ['Unit_Number', 'Number', 'Unit', 'UnitNumber', 'Unit_Name', 'UnitName']);
                            if (unitNumber) {
                                const unitId = getField(row, ['Unit_ID', 'UnitId', 'unitId', 'Unit_Id']) || createSlug(`${propertyId}-${unitNumber}`);
                                const tenantIdFromRow = getField(row, ['Tenant_UID', 'TenantId', 'TenantUid', 'Tenant_Id']);
                                const tenantEmailFromRow = getField(row, ['Tenant_Email', 'Email', 'email', 'TenantEmail', 'Tenant_Email_Address']);
                                const resolvedTenantId = tenantIdFromRow || (tenantEmailFromRow ? createSlug(tenantEmailFromRow) : '');
                                const numericFloor = toInt(floorNumber);

                                const unitData = {
                                    unitId,
                                    unitNumber,
                                    floorNumber: numericFloor,
                                    floorId: numericFloor ? makeFloorId(propertyId, numericFloor) : '',
                                    propertyId,
                                    ownerId: actualOwnerId,
                                    tenantId: resolvedTenantId,
                                    occupancyStatus: resolvedTenantId ? 'OCCUPIED' : 'VACANT',
                                    createdAt: now,
                                    updatedAt: now,
                                    source: 'ADMIN_BULK_IMPORT'
                                };
                                batch.set(doc(db, 'units', unitId), unitData, { merge: true });
                                batch.set(doc(db, 'properties', propertyId, 'units', unitId), unitData, { merge: true });
                                touchPropertyPassport(batch, propertyId, now, {
                                    activeTenants: resolvedTenantId ? increment(1) : increment(0)
                                });

                                // Tenant creation
                                if (tenantEmailFromRow) {
                                    const email = String(tenantEmailFromRow).toLowerCase();
                                    const tenantId = resolvedTenantId;
                                    const tenantData = {
                                        tenantId,
                                        authUid: getField(row, ['Auth_UID', 'AuthUid', 'Auth_Id']) || '',
                                        displayName: getField(row, ['Tenant_Name', 'TenantName', 'Name', 'FullName', 'Full_Name']) || email,
                                        email,
                                        phone: getField(row, ['Tenant_Phone', 'TenantPhone', 'Phone', 'Mobile', 'Tenant_Mobile']) || '',
                                        role: 'tenant',
                                        status: 'invited',
                                        propertyId,
                                        unitId,
                                        floorNumber: numericFloor,
                                        floorId: numericFloor ? makeFloorId(propertyId, numericFloor) : '',
                                        ownerId: actualOwnerId,
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
                                        tenantId,
                                        tenantEmail: email,
                                        occupancyStatus: 'OCCUPIED',
                                        updatedAt: now
                                    }, { merge: true });
                                }
                            }
                        } else {
                            throw new Error(`CSV row ${row.__rowNumber}: could not identify hierarchical data keys (Bldg_Name or Owner_UID)`);
                        }
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

            <Alert severity="info" sx={{ mb: 3, textAlign: isRTL ? 'right' : 'left' }}>
                CSV supports TYPE values: PROPERTY, FLOOR, UNIT, TENANT. For a 53-unit tower, import one PROPERTY row, optional FLOOR rows, then 53 UNIT/TENANT rows with Property_ID, Floor, Unit_Number, Tenant_Email, Tenant_Name, and Tenant_Phone.
            </Alert>

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
