import { VertexAI } from '@google-cloud/vertexai';
import { validateStorageUrl, MAX_FILE_BYTES, ALLOWED_MIME_TYPES } from './ocrSecurityGuards';

/**
 * Institutional Title Deed OCR Engine
 * Extracts structured data from UAE Title Deeds with confidence scoring.
 *
 * Security model:
 *  - Caller (processTitleDeedOCR in index.ts) is responsible for auth, role,
 *    and per-object ownership checks via ocrSecurityGuards.ts.
 *  - This module enforces: Storage-origin allow-list, MIME allow-list,
 *    file size cap, and no arbitrary URL fetching.
 *  - No tools, functionDeclarations, or toolConfig are used.
 */
export async function extractTitleDeedData(fileUrl: string): Promise<unknown> {
    // ── Security: validate URL origin before any network call ──────────────
    validateStorageUrl(fileUrl);

    // 1. Initialize Vertex AI
    const vertexAI = new VertexAI({
        project: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'UNKNOWN_PROJECT',
        location: 'us-central1',
    });
    const generativeModel = vertexAI.getGenerativeModel({
        model: 'gemini-1.5-flash-001',
        // Explicitly: no tools, no functionDeclarations, no toolConfig
    });

    // 2. Prompt Engineering for UAE Title Deeds
    const prompt = `
        You are an expert UAE Real Estate Document Analyst.
        Extract the following fields from this UAE Title Deed.
        Return ONLY valid JSON. If a field is missing, return null.

        Expected JSON Structure:
        {
            "emirate": "Dubai | Abu Dhabi | Sharjah | ...",
            "titleDeedNumber": "string",
            "ownerName": "string",
            "propertyType": "Apartment | Villa | ...",
            "area": "string",
            "sqft": number,
            "sqm": number,
            "issueDate": "ISO Date string",
            "confidenceScore": number (0-1)
        }
    `;

    try {
        // ── Security: fetch with size cap ─────────────────────────────────
        const fileResponse = await fetch(fileUrl);
        if (!fileResponse.ok) {
            throw new Error(`Storage fetch failed: ${fileResponse.status}`);
        }

        // Enforce file size limit before reading body
        const contentLength = fileResponse.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > MAX_FILE_BYTES) {
            throw new Error(`File exceeds maximum allowed size of ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
        }

        // Stream with size cap to prevent memory exhaustion
        const reader = fileResponse.body?.getReader();
        if (!reader) throw new Error('Could not read file stream.');
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                totalBytes += value.byteLength;
                if (totalBytes > MAX_FILE_BYTES) {
                    await reader.cancel();
                    throw new Error(`File exceeds maximum allowed size of ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
                }
                chunks.push(value);
            }
        }
        const buffer = Buffer.concat(chunks);
        const base64 = buffer.toString('base64');

        // ── Security: MIME allow-list ─────────────────────────────────────
        const rawMime = (fileResponse.headers.get('content-type') || 'application/pdf')
            .split(';')[0].trim().toLowerCase();
        if (!ALLOWED_MIME_TYPES.has(rawMime)) {
            throw new Error(`Unsupported MIME type: ${rawMime}. Allowed: PDF, JPEG, PNG, WebP, TIFF.`);
        }
        const mimeType = rawMime;

        const request = {
            contents: [{
                role: 'user',
                parts: [
                    { text: prompt },
                    { inlineData: { data: base64, mimeType } },
                ],
            }],
            // No tools, functionDeclarations, or toolConfig
        };

        const result = await generativeModel.generateContent(request);
        const response = result.response;
        const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

        // Clean markdown backticks if present
        const jsonText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonText);
    } catch (err) {
        // Log error details server-side only — do not surface internal paths to caller
        console.error('OCR Extraction Fault:', err instanceof Error ? err.message : 'Unknown error');
        throw new Error('Institutional OCR Node Unavailable.');
    }
}
