const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const QuotationService = require('./services/quotationService');
const AssistantService = require('./services/assistantService');
const LocationService = require('./services/locationService');
const DocumentService = require('./services/documentService');
const FinancialWaterfall = require('./functions/financialWaterfall');
const ContractService = require('./services/contractService');
const InvoiceService = require('./services/invoiceService');
const ApprovalService = require('./services/approvalService');
const VendorService = require('./services/vendorService');
const EjariService = require('./services/ejariService');
const KYCService = require('./services/kycService');
const TowerQuoteService = require('./services/towerQuoteService');
const { requirePermission } = require('./middleware/rbacMiddleware');
const { verifyToken, verifyAppCheck } = require('./middleware/firebase-auth');
const { PERMISSIONS } = require('./config/roles');

const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet()); // Security best practice

/**
 * 🏷️ 1. QUOTATION ENDPOINTS
 * Handles pricing requests from Owner and Tenant apps.
 */
app.post('/api/quotes/calculate', verifyToken, requirePermission(PERMISSIONS.ASSET_VIEW), async (req, res) => {
  try {
    const { params, config } = req.body;
    const quote = await QuotationService.computeQuote(params, config);
    res.status(200).json(quote);
  } catch (error) {
    res.status(500).json({ error: 'Quotation calculation failed', details: error.message });
  }
});

/**
 * 💰 2. FINANCIAL WATERFALL ENDPOINTS
 * Calculates owner payouts and rent distribution.
 */
app.post('/api/finance/waterfall', verifyToken, verifyAppCheck, requirePermission(PERMISSIONS.FINANCIAL_OVERSIGHT), async (req, res) => {
  try {
    const { contractId, amount } = req.body;
    const result = FinancialWaterfall.calculatePayout({ contractId, amount });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Waterfall calculation failed', details: error.message });
  }
});

/**
 * 🛠️ 3. MAINTENANCE & TICKET ENDPOINTS
 */
app.post('/api/tickets/create', async (req, res) => {
  // Logic for creating tickets, including AI triage triggers
  res.status(201).json({ message: 'Ticket created successfully', ticketId: 'TKT-' + Date.now() });
});

/**
 * 🤖 4. AI ASSISTANT ENDPOINT
 */
app.post('/api/assistant/query', verifyToken, requirePermission(PERMISSIONS.ASSISTANT_QUERY), async (req, res) => {
  try {
    const { query, ownerId } = req.body;
    if (!query || !ownerId) return res.status(400).json({ error: 'Query and ownerId are required' });
    
    const result = await AssistantService.queryAssistant(query, ownerId);
    res.status(200).json(result);
  } catch (error) {
    console.error("AI Assistant Error:", error);
    res.status(500).json({ error: 'AI processing failed', details: error.message });
  }
});

/**
 * 🛰️ 5. TELEMETRY & LOCATION ENDPOINT
 */
app.post('/api/location/update', verifyToken, requirePermission(PERMISSIONS.TELEMETRY_ACCESS), async (req, res) => {
  try {
    const telemetry = req.body;
    const result = await LocationService.updateLocation(telemetry);
    res.status(200).json(result);
  } catch (error) {
    console.error("Telemetry Error:", error);
    res.status(500).json({ error: 'Telemetry update failed', details: error.message });
  }
});

/**
 * 📄 6. SECURE DOCUMENT CUSTODY ENDPOINTS
 */
app.post('/api/documents/upload-url', verifyToken, verifyAppCheck, requirePermission(PERMISSIONS.KYC_SUBMIT), async (req, res) => {
  try {
    const { docType, fileName } = req.body;
    const { uid, role } = req.user;
    const result = await DocumentService.getSecureUploadUrl(uid, role, docType, fileName);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Secure URL generation failed', details: error.message });
  }
});

app.post('/api/documents/finalize', verifyToken, requirePermission(PERMISSIONS.KYC_SUBMIT), async (req, res) => {
  try {
    const { filePath, metadata } = req.body;
    const { uid, role } = req.user;
    const result = await DocumentService.finalizeDocument(uid, role, filePath, metadata);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Document finalization failed', details: error.message });
  }
});

/**
 * 📝 7. CONTRACT EVIDENCE CHAIN ENDPOINTS
 */
app.post('/api/contracts/generate', verifyToken, verifyAppCheck, requirePermission(PERMISSIONS.CONTRACT_CREATE), async (req, res) => {
  try {
    const params = req.body;
    const result = await ContractService.createContract(params, req.user);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Contract generation failed', details: error.message });
  }
});

app.post('/api/contracts/:id/sign', verifyToken, requirePermission(PERMISSIONS.CONTRACT_SIGN), async (req, res) => {
  try {
    const result = await ContractService.signContract(req.params.id, req.user);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Contract signing failed', details: error.message });
  }
});

/**
 * 🚦 4. HEALTH CHECK
 */
app.get('/health', (req, res) => {
  res.status(200).send('BIN Group Super App Backend: OPERATIONAL');
});

const PORT = process.env.PORT || 3000;
// 💰 FINANCE: Arabic VAT Invoices (Priority 1)
app.post('/api/finance/invoices', verifyAppCheck, verifyToken, requirePermission(PERMISSIONS.FINANCIAL_INVOICE_CREATE), async (req, res) => {
    try {
        const invoice = await InvoiceService.generateVATInvoice(req.body, req.user);
        res.json(invoice);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🚦 GOVERNANCE: Multi-level Approvals (Priority 4)
app.post('/api/governance/approvals/initiate', verifyAppCheck, verifyToken, requirePermission(PERMISSIONS.APPROVAL_INITIATE), async (req, res) => {
    try {
        const { entityType, entityId, amount } = req.body;
        const chain = await ApprovalService.initiateApproval(entityType, entityId, amount, req.user);
        res.json(chain);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/governance/approvals/:id/vote', verifyAppCheck, verifyToken, requirePermission(PERMISSIONS.APPROVAL_VOTE), async (req, res) => {
    try {
        const result = await ApprovalService.submitApproval(req.params.id, req.user);
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🛡️ CONTRACTS: Forensic Signature (Phase B)
app.post('/api/contracts/:id/sign', verifyAppCheck, verifyToken, requirePermission(PERMISSIONS.CONTRACT_SIGN), async (req, res) => {
    try {
        const metadata = {
            ip: req.ip || req.headers['x-forwarded-for'],
            userAgent: req.headers['user-agent'],
            kycRef: req.body.kycRef // Optional Link to KYC record
        };
        const result = await ContractService.signContract(req.params.id, req.user, metadata);
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/contracts/:id/supersede', verifyAppCheck, verifyToken, requirePermission(PERMISSIONS.CONTRACT_SUPERSEDE), async (req, res) => {
    try {
        const { newContractId } = req.body;
        const result = await ContractService.supersedeContract(req.params.id, newContractId, req.user);
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🌉 REGULATOR: Ejari / DLD Bridge (Phase C)
app.post('/api/ejari/register', verifyAppCheck, verifyToken, requirePermission(PERMISSIONS.EJARI_MANAGE), async (req, res) => {
    try {
        const { contractId } = req.body;
        const record = await EjariService.registerLease(contractId, req.user);
        res.json(record);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🆔 KYC: BIN-SECURE™ Identity Automation (Priority 3)
app.post('/api/kyc/verify', verifyAppCheck, verifyToken, requirePermission(PERMISSIONS.KYC_SUBMIT), async (req, res) => {
    try {
        const { fileUrl } = req.body;
        const result = await KYCService.processEmiratesID(fileUrl, req.user);
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/kyc/:id/status', verifyAppCheck, verifyToken, async (req, res) => {
    try {
        const status = await KYCService.getKYCStatus(req.params.id);
        res.json(status);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🏗️ QUOTES: Tower Quote Generator — Institutional Formula Engine
app.post('/api/quotes/tower', verifyAppCheck, verifyToken, requirePermission(PERMISSIONS.QUOTE_GENERATE), async (req, res) => {
    try {
        const result = await TowerQuoteService.generateQuote(req.body);
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🏭 VENDORS: Compliance Registry (Gap 1)
app.post('/api/vendors/:id/compliance', verifyAppCheck, verifyToken, requirePermission(PERMISSIONS.VENDOR_COMPLIANCE_MANAGE), async (req, res) => {
    try {
        const record = await VendorService.updateVendorCompliance(req.params.id, req.body, req.user);
        res.json(record);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
  console.log(`🚀 BIN Group Backend running on port ${PORT}`);
});
