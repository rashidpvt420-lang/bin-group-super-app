import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Typography, Box, Stack, FormControl, InputLabel, Select,
    MenuItem, Alert, CircularProgress, Table, TableHead,
    TableBody, TableRow, TableCell, TableContainer, Paper,
    Stepper, Step, StepLabel, Chip
} from '@mui/material';
import {
    CloudUpload as UploadIcon,
    Download as DownloadIcon,
    CheckCircle as CheckIcon,
    Error as ErrorIcon,
    Warning as WarningIcon
} from '@mui/icons-material';
import {
    collection, query, where, getDocs, doc, writeBatch,
    serverTimestamp, limit
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from '@/lib/firebase';
import Papa from 'papaparse';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface BulkTenantImportDialogProps {
    open: boolean;
    onClose: () => void;
    properties?: any[];
    onImportComplete: () => void;
}

interface ImportRow {
    index: number;
    data: any;
    errors: string[];
    warnings: string[];
    status: 'valid' | 'error' | 'warning';
}

interface PropertyUnit {
    id: string;
    unitNumber: string | number;
    occupancyStatus?: string;
}

export default function BulkTenantImportDialog({ open, onClose, properties = [], onImportComplete }: BulkTenantImportDialogProps) {
    const [activeStep, setActiveStep] = useState(0);
    const [selectedPropertyId, setSelectedPropertyId] = useState('');
    const [importing, setImporting] = useState(false);
    const [rows, setRows] = useState<ImportRow[]>([]);
    const [stats, setStats] = useState({ total: 0, valid: 0, errors: 0, warnings: 0 });
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [units, setUnits] = useState<PropertyUnit[]>([]);
    const [autoCreateUnits, setAutoCreateUnits] = useState(false);

    const steps = ['Select Property', 'Upload CSV', 'Preview & Validate', 'Finalize'];

    const handleDownloadTemplate = () => {
        const headers = [
            'unitNumber', 'tenantName', 'email', 'phone', 'emiratesId',
            'leaseStart', 'leaseEnd', 'annualRent', 'paidBalance',
            'securityDeposit', 'rentFrequency', 'paymentDueDay', 'notes'
        ];
        const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" +
            "101,John Doe,john@example.com,+971501234567,784-1234-1234567-1,2024-01-01,2024-12-31,50000,25000,25000,5000,Quarterly,Sample Note";
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "tenant_import_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results: any) => {
                validateRows(results.data);
                setActiveStep(2);
            },
            error: (err: any) => {
                setError("Failed to parse CSV: " + (err?.message || "Unknown error"));
            }
        });
    };

    const validateRows = async (data: any[]) => {
        const validatedRows: ImportRow[] = [];
        let validCount = 0;
        let errorCount = 0;
        let warningCount = 0;

        const emailSet = new Set();
        const unitSet = new Set();

        // Fetch units for the property to validate existence
        let propertyUnits: PropertyUnit[] = [];
        try {
            const unitsSnap = await getDocs(query(collection(db, 'units'), where('propertyId', '==', selectedPropertyId)));
            propertyUnits = unitsSnap.docs.map(d => ({ id: d.id, ...d.data() } as PropertyUnit));
        } catch (e) {
            console.error("Error fetching units:", e);
        }
        setUnits(propertyUnits);

        data.forEach((item: any, index: number) => {
            const rowErrors: string[] = [];
            const rowWarnings: string[] = [];

            // Required Fields
            if (!item.tenantName) rowErrors.push("Tenant Name is required");
            if (!item.email) rowErrors.push("Email is required");
            else if (!item.email.includes('@')) rowErrors.push("Invalid email format");

            if (!item.unitNumber) rowErrors.push("Unit Number is required");

            // Duplicate Detection
            if (item.email && emailSet.has(item.email.toLowerCase())) rowErrors.push("Duplicate email in CSV");
            if (item.unitNumber && unitSet.has(item.unitNumber)) rowErrors.push("Duplicate unit number in CSV");

            if (item.email) emailSet.add(item.email.toLowerCase());
            if (item.unitNumber) unitSet.add(item.unitNumber);

            // Unit Existence
            if (item.unitNumber) {
                const unitExists = propertyUnits.find(u => String(u.unitNumber) === String(item.unitNumber));
                if (!unitExists && !autoCreateUnits) {
                    rowErrors.push(`Unit ${item.unitNumber} not found. Enable 'Auto-create units' to fix.`);
                } else if (!unitExists && autoCreateUnits) {
                    rowWarnings.push(`Unit ${item.unitNumber} will be auto-created`);
                } else if (unitExists && unitExists.occupancyStatus === 'occupied') {
                    rowWarnings.push(`Unit ${item.unitNumber} is currently occupied (will be overwritten)`);
                }
            }

            // Numeric Validations
            if (item.annualRent !== undefined && item.annualRent !== '') {
                if (isNaN(Number(item.annualRent))) rowErrors.push("Annual Rent must be numeric");
                else if (Number(item.annualRent) < 0) rowErrors.push("Annual Rent cannot be negative");
            } else {
                rowErrors.push("Annual Rent is missing");
            }

            if (item.paidBalance !== undefined && item.paidBalance !== '') {
                if (isNaN(Number(item.paidBalance))) rowErrors.push("Paid Balance must be numeric");
            }

            // Date Validations
            if (item.leaseStartDate && isNaN(Date.parse(item.leaseStartDate))) rowErrors.push("Invalid Lease Start date");
            if (item.leaseEndDate && isNaN(Date.parse(item.leaseEndDate))) rowErrors.push("Invalid Lease End date");

            if (item.leaseStartDate && item.leaseEndDate) {
                if (Date.parse(item.leaseStartDate) >= Date.parse(item.leaseEndDate)) {
                    rowErrors.push("Lease Start must be before Lease End");
                }
            }

            const status = rowErrors.length > 0 ? 'error' : (rowWarnings.length > 0 ? 'warning' : 'valid');
            if (status === 'valid') validCount++;
            else if (status === 'error') errorCount++;
            else warningCount++;

            validatedRows.push({
                index,
                data: item,
                errors: rowErrors,
                warnings: rowWarnings,
                status
            });
        });

        setRows(validatedRows);
        setStats({ total: data.length, valid: validCount, errors: errorCount, warnings: warningCount });
    };

    const handleImport = async () => {
        if (!auth.currentUser) return;
        setImporting(true);
        setError(null);

        try {
            const batch = writeBatch(db);
            const importBatchId = "batch_" + Date.now();
            const property = properties.find(p => p.id === selectedPropertyId);

            let invitedCount = 0;

            for (const row of rows) {
                if (row.status === 'error') continue;

                const tenantEmail = row.data.email.toLowerCase().trim();
                const tenantName = row.data.tenantName;

                // 1. Resolve Unit
                let unit = units.find(u => String(u.unitNumber) === String(row.data.unitNumber));
                let unitId = unit?.id;

                if (!unit && autoCreateUnits) {
                    const unitRef = doc(collection(db, 'units'));
                    unitId = unitRef.id;
                    batch.set(unitRef, {
                        propertyId: selectedPropertyId,
                        unitNumber: row.data.unitNumber,
                        occupancyStatus: "occupied",
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                } else if (unit) {
                    batch.update(doc(db, 'units', unit.id), {
                        tenantId: "STUB", // Will be updated after user resolution
                        tenantName,
                        tenantEmail,
                        occupancyStatus: "occupied",
                        updatedAt: serverTimestamp()
                    });
                }

                // 2. Resolve/Create User
                const userQuery = await getDocs(query(collection(db, 'users'), where('email', '==', tenantEmail), limit(1)));
                let tenantId;

                if (!userQuery.empty) {
                    tenantId = userQuery.docs[0].id;
                } else {
                    const userRef = doc(collection(db, 'users'));
                    tenantId = userRef.id;
                    batch.set(userRef, {
                        role: "tenant",
                        status: "invited",
                        displayName: tenantName,
                        email: tenantEmail,
                        propertyId: selectedPropertyId,
                        unitId: unitId || '',
                        unitNumber: row.data.unitNumber,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        createdBy: auth.currentUser?.uid || 'system',
                        importBatchId
                    });
                }

                // 3. Financial Calculations
                const annualRent = Number(row.data.annualRent) || 0;
                const paidBalance = Number(row.data.paidBalance) || 0;
                const outstandingBalance = Math.max(0, annualRent - paidBalance);
                const paymentStatus = outstandingBalance === 0 ? 'paid' : (paidBalance > 0 ? 'partial' : 'unpaid');

                // 4. Create Lease
                const leaseRef = doc(collection(db, 'leases'));
                const leaseId = leaseRef.id;
                batch.set(leaseRef, {
                    propertyId: selectedPropertyId,
                    unitId: unitId || '',
                    tenantId,
                    ownerId: property?.ownerId || '',
                    leaseStartDate: row.data.leaseStartDate || row.data.leaseStart || '',
                    leaseEndDate: row.data.leaseEndDate || row.data.leaseEnd || '',
                    annualRent,
                    rentFrequency: row.data.rentFrequency || 'Annual',
                    securityDeposit: Number(row.data.securityDeposit) || 0,
                    leaseStatus: "active",
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    importBatchId
                });

                // 5. Create Ledger
                const ledgerRef = doc(collection(db, 'tenant_ledger'));
                batch.set(ledgerRef, {
                    tenantId,
                    propertyId: selectedPropertyId,
                    unitId: unitId || '',
                    leaseId,
                    ownerId: property?.ownerId || '',
                    annualRent,
                    paidBalance,
                    outstandingBalance,
                    securityDeposit: Number(row.data.securityDeposit) || 0,
                    paymentStatus,
                    ledgerStatus: 'active',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    importBatchId
                });

                // 6. Create Invitation
                const inviteRef = doc(collection(db, 'tenant_invitations'));
                batch.set(inviteRef, {
                    propertyId: selectedPropertyId,
                    unitId: unitId || '',
                    tenantId,
                    tenantEmail,
                    tenantName,
                    status: "pending",
                    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                    createdAt: serverTimestamp(),
                    createdBy: auth.currentUser?.uid || 'system',
                    importBatchId
                });
                invitedCount++;
            }

            // 6. Create Batch Record
            const batchRef = doc(collection(db, 'tenant_import_batches'));
            batch.set(batchRef, {
                propertyId: selectedPropertyId,
                propertyName: property?.name || property?.propertyName || 'Property',
                ownerId: property?.ownerId || '',
                uploadedBy: auth.currentUser?.uid || 'system',
                totalRows: stats.total,
                validRows: stats.valid,
                errorRows: stats.errors,
                invitedCount,
                createdAt: serverTimestamp(),
                status: 'completed',
                importBatchId
            });

            await batch.commit();

            // Trigger automatic invitations
            try {
                const sendFn = httpsCallable(functions, 'sendTenantInvitations');
                await sendFn({ importBatchId });
            } catch (sendErr) {
                console.warn("Auto-invitation trigger failed:", sendErr);
            }

            setSuccess(`Successfully imported ${stats.valid} tenants.`);
            setActiveStep(3);
            onImportComplete();
        } catch (err: any) {
            console.error("Import Error:", err);
            setError("Import failed: " + (err?.message || "Unknown Error"));
        } finally {
            setImporting(false);
        }
    };

    const handleExportPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text("BIN GROUP - Tenant Import Summary", 14, 22);
        doc.setFontSize(12);
        doc.text(`Property: ${properties.find(p => p.id === selectedPropertyId)?.name || 'N/A'}`, 14, 32);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 40);
        doc.text(`Total Records: ${stats.total}`, 14, 48);
        doc.text(`Successfully Imported: ${stats.valid}`, 14, 56);
        doc.text(`Errors Skipped: ${stats.errors}`, 14, 64);

        const tableData = rows.map(row => [
            row.data.unitNumber,
            row.data.tenantName,
            row.data.email,
            row.status.toUpperCase(),
            row.errors.join(", ") || (row.status === 'valid' ? 'Success' : 'Warning')
        ]);

        autoTable(doc, {
            startY: 70,
            head: [['Unit', 'Name', 'Email', 'Status', 'Notes/Errors']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [0, 0, 0] as any }
        });

        doc.save("tenant_import_summary.pdf");
    };

    const handleExportInvitationCSV = () => {
        const inviteRows = rows.filter(r => r.status !== 'error').map(r => ({
            unitNumber: r.data.unitNumber,
            tenantName: r.data.tenantName,
            email: r.data.email,
            inviteLink: `https://bin-groups.com/tenant-invite?token=invite_...` // Token would need to be captured during import
        }));

        const csv = Papa.unparse(inviteRows);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "tenant_invitations_export.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportRentCSV = () => {
        const rentRows = rows.filter(r => r.status !== 'error').map(r => {
            const annualRent = Number(r.data.annualRent) || 0;
            const paidBalance = Number(r.data.paidBalance) || 0;
            const rentBalance = Math.max(0, annualRent - paidBalance);

            return {
                unitNumber: r.data.unitNumber,
                tenantName: r.data.tenantName,
                annualRent: annualRent,
                totalPaid: paidBalance,
                rentBalance: rentBalance
            };
        });

        const csv = Papa.unparse(rentRows);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "tenant_rent_balances.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const reset = () => {
        setActiveStep(0);
        setSelectedPropertyId('');
        setRows([]);
        setError(null);
        setSuccess(null);
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogTitle sx={{ fontWeight: 900 }}>BULK TENANT IMPORT ENGINE</DialogTitle>
            <DialogContent dividers>
                <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
                    {steps.map((label) => (
                        <Step key={label}><StepLabel>{label}</StepLabel></Step>
                    ))}
                </Stepper>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                {activeStep === 0 && (
                    <Box sx={{ py: 4, textAlign: 'center' }}>
                        <Typography variant="h6" gutterBottom>Step 1: Select Target Property</Typography>
                        <FormControl fullWidth sx={{ maxWidth: 400, mt: 2 }}>
                            <InputLabel>Select Property</InputLabel>
                            <Select
                                value={selectedPropertyId}
                                onChange={(e) => setSelectedPropertyId(e.target.value)}
                                label="Select Property"
                            >
                                {properties.filter(p => p.status === 'approved' || p.status === 'active').map(p => (
                                    <MenuItem key={p.id} value={p.id}>{p.name || p.propertyName} ({p.emirate || 'Unknown'})</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <Box sx={{ mt: 3, textAlign: 'left', maxWidth: 400, mx: 'auto' }}>
                            <Stack direction="row" spacing={2} alignItems="center">
                                <Typography variant="body2">Auto-create missing units?</Typography>
                                <Button
                                    size="small"
                                    variant={autoCreateUnits ? "contained" : "outlined"}
                                    onClick={() => setAutoCreateUnits(!autoCreateUnits)}
                                    sx={{ borderRadius: 4 }}
                                >
                                    {autoCreateUnits ? "ENABLED" : "DISABLED"}
                                </Button>
                            </Stack>
                        </Box>
                        <Box sx={{ mt: 4 }}>
                            <Button
                                variant="contained"
                                disabled={!selectedPropertyId}
                                onClick={() => setActiveStep(1)}
                                sx={{ borderRadius: 100, px: 4, bgcolor: '#000', fontWeight: 900 }}
                            >
                                CONTINUE TO UPLOAD
                            </Button>
                        </Box>
                    </Box>
                )}

                {activeStep === 1 && (
                    <Box sx={{ py: 4, textAlign: 'center' }}>
                        <Typography variant="h6" gutterBottom>Step 2: Upload Tenant CSV</Typography>
                        <Typography color="text.secondary" sx={{ mb: 4 }}>
                            Please use our standard template for optimal processing.
                        </Typography>

                        <Stack direction="row" spacing={2} justifyContent="center" sx={{ mb: 4 }}>
                            <Button startIcon={<DownloadIcon />} onClick={handleDownloadTemplate} sx={{ fontWeight: 800 }}>
                                DOWNLOAD CSV TEMPLATE
                            </Button>
                            <Button
                                component="label"
                                variant="contained"
                                startIcon={<UploadIcon />}
                                sx={{ borderRadius: 100, px: 4, bgcolor: '#000', fontWeight: 900 }}
                            >
                                UPLOAD COMPLETED CSV
                                <input type="file" hidden accept=".csv" onChange={handleFileUpload} />
                            </Button>
                        </Stack>
                    </Box>
                )}

                {activeStep === 2 && (
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h6" fontWeight="900">Step 3: Preview & Validation Results</Typography>
                            <Stack direction="row" spacing={1}>
                                <Chip label={`${stats.valid} Valid`} color="success" size="small" />
                                <Chip label={`${stats.errors} Errors`} color="error" size="small" />
                                <Chip label={`${stats.warnings} Warnings`} color="warning" size="small" />
                            </Stack>
                        </Box>

                        <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
                                        <TableCell sx={{ fontWeight: 900 }}>Unit</TableCell>
                                        <TableCell sx={{ fontWeight: 900 }}>Name</TableCell>
                                        <TableCell sx={{ fontWeight: 900 }}>Email</TableCell>
                                        <TableCell sx={{ fontWeight: 900 }}>Details / Errors</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {rows.map((row, i) => (
                                        <TableRow key={i} sx={{ bgcolor: row.status === 'error' ? 'rgba(211, 47, 47, 0.05)' : 'inherit' }}>
                                            <TableCell>
                                                {row.status === 'valid' && <CheckIcon color="success" fontSize="small" />}
                                                {row.status === 'error' && <ErrorIcon color="error" fontSize="small" />}
                                                {row.status === 'warning' && <WarningIcon color="warning" fontSize="small" />}
                                            </TableCell>
                                            <TableCell>{row.data.unitNumber}</TableCell>
                                            <TableCell>{row.data.tenantName}</TableCell>
                                            <TableCell>{row.data.email}</TableCell>
                                            <TableCell>
                                                {row.errors.map((e, ei) => <Typography key={ei} variant="caption" color="error" display="block">• {e}</Typography>)}
                                                {row.warnings.map((w, wi) => <Typography key={wi} variant="caption" color="warning.main" display="block">• {w}</Typography>)}
                                                {row.status === 'valid' && <Typography variant="caption" color="success.main">Ready for import</Typography>}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>

                        <Box sx={{ mt: 3, p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
                            <Typography variant="body2" color="text.secondary">
                                <strong>Important:</strong> Rows with errors will be skipped. Rows with warnings will be imported but may overwrite existing occupancy states.
                            </Typography>
                        </Box>
                    </Box>
                )}

                {activeStep === 3 && (
                    <Box sx={{ py: 6, textAlign: 'center' }}>
                        <CheckIcon sx={{ fontSize: 80, color: 'success.main', mb: 2 }} />
                        <Typography variant="h5" fontWeight="950">IMPORT SUCCESSFUL</Typography>
                        <Typography color="text.secondary" sx={{ mt: 1, mb: 4 }}>
                            {stats.valid} tenants have been added to the registry and linked to their respective units.
                        </Typography>

                        <Stack direction="row" spacing={2} justifyContent="center" sx={{ mb: 4 }}>
                            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportPDF}>
                                DOWNLOAD PDF SUMMARY
                            </Button>
                            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportRentCSV}>
                                EXPORT RENT BALANCES
                            </Button>
                            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportInvitationCSV}>
                                EXPORT INVITE LIST
                            </Button>
                        </Stack>

                        <Button variant="contained" onClick={reset} sx={{ borderRadius: 100, px: 4, bgcolor: '#000' }}>
                            IMPORT ANOTHER BATCH
                        </Button>
                    </Box>
                )}
            </DialogContent>
            <DialogActions sx={{ p: 3 }}>
                {activeStep < 2 && <Button onClick={onClose}>CANCEL</Button>}
                {activeStep === 2 && (
                    <>
                        <Button onClick={() => setActiveStep(1)}>RE-UPLOAD</Button>
                        <Button
                            variant="contained"
                            disabled={stats.valid === 0 || importing}
                            onClick={handleImport}
                            sx={{ borderRadius: 100, px: 4, bgcolor: '#000', fontWeight: 900 }}
                        >
                            {importing ? <CircularProgress size={20} color="inherit" /> : `CONFIRM IMPORT (${stats.valid} ROWS)`}
                        </Button>
                    </>
                )}
                {activeStep === 3 && <Button onClick={onClose} sx={{ fontWeight: 900 }}>CLOSE</Button>}
            </DialogActions>
        </Dialog>
    );
}
