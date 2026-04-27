import { VertexAI } from '@google-cloud/vertexai';

/**
 * Institutional Title Deed OCR Engine
 * Extracts structured data from UAE Title Deeds with confidence scoring.
 */
export async function extractTitleDeedData(fileUrl: string) {
    // 1. Initialize Vertex AI
    const vertexAI = new VertexAI({ project: 'bin-group-57c60', location: 'us-central1' });
    const generativeModel = vertexAI.getGenerativeModel({
        model: 'gemini-1.5-flash-001',
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
        const fileResponse = await fetch(fileUrl);
        const buffer = await fileResponse.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');

        const request = {
            contents: [{ 
                role: 'user', 
                parts: [
                    { text: prompt },
                    { inlineData: { data: base64, mimeType: 'application/pdf' } }
                ] 
            }],
        };

        const result = await generativeModel.generateContent(request);
        const response = result.response;
        const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        
        // Clean markdown backticks if present
        const jsonText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonText);
    } catch (err) {
        console.error("OCR Extraction Fault:", err);
        throw new Error("Institutional OCR Node Unavailable.");
    }
}
