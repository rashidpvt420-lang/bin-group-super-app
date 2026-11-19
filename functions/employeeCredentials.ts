/**
 * Employee ID cards and employment contract DRAFTS for Admin-panel staff (Rashid, 18 Nov 2026).
 *
 *  - Generation: HR Manager tier (hr_admin / hr_manager) or the Founder (CEO / Super Admin), App Check,
 *    verified MFA session, and live (fresh) Auth claims. Nobody generates their own card or contract.
 *  - Contracts are drafts pending legal review and MOHRE registration. Nothing is registered, approved or
 *    signed by the system or by AI. Signing stays with the employee and an authorised human signatory.
 *  - PDFs are server-rendered into Storage (employee-documents/{uid}/...), which only the owner, HR and the
 *    Founder can read. Browsers get 5-minute signed URLs from these callables, never a write path.
 *  - Every generation, open and card verification is written to audit_logs.
 *  - The card QR holds only a random card id + the Admin-panel verify URL. Verifying needs a signed-in
 *    HR / Founder MFA session. No personal data is encoded in the QR.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getStorage } from "firebase-admin/storage";
import { createHash, randomUUID } from "node:crypto";
import { requirePrivilegedMfaSession } from "./adminMfaSession";
import { bidiText, getCairoFont, loadPdfKit } from "./pdfEngine";
import { drawVerificationQr } from "./companySeal";
import { isArabic } from "./arabicPdfText";
import {
  BLANK_FIELD_AR,
  BLANK_FIELD_EN,
  CONTRACT_DRAFT_BANNER_AR,
  CONTRACT_DRAFT_BANNER_EN,
  CONTRACT_ARABIC_PREVAILS_AR,
  CONTRACT_ARABIC_PREVAILS_EN,
  EMPLOYEE_BULK_GENERATION_LIMIT,
  EMPLOYEE_CARD_ID_PATTERN,
  EMPLOYEE_CARD_INDEX_PARENT_ID,
  EMPLOYEE_CARD_INDEX_SUBCOLLECTION,
  EMPLOYEE_COMPANY_IDENTITY,
  EMPLOYEE_CREDENTIALS_SUBCOLLECTION,
  EMPLOYEE_CREDENTIALS_SUMMARY_ID,
  EMPLOYEE_CREDENTIAL_ELIGIBLE_ROLES,
  EMPLOYEE_DOCUMENTS_SUBCOLLECTION,
  PRIVATE_HR_PROFILES_COLLECTION,
  employeeDocumentsStoragePrefix,
  EMPLOYEE_DOCUMENT_ID_PATTERN,
  EMPLOYMENT_CONTRACT_DRAFT_STATUS,
  EMPLOYMENT_CONTRACT_MOHRE_STATUS,
  EMPLOYMENT_CONTRACT_SIGNATURE_STATUS,
  type EmployeeDocumentType,
  type EmployeeIdentity,
  canGenerateEmployeeCredentials,
  dubaiDateKey,
  employeeCardExpiry,
  employeeCardVerifyUrl,
  employeeIdentityFrom,
  employmentContractClauses,
  employmentContractFields,
  isEligibleEmployeeRole,
  missingContractFieldKeys,
  normalizeRole,
  roleLabel,
  tokenRole,
} from "./employeeCredentialPolicy";

const SECURE_CALLABLE_OPTIONS = {
  region: "europe-west3",
  cors: true,
  enforceAppCheck: true,
  memory: "512MiB",
  timeoutSeconds: 300,
} as const;

const ensureDb = () => {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
};

const text = (value: unknown) => String(value ?? "").trim();
const SIGNED_URL_TTL_MS = 5 * 60 * 1000;
const PHOTO_MAX_BYTES = 3 * 1024 * 1024;
const PHOTO_PREFIXES = (uid: string) => [`employee-photos/${uid}/`, `staffDocuments/${uid}/`];

type Actor = { uid: string; role: string };

const employeeDocumentsRef = (db: FirebaseFirestore.Firestore, uid: string) =>
  db.collection(PRIVATE_HR_PROFILES_COLLECTION).doc(uid).collection(EMPLOYEE_DOCUMENTS_SUBCOLLECTION);
const employeeSummaryRef = (db: FirebaseFirestore.Firestore, uid: string) =>
  db.collection(PRIVATE_HR_PROFILES_COLLECTION).doc(uid).collection(EMPLOYEE_CREDENTIALS_SUBCOLLECTION).doc(EMPLOYEE_CREDENTIALS_SUMMARY_ID);
const employeeCardIndexRef = (db: FirebaseFirestore.Firestore, cardId: string) =>
  db.collection(PRIVATE_HR_PROFILES_COLLECTION).doc(EMPLOYEE_CARD_INDEX_PARENT_ID).collection(EMPLOYEE_CARD_INDEX_SUBCOLLECTION).doc(cardId);

/** HR manager tier / Founder + App Check (callable option) + MFA + fresh, non-suspended claims. */
async function requireEmployeeCredentialGenerator(request: any): Promise<Actor> {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in is required.");
  const token = (request.auth.token || {}) as Record<string, unknown>;
  if (!canGenerateEmployeeCredentials(token)) {
    throw new HttpsError("permission-denied", "Only HR Managers and the Founder can generate employee cards and contracts.");
  }
  await requirePrivilegedMfaSession(request.auth);
  const live = await admin.auth().getUser(String(request.auth.uid));
  const liveClaims = (live.customClaims || {}) as Record<string, unknown>;
  if (!canGenerateEmployeeCredentials(liveClaims)) {
    throw new HttpsError("permission-denied", "Your HR / Founder authority is no longer active. Sign in again.");
  }
  return { uid: String(request.auth.uid), role: tokenRole(liveClaims) || (liveClaims.ceo === true ? "ceo" : "super_admin") };
}

/** Owner self-service: active, non-suspended account. Founder/Admin claims also need MFA (N-05). */
async function requireActiveStaffSession(request: any): Promise<Actor> {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in is required.");
  const token = (request.auth.token || {}) as Record<string, unknown>;
  const role = tokenRole(token);
  const fullAdmin = token.admin === true || token.ceo === true || token.super_admin === true || token.superAdmin === true ||
    ["admin", "ceo", "super_admin"].includes(role);
  if (fullAdmin) await requirePrivilegedMfaSession(request.auth);
  const user = await admin.auth().getUser(String(request.auth.uid));
  if (user.disabled || token.suspended === true || user.customClaims?.suspended === true) {
    throw new HttpsError("permission-denied", "This staff account is disabled or suspended.");
  }
  return { uid: String(request.auth.uid), role };
}

function profileInactive(user: Record<string, any>) {
  const status = text(user.status).toUpperCase();
  return user.suspended === true || ["SUSPENDED", "OFFBOARDED", "DISABLED", "REJECTED"].includes(status);
}

function isInactive(user: Record<string, any>, authUser: admin.auth.UserRecord | null) {
  return Boolean(!authUser || authUser.disabled || authUser.customClaims?.suspended === true || profileInactive(user));
}

async function loadEligibleEmployee(db: FirebaseFirestore.Firestore, uid: string) {
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) throw new HttpsError("invalid-argument", "A valid staff UID is required.");
  const [userSnap, hrSnap, privateSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("hrProfiles").doc(uid).get(),
    db.collection("private_hr_profiles").doc(uid).get(),
  ]);
  if (!userSnap.exists) throw new HttpsError("not-found", "Staff profile was not found.");
  const user = userSnap.data() || {};
  const role = normalizeRole(user.role || user.userRole || user.primaryRole);
  if (!isEligibleEmployeeRole(role)) {
    throw new HttpsError("failed-precondition", "Cards and contracts are only for company staff with Admin-panel access.");
  }
  let authUser: admin.auth.UserRecord | null = null;
  try { authUser = await admin.auth().getUser(uid); } catch { authUser = null; }
  if (isInactive(user, authUser)) {
    throw new HttpsError("failed-precondition", "This staff account is inactive or suspended; no card or contract was generated.");
  }
  const identity = employeeIdentityFrom(uid, user, hrSnap.data() || {}, privateSnap.data() || {});
  const photoPath = text(hrSnap.data()?.photoStoragePath || user.photoStoragePath);
  return { identity, photoPath };
}

async function loadEmployeePhoto(uid: string, photoPath: string): Promise<Buffer | null> {
  if (!photoPath || photoPath.includes("..") || !PHOTO_PREFIXES(uid).some((prefix) => photoPath.startsWith(prefix))) return null;
  try {
    const file = getStorage().bucket().file(photoPath);
    const [metadata] = await file.getMetadata();
    const contentType = text(metadata.contentType).toLowerCase();
    if (!["image/jpeg", "image/png"].includes(contentType) || Number(metadata.size || 0) > PHOTO_MAX_BYTES) return null;
    const [buffer] = await file.download();
    return buffer;
  } catch {
    return null;
  }
}

function collectPdf(doc: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

const GOLD = "#B08D3C";
const INK = "#111827";
const MUTED = "#6B7280";
const DRAFT_RED = "#B91C1C";

export async function renderEmployeeCardPdf(args: {
  identity: EmployeeIdentity; cardId: string; documentId: string; issueDate: string; expiryDate: string; photo: Buffer | null;
}): Promise<Buffer> {
  const PDFDocument = await loadPdfKit();
  const font = await getCairoFont();
  // ISO/IEC 7810 ID-1 (CR80) card: 85.6 x 54 mm.
  const W = 242.65;
  const H = 153.07;
  const doc = new (PDFDocument as any)({ size: [W, H], margin: 0, info: { Title: `BIN GROUP Employee ID Card ${args.cardId}`, Author: EMPLOYEE_COMPANY_IDENTITY.tradeName } });
  const done = collectPdf(doc);
  doc.registerFont("Cairo", font);
  doc.font("Cairo");
  const write = (value: string, x: number, y: number, options: Record<string, any> = {}) => bidiText(doc, value, x, y, options);
  const { identity } = args;
  const role = roleLabel(identity.role);

  // Front
  doc.rect(0, 0, W, 30).fill(INK);
  doc.fillColor(GOLD).fontSize(10).text("BIN GROUP", 10, 6, { width: 120, lineBreak: false });
  doc.fillColor("#FFFFFF").fontSize(5.5).text("Employee ID Card", 10, 19, { width: 100, lineBreak: false });
  doc.fontSize(6.5);
  write("بطاقة موظف", 130, 7, { width: 102, align: "right" });
  doc.fontSize(5);
  write(EMPLOYEE_COMPANY_IDENTITY.tradeName, 110, 19, { width: 122, align: "right" });

  const photoX = 10; const photoY = 38; const photoW = 52; const photoH = 64;
  doc.lineWidth(0.6).strokeColor(GOLD).rect(photoX, photoY, photoW, photoH).stroke();
  if (args.photo) {
    try {
      doc.image(args.photo, photoX + 1, photoY + 1, { fit: [photoW - 2, photoH - 2], align: "center", valign: "center" });
    } catch {
      doc.fillColor(MUTED).fontSize(5).text("Photo not on file", photoX + 2, photoY + 26, { width: photoW - 4, align: "center" });
    }
  } else {
    doc.fillColor(MUTED).fontSize(5).text("Photo not on file", photoX + 2, photoY + 24, { width: photoW - 4, align: "center" });
    doc.fontSize(5);
    write("لا توجد صورة", photoX + 2, photoY + 32, { width: photoW - 4, align: "center" });
  }

  const tx = 70; const tw = W - tx - 10;
  doc.fillColor(INK).fontSize(8.5).text(identity.displayName || "Name not recorded", tx, 36, { width: tw, lineBreak: false, ellipsis: true });
  let y = 48;
  if (identity.displayNameAr) {
    doc.fontSize(7.5);
    write(identity.displayNameAr, tx, y, { width: tw, align: "right" });
    y += 11;
  }
  doc.fillColor(GOLD).fontSize(6.5).text(role.en, tx, y, { width: tw * 0.55, lineBreak: false, ellipsis: true });
  doc.fontSize(6.5);
  write(role.ar, tx + tw * 0.45, y, { width: tw * 0.55, align: "right" });
  y += 12;
  const rows: Array<[string, string, string]> = [
    ["Staff ID", "الرقم الوظيفي", identity.staffNumber ? `#${identity.staffNumber}` : (identity.staffId || "Not assigned")],
    ["Department", "القسم", identity.department || "Not recorded"],
    ["Issued", "تاريخ الإصدار", args.issueDate],
    ["Expires", "تاريخ الانتهاء", args.expiryDate],
  ];
  for (const [en, ar, value] of rows) {
    doc.fillColor(MUTED).fontSize(5).text(en, tx, y, { width: 40, lineBreak: false });
    doc.fillColor(INK).fontSize(6).text(value, tx + 40, y - 0.5, { width: tw - 80, lineBreak: false, ellipsis: true });
    doc.fillColor(MUTED).fontSize(5);
    write(ar, tx + tw - 40, y, { width: 40, align: "right" });
    y += 10;
  }
  doc.rect(0, H - 12, W, 12).fill(GOLD);
  doc.fillColor("#FFFFFF").fontSize(4.6).text(
    `Trade licence ${EMPLOYEE_COMPANY_IDENTITY.tradeLicenceNumber}, ${EMPLOYEE_COMPANY_IDENTITY.tradeLicenceEmirate}`,
    10, H - 9.5, { width: W - 20, lineBreak: false },
  );

  // Back
  doc.addPage({ size: [W, H], margin: 0 });
  doc.font("Cairo");
  doc.rect(0, 0, W, H).fill("#FFFFFF");
  drawVerificationQr(doc, employeeCardVerifyUrl(args.cardId), 12, 22, 78);
  doc.fillColor(MUTED).fontSize(4.4).text(args.cardId, 8, 104, { width: 90, align: "center", lineBreak: false });
  const bx = 104; const bw = W - bx - 10;
  doc.fillColor(INK).fontSize(5.8).text("Scan to verify. HR or Founder sign-in is required. The code holds only a card ID, no personal data.", bx, 16, { width: bw });
  doc.fontSize(6);
  write("امسح الرمز للتحقق. يتطلب تسجيل دخول الموارد البشرية أو المؤسس. يحتوي الرمز على رقم البطاقة فقط دون أي بيانات شخصية.", bx, doc.y + 3, { width: bw, align: "right" });
  doc.fillColor(INK).fontSize(5.4).text(`This card is the property of ${EMPLOYEE_COMPANY_IDENTITY.tradeName}. If found, please return it to BIN GROUP.`, bx, doc.y + 4, { width: bw });
  doc.fontSize(5.6);
  write("هذه البطاقة ملك للشركة. في حال العثور عليها يرجى إعادتها إلى مجموعة بن.", bx, doc.y + 2, { width: bw, align: "right" });
  doc.fillColor(MUTED).fontSize(4.4).text(
    `${EMPLOYEE_COMPANY_IDENTITY.legalEntityName} (${EMPLOYEE_COMPANY_IDENTITY.legalEntityNameNoteEn}). Trade licence ${EMPLOYEE_COMPANY_IDENTITY.tradeLicenceNumber}, ${EMPLOYEE_COMPANY_IDENTITY.tradeLicenceEmirate}. Company ID card only; not a government document.`,
    8, H - 26, { width: W - 16 },
  );
  doc.end();
  return done;
}

function ensureRoom(doc: any, needed: number) {
  if (doc.y + needed > doc.page.height - 70) doc.addPage();
}

export async function renderEmploymentContractDraftPdf(args: {
  identity: EmployeeIdentity; documentId: string; generatedAtIso: string; generatedOn: string;
}): Promise<{ buffer: Buffer; missingFields: string[] }> {
  const PDFDocument = await loadPdfKit();
  const font = await getCairoFont();
  const doc = new (PDFDocument as any)({ size: "A4", margins: { top: 60, bottom: 50, left: 50, right: 50 }, bufferPages: true, info: { Title: `DRAFT Employment Contract ${args.documentId}`, Author: EMPLOYEE_COMPANY_IDENTITY.tradeName } });
  const done = collectPdf(doc);
  doc.registerFont("Cairo", font);
  doc.font("Cairo");
  const left = 50;
  const width = doc.page.width - 100;
  const write = (value: string, x: number, y: number | null, options: Record<string, any> = {}) => bidiText(doc, value, x, y, options);
  const fields = employmentContractFields(args.identity);
  const missingFields = missingContractFieldKeys(fields);

  doc.fillColor(INK).fontSize(16).text("Employment Contract", left, 60, { width, align: "left" });
  doc.fontSize(16);
  write("عقد عمل", left, 60, { width, align: "right" });
  doc.fillColor(DRAFT_RED).fontSize(11).text("DRAFT", left, 84, { width, align: "left" });
  doc.fontSize(11);
  write("مسودة", left, 84, { width, align: "right" });

  // Draft banner
  const bannerY = 104;
  doc.fontSize(8.5);
  const bannerEnH = doc.heightOfString(CONTRACT_DRAFT_BANNER_EN, { width: width - 16 });
  const bannerH = bannerEnH + 40;
  doc.save().lineWidth(1).strokeColor(DRAFT_RED).fillColor("#FEF2F2").rect(left, bannerY, width, bannerH).fillAndStroke().restore();
  doc.fillColor(DRAFT_RED).fontSize(8.5).text(CONTRACT_DRAFT_BANNER_EN, left + 8, bannerY + 6, { width: width - 16 });
  doc.fontSize(8.5);
  write(CONTRACT_DRAFT_BANNER_AR, left + 8, doc.y + 4, { width: width - 16, align: "right" });
  doc.y = bannerY + bannerH + 12;

  // Parties
  doc.fillColor(INK).fontSize(10.5).text("Employer", left, doc.y, { width: width / 2 });
  doc.fontSize(10.5);
  write("صاحب العمل", left + width / 2, doc.y - doc.currentLineHeight(true), { width: width / 2, align: "right" });
  doc.fillColor(INK).fontSize(8.5).text(
    `${EMPLOYEE_COMPANY_IDENTITY.legalEntityName} (${EMPLOYEE_COMPANY_IDENTITY.legalEntityNameNoteEn}). Trade licence ${EMPLOYEE_COMPANY_IDENTITY.tradeLicenceNumber}, ${EMPLOYEE_COMPANY_IDENTITY.tradeLicenceEmirate}. ${EMPLOYEE_COMPANY_IDENTITY.vatTrnDisplayEn}.`,
    left, doc.y + 2, { width },
  );
  doc.fontSize(8.5);
  write(
    `${EMPLOYEE_COMPANY_IDENTITY.legalEntityNameNoteAr}. الرخصة التجارية رقم ${EMPLOYEE_COMPANY_IDENTITY.tradeLicenceNumber}، ${EMPLOYEE_COMPANY_IDENTITY.tradeLicenceEmirateAr}. ${EMPLOYEE_COMPANY_IDENTITY.vatTrnDisplayAr}.`,
    left, doc.y + 2, { width, align: "right" },
  );
  doc.moveDown(0.6);
  doc.fillColor(INK).fontSize(10.5).text("Employee", left, doc.y, { width: width / 2 });
  doc.fontSize(10.5);
  write("الموظف", left + width / 2, doc.y - doc.currentLineHeight(true), { width: width / 2, align: "right" });
  doc.moveDown(0.3);

  // Schedule table: English label | value | Arabic label
  const colEn = 150; const colAr = 150; const colVal = width - colEn - colAr;
  doc.fontSize(8);
  for (const field of fields) {
    const valueText = field.value || BLANK_FIELD_EN;
    doc.fontSize(8);
    const valueH = isArabic(valueText) ? 12 : doc.heightOfString(valueText, { width: colVal - 8 });
    const rowH = Math.max(16, valueH + 6) + (field.value ? 0 : 12);
    ensureRoom(doc, rowH + 4);
    const rowY = doc.y;
    doc.save().lineWidth(0.4).strokeColor("#E5E7EB").moveTo(left, rowY + rowH).lineTo(left + width, rowY + rowH).stroke().restore();
    doc.fillColor(MUTED).fontSize(8).text(field.labelEn, left, rowY + 3, { width: colEn - 6, lineBreak: false, ellipsis: true });
    doc.fillColor(field.value ? INK : DRAFT_RED).fontSize(8);
    if (isArabic(valueText)) write(valueText, left + colEn, rowY + 3, { width: colVal - 8, align: "left" });
    else doc.text(valueText, left + colEn, rowY + 3, { width: colVal - 8 });
    if (!field.value) {
      doc.fontSize(7.5);
      write(BLANK_FIELD_AR, left + colEn, rowY + rowH - 13, { width: colVal - 8, align: "left" });
    }
    doc.fillColor(MUTED).fontSize(8);
    write(field.labelAr, left + colEn + colVal, rowY + 3, { width: colAr, align: "right" });
    doc.y = rowY + rowH + 2;
  }
  doc.moveDown(0.8);

  // Clauses, English then Arabic for each.
  for (const clause of employmentContractClauses()) {
    doc.fontSize(8.5);
    const needed = doc.heightOfString(clause.bodyEn, { width }) * 2.2 + 40;
    ensureRoom(doc, Math.min(needed, 260));
    doc.fillColor(INK).fontSize(9.5).text(clause.titleEn, left, doc.y, { width });
    doc.fillColor(INK).fontSize(8.5).text(clause.bodyEn, left, doc.y + 1, { width });
    doc.moveDown(0.3);
    doc.fontSize(9.5);
    write(clause.titleAr, left, doc.y, { width, align: "right" });
    doc.fontSize(8.5);
    write(clause.bodyAr, left, doc.y + 1, { width, align: "right" });
    doc.moveDown(0.8);
  }

  // Signature blocks: blank. Signing is human only.
  ensureRoom(doc, 150);
  const sigY = doc.y + 6;
  const half = (width - 20) / 2;
  const sigBlock = (x: number, titleEn: string, titleAr: string, nameLine: string) => {
    doc.fillColor(INK).fontSize(9).text(titleEn, x, sigY, { width: half });
    doc.fontSize(9);
    write(titleAr, x, sigY + 13, { width: half, align: "right" });
    const lines: Array<[string, string]> = [["Name", "الاسم"], ["Signature", "التوقيع"], ["Date", "التاريخ"]];
    lines.forEach(([en, ar], index) => {
      const ly = sigY + 40 + index * 26;
      doc.save().lineWidth(0.6).strokeColor("#9CA3AF").moveTo(x + 60, ly + 10).lineTo(x + half - 50, ly + 10).stroke().restore();
      doc.fillColor(MUTED).fontSize(7.5).text(en, x, ly, { width: 56, lineBreak: false });
      doc.fontSize(7.5);
      write(ar, x + half - 46, ly, { width: 46, align: "right" });
      if (index === 0 && nameLine) doc.fillColor(INK).fontSize(7.5).text(nameLine, x + 62, ly - 1, { width: half - 116, lineBreak: false, ellipsis: true });
    });
  };
  sigBlock(left, "Employee", "الموظف", args.identity.displayName);
  sigBlock(left + half + 20, "For the employer (authorised signatory)", "عن صاحب العمل - المفوض بالتوقيع", "");
  doc.y = sigY + 130;
  doc.fillColor(MUTED).fontSize(7.5).text(CONTRACT_ARABIC_PREVAILS_EN, left, doc.y, { width });
  doc.fontSize(7.5);
  write(CONTRACT_ARABIC_PREVAILS_AR, left, doc.y + 1, { width, align: "right" });

  // Watermark + footer on every page.
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const pageW = doc.page.width; const pageH = doc.page.height;
    doc.save();
    doc.rotate(-35, { origin: [pageW / 2, pageH / 2] });
    doc.fillColor(DRAFT_RED).opacity(0.08).fontSize(90).text("DRAFT", 0, pageH / 2 - 60, { width: pageW, align: "center", lineBreak: false });
    doc.restore();
    doc.opacity(1);
    const footerY = pageH - 38;
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fillColor(MUTED).fontSize(6.5).text(
      `DRAFT - pending legal review and MOHRE registration | ${args.documentId} | Generated ${args.generatedAtIso} (UTC) from HR records | Page ${index - range.start + 1} of ${range.count}`,
      50, footerY, { width: pageW - 100, align: "center", lineBreak: false },
    );
    doc.fontSize(6.5);
    write("مسودة - بانتظار المراجعة القانونية والتسجيل لدى وزارة الموارد البشرية والتوطين", 50, footerY + 9, { width: pageW - 100, align: "center" });
    doc.page.margins.bottom = bottomMargin;
  }
  doc.end();
  return { buffer: await done, missingFields };
}

function newId(prefix: "empcard" | "empctr" | "card") {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

async function saveEmployeePdf(staffUid: string, documentId: string, documentType: EmployeeDocumentType, buffer: Buffer) {
  const sha256Hash = createHash("sha256").update(buffer).digest("hex");
  const storagePath = `${employeeDocumentsStoragePrefix(staffUid)}${documentId}.pdf`;
  const file = getStorage().bucket().file(storagePath);
  await file.save(buffer, {
    resumable: false,
    contentType: "application/pdf",
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: {
      cacheControl: "private, max-age=0, no-store",
      metadata: { documentId, documentType, staffUid, sha256Hash, canonicalSource: "SERVER_EMPLOYEE_CREDENTIALS" },
    },
  });
  const [metadata] = await file.getMetadata();
  const storageGeneration = text(metadata.generation);
  if (!storageGeneration) throw new HttpsError("internal", "Generated PDF is missing its Storage generation.");
  return { sha256Hash, storagePath, storageGeneration };
}

export async function generateEmployeeCredentialsFor(db: FirebaseFirestore.Firestore, actor: Actor, staffUid: string) {
  if (staffUid === actor.uid) {
    throw new HttpsError("failed-precondition", "You cannot generate your own card or contract. Another HR Manager or the Founder must do it.");
  }
  const { identity, photoPath } = await loadEligibleEmployee(db, staffUid);
  const photo = await loadEmployeePhoto(staffUid, photoPath);
  const now = new Date();
  const generatedAtIso = now.toISOString();
  const issueDate = dubaiDateKey(now);
  const expiryDate = employeeCardExpiry(issueDate, identity.contractEndDate);
  const cardId = newId("card");
  const cardDocumentId = newId("empcard");
  const contractDocumentId = newId("empctr");

  const cardBuffer = await renderEmployeeCardPdf({ identity, cardId, documentId: cardDocumentId, issueDate, expiryDate, photo });
  const contract = await renderEmploymentContractDraftPdf({ identity, documentId: contractDocumentId, generatedAtIso, generatedOn: issueDate });
  const cardFile = await saveEmployeePdf(staffUid, cardDocumentId, "EMPLOYEE_ID_CARD", cardBuffer);
  const contractFile = await saveEmployeePdf(staffUid, contractDocumentId, "EMPLOYMENT_CONTRACT_DRAFT", contract.buffer);
  const sourceRecordIds = [`users/${staffUid}`, `hrProfiles/${staffUid}`, `private_hr_profiles/${staffUid}`];
  const serverNow = admin.firestore.FieldValue.serverTimestamp();
  const role = roleLabel(identity.role);
  const credentialRef = employeeSummaryRef(db, staffUid);

  await db.runTransaction(async (tx) => {
    const previous = await tx.get(credentialRef);
    const previousCardDocumentId = text(previous.data()?.currentCardDocumentId);
    const previousCardId = text(previous.data()?.currentCardId);
    const previousContractDocumentId = text(previous.data()?.currentContractDocumentId);
    if (previousCardDocumentId) {
      tx.set(employeeDocumentsRef(db, staffUid).doc(previousCardDocumentId), { status: "SUPERSEDED", supersededBy: cardDocumentId, supersededAt: serverNow }, { merge: true });
    }
    if (previousCardId) {
      tx.set(employeeCardIndexRef(db, previousCardId), { status: "SUPERSEDED", supersededBy: cardId, supersededAt: serverNow }, { merge: true });
    }
    if (previousContractDocumentId) {
      tx.set(employeeDocumentsRef(db, staffUid).doc(previousContractDocumentId), { status: "SUPERSEDED_DRAFT", supersededBy: contractDocumentId, supersededAt: serverNow }, { merge: true });
    }
    const common = {
      staffUid,
      staffRole: identity.role,
      staffDisplayName: identity.displayName || null,
      generatedBy: actor.uid,
      generatedByRole: actor.role,
      generatedAt: serverNow,
      generatedAtIso,
      sourceRecordIds,
      canonicalSource: "SERVER_EMPLOYEE_CREDENTIALS",
      aiGenerated: false,
      aiApproved: false,
      version: 1,
    };
    tx.create(employeeDocumentsRef(db, staffUid).doc(cardDocumentId), {
      ...common,
      documentId: cardDocumentId,
      documentType: "EMPLOYEE_ID_CARD",
      status: "ACTIVE",
      cardId,
      issueDate,
      expiryDate,
      photoIncluded: Boolean(photo),
      staffIdAssigned: Boolean(identity.staffId),
      ...cardFile,
    });
    tx.create(employeeDocumentsRef(db, staffUid).doc(contractDocumentId), {
      ...common,
      documentId: contractDocumentId,
      documentType: "EMPLOYMENT_CONTRACT_DRAFT",
      status: EMPLOYMENT_CONTRACT_DRAFT_STATUS,
      legalReviewStatus: "PENDING_LEGAL_REVIEW",
      mohreRegistrationStatus: EMPLOYMENT_CONTRACT_MOHRE_STATUS,
      signatureStatus: EMPLOYMENT_CONTRACT_SIGNATURE_STATUS,
      approvalStatus: "NOT_APPROVED",
      arabicPrevails: true,
      missingFields: contract.missingFields,
      companyLegalEntityNameStatus: EMPLOYEE_COMPANY_IDENTITY.legalEntityNameStatus,
      companyVatTrnStatus: EMPLOYEE_COMPANY_IDENTITY.vatTrnStatus,
      ...contractFile,
    });
    tx.create(employeeCardIndexRef(db, cardId), {
      cardId, staffUid, documentId: cardDocumentId, issueDate, expiryDate, status: "ACTIVE", createdAt: serverNow,
    });
    tx.set(credentialRef, {
      staffUid,
      staffRole: identity.role,
      staffRoleLabel: role.en,
      staffDisplayName: identity.displayName || null,
      currentCardDocumentId: cardDocumentId,
      currentCardId: cardId,
      cardIssueDate: issueDate,
      cardExpiryDate: expiryDate,
      currentContractDocumentId: contractDocumentId,
      contractStatus: EMPLOYMENT_CONTRACT_DRAFT_STATUS,
      contractMissingFields: contract.missingFields,
      lastGeneratedBy: actor.uid,
      lastGeneratedByRole: actor.role,
      lastGeneratedAt: serverNow,
      generationCount: admin.firestore.FieldValue.increment(1),
    }, { merge: true });
    for (const [documentId, documentType, file] of [
      [cardDocumentId, "EMPLOYEE_ID_CARD", cardFile],
      [contractDocumentId, "EMPLOYMENT_CONTRACT_DRAFT", contractFile],
    ] as const) {
      tx.create(db.collection("audit_logs").doc(`employee_document_generated_${documentId}`), {
        action: documentType === "EMPLOYEE_ID_CARD" ? "EMPLOYEE_ID_CARD_GENERATED" : "EMPLOYMENT_CONTRACT_DRAFT_GENERATED",
        actorId: actor.uid,
        actorRole: actor.role,
        targetType: "employee_documents",
        targetId: documentId,
        staffUid,
        documentType,
        sha256Hash: file.sha256Hash,
        storagePath: file.storagePath,
        storageGeneration: file.storageGeneration,
        supersedes: documentType === "EMPLOYEE_ID_CARD" ? previousCardDocumentId || null : previousContractDocumentId || null,
        draftOnly: documentType === "EMPLOYMENT_CONTRACT_DRAFT",
        immutable: true,
        createdAt: serverNow,
      });
    }
  });

  return {
    staffUid,
    cardDocumentId,
    cardId,
    issueDate,
    expiryDate,
    contractDocumentId,
    contractStatus: EMPLOYMENT_CONTRACT_DRAFT_STATUS,
    missingFields: contract.missingFields,
    photoIncluded: Boolean(photo),
  };
}

function millis(value: any): number | null {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  return null;
}

async function listEligibleStaff(db: FirebaseFirestore.Firestore) {
  const snap = await db.collection("users").where("role", "in", [...EMPLOYEE_CREDENTIAL_ELIGIBLE_ROLES]).limit(400).get();
  return snap.docs
    .map((doc) => ({ uid: doc.id, data: doc.data() || {} }))
    .filter((row) => !profileInactive(row.data));
}

/** HR / Founder: every eligible staff member with card + contract status, and who is missing one. */
export const adminListEmployeeCredentials = onCall(SECURE_CALLABLE_OPTIONS, async (request) => {
  const actor = await requireEmployeeCredentialGenerator(request);
  const db = ensureDb();
  const staff = await listEligibleStaff(db);
  const credentialSnaps = staff.length
    ? await db.getAll(...staff.map((row) => employeeSummaryRef(db, row.uid)))
    : [];
  const byUid = new Map(credentialSnaps.map((snap) => [text(snap.ref.parent.parent?.id), snap.exists ? snap.data() || {} : null]));
  const today = dubaiDateKey();
  const rows = staff.map(({ uid, data }) => {
    const credential = byUid.get(uid) as Record<string, any> | null;
    const role = normalizeRole(data.role);
    const expiry = text(credential?.cardExpiryDate);
    const cardStatus = !credential?.currentCardDocumentId ? "MISSING" : expiry && expiry < today ? "EXPIRED" : "ACTIVE";
    return {
      uid,
      staffNumber: data.staffNumber ? String(data.staffNumber) : null,
      displayName: text(data.displayName || data.fullName) || "Staff",
      role,
      roleLabel: roleLabel(role),
      department: text(data.department) || null,
      isSelf: uid === actor.uid,
      cardStatus,
      cardDocumentId: credential?.currentCardDocumentId || null,
      cardIssueDate: credential?.cardIssueDate || null,
      cardExpiryDate: credential?.cardExpiryDate || null,
      contractStatus: credential?.currentContractDocumentId ? credential?.contractStatus || EMPLOYMENT_CONTRACT_DRAFT_STATUS : "MISSING",
      contractDocumentId: credential?.currentContractDocumentId || null,
      contractMissingFields: Array.isArray(credential?.contractMissingFields) ? credential?.contractMissingFields : [],
      lastGeneratedBy: credential?.lastGeneratedBy || null,
      lastGeneratedAtMs: millis(credential?.lastGeneratedAt),
      needsGeneration: cardStatus !== "ACTIVE" || !credential?.currentContractDocumentId,
    };
  }).sort((a, b) => Number(b.needsGeneration) - Number(a.needsGeneration) || a.displayName.localeCompare(b.displayName));
  return {
    staff: rows,
    missingCount: rows.filter((row) => row.needsGeneration).length,
    eligibleRoles: [...EMPLOYEE_CREDENTIAL_ELIGIBLE_ROLES],
    contractNotice: { en: CONTRACT_DRAFT_BANNER_EN, ar: CONTRACT_DRAFT_BANNER_AR, arabicPrevailsEn: CONTRACT_ARABIC_PREVAILS_EN, arabicPrevailsAr: CONTRACT_ARABIC_PREVAILS_AR },
  };
});

/** HR / Founder: generate (or re-issue) one staff member's card and contract draft. */
export const adminGenerateEmployeeCredentials = onCall(SECURE_CALLABLE_OPTIONS, async (request) => {
  const actor = await requireEmployeeCredentialGenerator(request);
  const staffUid = text(request.data?.staffUid);
  const result = await generateEmployeeCredentialsFor(ensureDb(), actor, staffUid);
  return { ok: true, ...result };
});

/** HR / Founder: generate for everyone who is missing a current card or contract draft (bounded batch). */
export const adminGenerateMissingEmployeeCredentials = onCall(SECURE_CALLABLE_OPTIONS, async (request) => {
  const actor = await requireEmployeeCredentialGenerator(request);
  const db = ensureDb();
  const staff = await listEligibleStaff(db);
  const credentialSnaps = staff.length
    ? await db.getAll(...staff.map((row) => employeeSummaryRef(db, row.uid)))
    : [];
  const today = dubaiDateKey();
  const missing = credentialSnaps
    .filter((snap) => {
      const data = snap.data() || {};
      return !snap.exists || !data.currentCardDocumentId || !data.currentContractDocumentId || text(data.cardExpiryDate) < today;
    })
    .map((snap) => text(snap.ref.parent.parent?.id))
    .filter((uid) => uid && uid !== actor.uid);
  const batch = missing.slice(0, EMPLOYEE_BULK_GENERATION_LIMIT);
  const generated: Array<Record<string, unknown>> = [];
  const failed: Array<{ staffUid: string; reason: string }> = [];
  for (const staffUid of batch) {
    try {
      generated.push(await generateEmployeeCredentialsFor(db, actor, staffUid));
    } catch (error: any) {
      failed.push({ staffUid, reason: text(error?.message).slice(0, 200) || "Generation failed." });
    }
  }
  return {
    ok: failed.length === 0,
    generatedCount: generated.length,
    generated,
    failed,
    remaining: Math.max(0, missing.length - batch.length),
    skippedSelf: staff.some((row) => row.uid === actor.uid),
  };
});

/** Owner (own documents) or HR / Founder (any): 5-minute signed URL to view or print the PDF. */
export const openEmployeeDocument = onCall(SECURE_CALLABLE_OPTIONS, async (request) => {
  const documentId = text(request.data?.documentId);
  if (!EMPLOYEE_DOCUMENT_ID_PATTERN.test(documentId)) throw new HttpsError("invalid-argument", "A valid document id is required.");
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in is required.");
  const requestedUid = text(request.data?.staffUid) || String(request.auth.uid);
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(requestedUid)) throw new HttpsError("invalid-argument", "A valid staff UID is required.");
  // Authorise before reading anything: the owner reads their own; anyone else must be HR / Founder with MFA.
  const actor: Actor = requestedUid === request.auth.uid
    ? await requireActiveStaffSession(request)
    : await requireEmployeeCredentialGenerator(request);
  const db = ensureDb();
  const snap = await employeeDocumentsRef(db, requestedUid).doc(documentId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Document not found.");
  const data = snap.data() || {};
  const staffUid = text(data.staffUid);
  if (staffUid !== requestedUid) throw new HttpsError("permission-denied", "Document does not belong to this staff member.");
  const storagePath = text(data.storagePath);
  if (!storagePath.startsWith(employeeDocumentsStoragePrefix(staffUid))) {
    throw new HttpsError("failed-precondition", "Document storage path is not canonical.");
  }
  const file = getStorage().bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError("not-found", "The document file is missing.");
  const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + SIGNED_URL_TTL_MS });
  await db.collection("audit_logs").add({
    action: "EMPLOYEE_DOCUMENT_OPENED",
    actorId: actor.uid,
    actorRole: actor.role || "staff",
    targetType: "employee_documents",
    targetId: documentId,
    staffUid,
    documentType: text(data.documentType),
    ownAccess: actor.uid === staffUid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true, documentId, documentType: text(data.documentType), status: text(data.status), expiresInSeconds: SIGNED_URL_TTL_MS / 1000, url };
});

/** The caller's own card and contract drafts (current and superseded), newest first. Never another uid. */
export const getMyEmployeeCredentials = onCall(SECURE_CALLABLE_OPTIONS, async (request) => {
  const actor = await requireActiveStaffSession(request);
  const snap = await employeeDocumentsRef(ensureDb(), actor.uid).limit(50).get();
  const documents = snap.docs
    .map((doc) => doc.data() || {})
    .filter((row) => text(row.staffUid) === actor.uid)
    .map((row) => ({
      documentId: text(row.documentId),
      documentType: text(row.documentType),
      status: text(row.status),
      issueDate: text(row.issueDate) || null,
      expiryDate: text(row.expiryDate) || null,
      generatedAtIso: text(row.generatedAtIso) || null,
    }))
    .sort((a, b) => String(b.generatedAtIso || "").localeCompare(String(a.generatedAtIso || "")));
  return { documents };
});

/** Authenticated card check behind the QR. HR / Founder MFA only; returns card status and printed fields only. */
export const verifyEmployeeCard = onCall(SECURE_CALLABLE_OPTIONS, async (request) => {
  const actor = await requireEmployeeCredentialGenerator(request);
  const cardId = text(request.data?.cardId);
  if (!EMPLOYEE_CARD_ID_PATTERN.test(cardId)) throw new HttpsError("invalid-argument", "A valid card id is required.");
  const db = ensureDb();
  const cardSnap = await employeeCardIndexRef(db, cardId).get();
  let result: Record<string, unknown> = { cardId, valid: false, status: "NOT_FOUND" };
  if (cardSnap.exists) {
    const card = cardSnap.data() || {};
    const staffUid = text(card.staffUid);
    const userSnap = await db.collection("users").doc(staffUid).get();
    const user = userSnap.data() || {};
    let authUser: admin.auth.UserRecord | null = null;
    try { authUser = await admin.auth().getUser(staffUid); } catch { authUser = null; }
    const today = dubaiDateKey();
    let status = text(card.status) || "ACTIVE";
    if (status === "ACTIVE" && text(card.expiryDate) < today) status = "EXPIRED";
    if (status === "ACTIVE" && (isInactive(user, authUser) || !isEligibleEmployeeRole(user.role))) status = "STAFF_INACTIVE";
    const role = normalizeRole(user.role);
    result = {
      cardId,
      valid: status === "ACTIVE",
      status,
      displayName: text(user.displayName || user.fullName) || null,
      role,
      roleLabel: roleLabel(role),
      department: text(user.department) || null,
      issueDate: text(card.issueDate) || null,
      expiryDate: text(card.expiryDate) || null,
    };
  }
  await db.collection("audit_logs").add({
    action: "EMPLOYEE_CARD_VERIFIED",
    actorId: actor.uid,
    actorRole: actor.role,
    targetType: "employee_card",
    targetId: cardId,
    outcome: result.status,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return result;
});

import type * as FirebaseFirestore from "firebase-admin/firestore";
