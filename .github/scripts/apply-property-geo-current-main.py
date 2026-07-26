from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one marker, found {count}")
    return text.replace(old, new, 1)


def replace_regex(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected one regex match, found {count}")
    return updated

# Owner callable: canonical server geography only.
path = Path('functions/ownerMaintenanceOperations.ts')
text = path.read_text(encoding='utf-8')
text = replace_once(text,
    'import * as admin from "firebase-admin";\n',
    'import * as admin from "firebase-admin";\nimport { PropertyGeoAuthorityError, resolveDispatchReadyPropertyGeo } from "./propertyGeoAuthority";\n',
    'owner geo authority import')
text = replace_once(text,
    '{ cors: true, region: "europe-west3" },\n  async (request) => {\n    await assertOwnerRole(request.auth);',
    '{ cors: true, region: "europe-west3", enforceAppCheck: true },\n  async (request) => {\n    await assertOwnerRole(request.auth);',
    'owner App Check')
text = replace_once(text,
    '''    const sourceLocation = property.location || property.propertyLocation || property.geoPoint || property.geo || {};
    const lat = Number(sourceLocation.lat ?? sourceLocation.latitude);
    const lng = Number(sourceLocation.lng ?? sourceLocation.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
      throw new HttpsError("failed-precondition", "Verified property GPS coordinates are required before dispatch.");
    }
''',
    '''    let canonicalGeo;
    try {
      canonicalGeo = resolveDispatchReadyPropertyGeo(property);
    } catch (error) {
      throw error instanceof PropertyGeoAuthorityError
        ? new HttpsError("failed-precondition", error.message)
        : error;
    }
''',
    'owner canonical resolution')
text = replace_once(text,
    '''      jobLocation: {
        lat,
        lng,
        latitude: lat,
        longitude: lng,
        address: text(property.address || property.addressLine, 500),
        source: "SERVER_PROPERTY_RECORD",
      },''',
    '''      jobLocation: {
        lat: canonicalGeo.lat,
        lng: canonicalGeo.lng,
        latitude: canonicalGeo.lat,
        longitude: canonicalGeo.lng,
        address: canonicalGeo.address,
        source: "SERVER_VERIFIED_PROPERTY_GEO",
        verificationVersion: canonicalGeo.verificationVersion,
        verifiedBy: canonicalGeo.verifiedBy,
      },''',
    'owner canonical ticket snapshot')
path.write_text(text, encoding='utf-8')

# Callable supports the standard maintenance form without client coordinates.
path = Path('functions/tenantTicketOperations.ts')
text = path.read_text(encoding='utf-8')
text = replace_once(text,
    'const KINDS = new Set(["EMERGENCY", "SCHEDULED_SERVICE", "AI_CONCIERGE"]);',
    'const KINDS = new Set(["EMERGENCY", "SCHEDULED_SERVICE", "AI_CONCIERGE", "MAINTENANCE_REQUEST"]);',
    'tenant maintenance kind')
text = replace_once(text,
    '      if (kind === "AI_CONCIERGE") {\n        const priority = text(details.priority, 20).toLowerCase();',
    '      if (kind === "AI_CONCIERGE" || kind === "MAINTENANCE_REQUEST") {\n        const priority = text(details.priority, 20).toLowerCase();',
    'tenant maintenance handler')
text = replace_once(text,
    '''        if (!category || description.length < 8 || !PRIORITIES.has(priority) || details.photoEvidenceExpected !== true) {
          throw new HttpsError("invalid-argument", "AI maintenance tickets require category, priority, description, and photo evidence.");
        }
        Object.assign(common, {
''',
    '''        const photoEvidenceExpected = details.photoEvidenceExpected === true;
        if (
          !category ||
          description.length < 8 ||
          !PRIORITIES.has(priority) ||
          (kind === "AI_CONCIERGE" && !photoEvidenceExpected)
        ) {
          throw new HttpsError("invalid-argument", "Maintenance tickets require category, priority, description, and any declared photo evidence.");
        }
        Object.assign(common, {
''',
    'tenant maintenance validation')
text = replace_once(text,
    '''          photoEvidenceRequired: true,
          evidenceStatus: "PENDING_TENANT_UPLOAD",
          status: "OPEN",
          dispatchStatus: "PENDING_ASSIGNMENT",
          trackingStatus: "WAITING_FOR_TENANT_EVIDENCE",
''',
    '''          photoEvidenceRequired: photoEvidenceExpected,
          evidenceStatus: photoEvidenceExpected ? "PENDING_TENANT_UPLOAD" : "NOT_REQUIRED_AT_INTAKE",
          status: "OPEN",
          dispatchStatus: "PENDING_ASSIGNMENT",
          trackingStatus: photoEvidenceExpected ? "WAITING_FOR_TENANT_EVIDENCE" : "WAITING_FOR_TECHNICIAN",
''',
    'tenant evidence state')
path.write_text(text, encoding='utf-8')

# Future verification timestamps are not authoritative.
path = Path('functions/propertyGeoAuthority.ts')
text = path.read_text(encoding='utf-8')
text = replace_once(text,
    'export class PropertyGeoAuthorityError extends Error {\n  readonly code = "PROPERTY_GEO_NOT_VERIFIED";\n}\n',
    'export class PropertyGeoAuthorityError extends Error {\n  readonly code = "PROPERTY_GEO_NOT_VERIFIED";\n}\n\nconst MAX_FUTURE_VERIFICATION_SKEW_MS = 5 * 60 * 1000;\n',
    'server future skew constant')
text = replace_once(text,
    '''    geoVerifiedAtMs <= 0 ||
    geoVerifiedAtMs !== verificationAtMs
''',
    '''    geoVerifiedAtMs <= 0 ||
    geoVerifiedAtMs > Date.now() + MAX_FUTURE_VERIFICATION_SKEW_MS ||
    geoVerifiedAtMs !== verificationAtMs
''',
    'server future timestamp rejection')
path.write_text(text, encoding='utf-8')

path = Path('apps/admin-panel/src/lib/verifiedPropertyPin.ts')
text = path.read_text(encoding='utf-8')
text = replace_once(text,
    'export type VerifiedPropertyPin = {',
    'const MAX_FUTURE_VERIFICATION_SKEW_MS = 5 * 60 * 1000;\n\nexport type VerifiedPropertyPin = {',
    'map future skew constant')
text = replace_once(text,
    '''    verifiedAtMs <= 0 ||
    verifiedAtMs !== verificationAtMs ||
''',
    '''    verifiedAtMs <= 0 ||
    verifiedAtMs > Date.now() + MAX_FUTURE_VERIFICATION_SKEW_MS ||
    verifiedAtMs !== verificationAtMs ||
''',
    'map future timestamp rejection')
path.write_text(text, encoding='utf-8')

# Normal Tenant request uses the callable and returned deterministic ticket ID.
path = Path('src/tenant/pages/TenantRequestPage.tsx')
text = path.read_text(encoding='utf-8')
text = replace_once(text, "import React, { useState, useEffect } from 'react';", "import React, { useState, useEffect, useRef } from 'react';", 'tenant request React import')
text = replace_once(text,
    "import { db, storage, collection, addDoc, updateDoc, serverTimestamp, query, where, getDocs, doc, getDoc, ref, uploadBytes, getDownloadURL } from '../../lib/firebase';",
    "import { db, functions, httpsCallable, storage, collection, updateDoc, serverTimestamp, query, where, getDocs, doc, getDoc, ref, uploadBytes, getDownloadURL } from '../../lib/firebase';",
    'tenant request Firebase import')
text = replace_once(text,
    "    const [previews, setPreviews] = useState<string[]>([]);\n",
    "    const [previews, setPreviews] = useState<string[]>([]);\n    const requestIdRef = useRef(`maintenance_${Date.now()}_${Math.random().toString(36).slice(2)}`);\n",
    'tenant stable request id')
text = replace_regex(text,
    r"    const propertyLocationSource =.*?    const propertyGpsReady =.*?propertyLng !== 0;\n",
    "    const propertyContextReady =\n        residenceChecked &&\n        Boolean(unitData) &&\n        Boolean(propertyData);\n",
    'tenant browser geo derivation')
text = replace_once(text,
    "        if (photos.length === 0) {\n",
    "        if (description.trim().length < 8) {\n            alert('Please describe the issue in at least 8 characters.');\n            return;\n        }\n        if (photos.length === 0) {\n",
    'tenant description validation')
text = replace_regex(text,
    r"        const jobLocation = propertyGpsReady \? \{.*?            createdTicketId = docRef\.id;\n",
    '''        if (!unitData.propertyId) {
            alert('Property ID is missing. Cannot create request.');
            return;
        }

        setSubmitting(true);
        let createdTicketId = '';
        try {
            const createTicket = httpsCallable(functions, 'createTenantServiceTicket');
            const response: any = await createTicket({
                kind: 'MAINTENANCE_REQUEST',
                propertyId: unitData.propertyId,
                unitId: unitData.id,
                clientRequestId: requestIdRef.current,
                details: {
                    category,
                    priority,
                    description: description.trim(),
                    specificLocation: cleanLocation,
                    photoEvidenceExpected: true,
                },
            });
            createdTicketId = String(response?.data?.ticketId || '');
            if (!createdTicketId) throw new Error('Ticket service did not return a ticket ID.');
''',
    'tenant callable ticket creation')
text = text.replace('uploadPhotosToStorage(docRef.id)', 'uploadPhotosToStorage(createdTicketId)')
text = text.replace('notifyEmergency(docRef.id,', 'notifyEmergency(createdTicketId,')
text = text.replace('notifyTicketCreated(docRef.id,', 'notifyTicketCreated(createdTicketId,')
text = replace_regex(text,
    r"\n                        \{propertyContextReady && !propertyGpsReady && \(.*?\n                        \)\}\n",
    "\n",
    'tenant browser GPS warning')
text = text.replace(' || !propertyGpsReady || photos.length === 0', ' || photos.length === 0')
if "addDoc(collection(db, 'maintenanceTickets')" in text or 'const jobLocation =' in text:
    raise SystemExit('tenant request still contains direct ticket or browser location authority')
path.write_text(text, encoding='utf-8')

# Owner-app Tenant SOS uses the same canonical callable.
path = Path('apps/owner-app/src/pages/TenantSOSPage.tsx')
text = path.read_text(encoding='utf-8')
text = replace_once(text, "import React, { useState, useEffect } from 'react';", "import React, { useState, useEffect, useRef } from 'react';", 'SOS React import')
text = replace_once(text,
    "import { db, collection, addDoc, serverTimestamp, getDoc, doc, getDocs, query, where, updateDoc, onSnapshot, orderBy, limit, storage, ref, uploadBytes, getDownloadURL } from '../lib/firebase';",
    "import { db, functions, httpsCallable, collection, addDoc, serverTimestamp, getDoc, doc, getDocs, query, where, updateDoc, onSnapshot, orderBy, limit, storage, ref, uploadBytes, getDownloadURL } from '../lib/firebase';",
    'SOS Firebase import')
text = text.replace("import { buildGeoAnchor } from '../utils/geoAnchor';\n", '')
text = text.replace("import { logAuditAction } from '@bin/shared';\n", '')
text = replace_once(text,
    "    const [submitted, setSubmitted] = useState(false);\n",
    "    const [submitted, setSubmitted] = useState(false);\n    const requestIdRef = useRef(`sos_${Date.now()}_${Math.random().toString(36).slice(2)}`);\n",
    'SOS stable request id')
text = replace_regex(text,
    r"        try \{\n            let ticketGeo =.*?\n            setSubmitted\(true\);",
    '''        try {
            const priority = urgency === 'EMERGENCY' ? 'emergency' : urgency === 'HIGH' ? 'urgent' : 'normal';
            const createTicket = httpsCallable(functions, 'createTenantServiceTicket');
            const response: any = await createTicket({
                kind: 'MAINTENANCE_REQUEST',
                propertyId: unitData.propertyId,
                unitId: unitData.id,
                clientRequestId: requestIdRef.current,
                details: {
                    category,
                    priority,
                    description: [description, preferredTiming, permissionToEnter, isAnyoneHome, accessNotes, occupantNotes]
                        .filter(Boolean)
                        .join(' | '),
                    specificLocation: physicalAddress || unitData.unitNumber || category,
                    photoEvidenceExpected: false,
                },
            });
            const ticketId = String(response?.data?.ticketId || '');
            if (!ticketId) throw new Error('Ticket service did not return a ticket ID.');
            setSubmitted(true);''',
    'SOS callable ticket creation')
if "addDoc(collection(db, 'maintenanceTickets')" in text or 'ticketGeo' in text:
    raise SystemExit('SOS still contains direct ticket or fabricated geo authority')
path.write_text(text, encoding='utf-8')

# Admin map listens only to properties referenced by the active-ticket result.
path = Path('apps/admin-panel/src/pages/map/LiveMapPage.tsx')
text = path.read_text(encoding='utf-8')
text = replace_once(text,
    "import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';",
    "import { collection, documentId, limit, onSnapshot, query, where } from 'firebase/firestore';",
    'map documentId import')
text = replace_once(text,
    "  verifiedPinForTicket,\n",
    "  ticketPropertyId,\n  verifiedPinForTicket,\n",
    'map ticket property helper import')
text = replace_regex(text,
    r"    // This bounded canonical-property listener.*?    const propertyQuery = query\(collection\(db, 'properties'\), limit\(500\)\);\n",
    '',
    'map arbitrary property prefix')
text = replace_regex(text,
    r"\n    const unsubscribeProperties = onSnapshot\(propertyQuery,.*?\n    \}\);\n",
    '\n',
    'map broad property listener')
text = text.replace('      unsubscribeProperties();\n', '')
anchor = "\n  useEffect(() => {\n    let cancelled = false;\n    loadAdminGoogleMaps()"
property_effect = '''
  useEffect(() => {
    const propertyIds = [...new Set(tickets.map(ticketPropertyId).filter(Boolean))].sort();
    if (propertyIds.length === 0) {
      setProperties([]);
      setPropertiesError('');
      return undefined;
    }

    const chunks: string[][] = [];
    for (let index = 0; index < propertyIds.length; index += 10) chunks.push(propertyIds.slice(index, index + 10));
    const snapshots = new Map<number, any[]>();
    let listenerFailed = false;

    const publish = () => {
      if (listenerFailed || snapshots.size !== chunks.length) return;
      const byId = new Map<string, any>();
      for (let index = 0; index < chunks.length; index += 1) {
        for (const property of snapshots.get(index) || []) byId.set(String(property.id), property);
      }
      setProperties([...byId.values()].sort((left, right) => String(left.id).localeCompare(String(right.id))));
      setPropertiesError('');
    };

    const unsubscribes = chunks.map((ids, chunkIndex) => onSnapshot(
      query(collection(db, 'properties'), where(documentId(), 'in', ids)),
      (snapshot) => {
        if (listenerFailed) return;
        snapshots.set(chunkIndex, snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        publish();
      },
      (error) => {
        listenerFailed = true;
        console.error(`[AdminMap] Ticket-bound property listener ${chunkIndex + 1} failed:`, error);
        setProperties([]);
        setPropertiesError('Ticket-bound canonical property verification could not be loaded. Property markers are hidden until the source recovers.');
      },
    ));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [tickets]);
'''
if anchor not in text:
    raise SystemExit('map effect insertion anchor missing')
text = text.replace(anchor, property_effect + anchor, 1)
if "query(collection(db, 'properties'), limit(500))" in text:
    raise SystemExit('map still has unrelated property prefix')
path.write_text(text, encoding='utf-8')

# Tenant ticket creation is callable/Admin SDK only; browser remains evidence-update only.
path = Path('firestore.rules')
text = path.read_text(encoding='utf-8')
old_create = "      allow create: if isAdmin() || canCreateTenantBoundTicket(request.resource.data);"
if text.count(old_create) != 2:
    raise SystemExit(f'firestore tenant create gates: expected 2, found {text.count(old_create)}')
text = text.replace(old_create, "      allow create: if isAdmin();")
path.write_text(text, encoding='utf-8')

path = Path('scripts/apply-ticket-rule-binding.mjs')
text = path.read_text(encoding='utf-8')
text = replace_once(text,
    'const canonicalCreate = "      allow create: if isAdmin() || canCreateTenantBoundTicket(request.resource.data);";',
    'const canonicalCreate = "      allow create: if isAdmin();";',
    'ticket binding canonical create')
text = replace_once(text,
    'for (const legacyCreate of [\n',
    'for (const legacyCreate of [\n  "      allow create: if isAdmin() || canCreateTenantBoundTicket(request.resource.data);",\n',
    'ticket binding legacy callable gate')
text = text.replace('Ticket creation is not callable/admin or tenant-binding authoritative.', 'Ticket creation is not callable/Admin SDK authoritative.')
path.write_text(text, encoding='utf-8')

path = Path('scripts/verify-firestore-launch-hardening.mjs')
text = path.read_text(encoding='utf-8')
text = replace_once(text,
    "  ['tenant ticket create uses binding helper', 'allow create: if isAdmin() || canCreateTenantBoundTicket(request.resource.data);'],",
    "  ['tenant ticket creation is callable/Admin SDK only', 'allow create: if isAdmin();'],",
    'rules verifier create contract')
text = replace_once(text,
    "  ['tenant ticket create without unit/property validation', \"ownerDraftCreate(request.resource.data) || tenantOwns(request.resource.data);\"],\n",
    "  ['tenant ticket create without unit/property validation', \"ownerDraftCreate(request.resource.data) || tenantOwns(request.resource.data);\"],\n  ['direct Tenant ticket creation remains enabled', 'allow create: if isAdmin() || canCreateTenantBoundTicket(request.resource.data);'],\n",
    'rules verifier direct create ban')
path.write_text(text, encoding='utf-8')

# Emulator coverage: authenticated Tenant cannot create a ticket directly.
path = Path('test/property-geo-authority-rules.test.js')
text = path.read_text(encoding='utf-8')
insert = '''

  it('Tenant browser cannot create a maintenance ticket directly', async () => {
    const tenantDb = testEnv.authenticatedContext('tenant_geo', { role: 'tenant' }).firestore();
    await assertFails(setDoc(doc(tenantDb, 'maintenanceTickets/direct-browser-ticket'), {
      tenantId: 'tenant_geo',
      tenantUid: 'tenant_geo',
      requesterRole: 'tenant',
      unitId: 'unit-geo',
      propertyId: 'canonical',
      source: 'TENANT_PORTAL',
      status: 'OPEN',
      evidenceStatus: 'PENDING_TENANT_UPLOAD',
      assignedTechnicianId: null,
      technicianId: null,
      jobLocation: { lat: 24.2, lng: 55.3 },
    }));
  });
'''
text = replace_once(text, '\n});\n', insert + '\n});\n', 'rules test insertion')
path.write_text(text, encoding='utf-8')

# Executable/source launch contract.
Path('tests/launch/property-geo-current-main-authority.test.mjs').write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const read = (path) => readFileSync(path, 'utf8');
const helperSource = read('functions/propertyGeoAuthority.ts');
const transpiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const authority = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);

const verifiedProperty = (overrides = {}) => {
  const now = Date.now();
  return {
    address: 'Al Ain, UAE', emirate: 'Abu Dhabi', city: 'Al Ain', area: 'Central',
    geo: {
      lat: 24.222, lng: 55.333, address: 'Al Ain, UAE', emirate: 'Abu Dhabi', city: 'Al Ain', area: 'Central',
      source: 'admin_manual', verified: true, dispatchReady: true, requiresGeoReview: false,
      verifiedBy: 'founder', verifiedAt: now, verificationVersion: 1,
    },
    geoVerification: {
      state: 'VERIFIED', source: 'FOUNDER_MFA_REVIEW', verifiedBy: 'founder', verifiedAt: now, verificationVersion: 1,
    },
    ...overrides,
  };
};

test('dispatch authority rejects mismatched and future verification evidence', () => {
  assert.equal(authority.resolveDispatchReadyPropertyGeo(verifiedProperty()).verificationVersion, 1);
  assert.throws(() => authority.resolveDispatchReadyPropertyGeo(verifiedProperty({
    geoVerification: { state: 'VERIFIED', source: 'FOUNDER_MFA_REVIEW', verifiedBy: 'other', verifiedAt: Date.now(), verificationVersion: 1 },
  })), /canonical Founder-MFA verification/);
  const future = Date.now() + (10 * 60 * 1000);
  assert.throws(() => authority.resolveDispatchReadyPropertyGeo(verifiedProperty({
    geo: { ...verifiedProperty().geo, verifiedAt: future },
    geoVerification: { ...verifiedProperty().geoVerification, verifiedAt: future },
  })), /canonical Founder-MFA verification/);
});

test('Tenant intake surfaces use callable ticket creation and never submit coordinates', () => {
  for (const path of ['src/tenant/pages/TenantRequestPage.tsx', 'apps/owner-app/src/pages/TenantSOSPage.tsx']) {
    const source = read(path);
    assert.match(source, /httpsCallable\(functions, 'createTenantServiceTicket'\)/);
    assert.match(source, /kind: 'MAINTENANCE_REQUEST'/);
    assert.doesNotMatch(source, /addDoc\(collection\(db, 'maintenanceTickets'/);
    assert.doesNotMatch(source, /jobLocation\s*:/);
  }
});

test('Admin map loads only ticket-bound property IDs in deterministic chunks', () => {
  const source = read('apps/admin-panel/src/pages/map/LiveMapPage.tsx');
  assert.match(source, /tickets\.map\(ticketPropertyId\)/);
  assert.match(source, /where\(documentId\(\), 'in', ids\)/);
  assert.match(source, /index \+= 10/);
  assert.doesNotMatch(source, /query\(collection\(db, 'properties'\), limit\(500\)\)/);
});

test('Owner and Tenant callables share canonical property geography', () => {
  for (const path of ['functions/ownerMaintenanceOperations.ts', 'functions/tenantTicketOperations.ts']) {
    const source = read(path);
    assert.match(source, /resolveDispatchReadyPropertyGeo\(property\)/);
    assert.match(source, /SERVER_VERIFIED_PROPERTY_GEO/);
    assert.doesNotMatch(source, /property\.location \|\| property\.propertyLocation \|\| property\.geoPoint/);
  }
});

test('Firestore permits Tenant evidence updates but not Tenant ticket creation', () => {
  const rules = read('firestore.rules');
  const ticketBlocks = [...rules.matchAll(/match \/(?:tickets|maintenanceTickets)\/\{ticketId\} \{([\s\S]*?)\n    \}/g)].map((match) => match[1]);
  assert.equal(ticketBlocks.length, 2);
  for (const block of ticketBlocks) {
    assert.match(block, /allow create: if isAdmin\(\);/);
    assert.match(block, /allow update: if safeTicketUpdateByActor\(\);/);
  }
  assert.doesNotMatch(rules, /allow create: if isAdmin\(\) \|\| canCreateTenantBoundTicket/);
});
''', encoding='utf-8')

print('Applied current-main canonical property geography authority.')
