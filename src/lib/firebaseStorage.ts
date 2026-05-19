/**
 * Firebase Storage utilities for BIN GROUP onboarding
 * Handles document uploads with retry, progress tracking, and metadata
 */

import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import type { UploadMetadata } from 'firebase/storage';
import { storage } from './firebase';

export interface UploadOptions {
    maxRetries?: number;
    onProgress?: (progress: number) => void;
    metadata?: UploadMetadata;
}

export interface UploadResult {
    path: string;
    downloadUrl: string;
    size: number;
    uploadedAt: string;
}

/**
 * Upload a file to Firebase Storage with retry logic
 */
export async function uploadFileToStorage(
    filePath: string,
    file: File,
    options: UploadOptions = {}
): Promise<UploadResult> {
    const { maxRetries = 3, onProgress, metadata } = options;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[STORAGE] Upload attempt ${attempt}/${maxRetries}: ${filePath}`);
            
            const fileRef = ref(storage, filePath);
            const customMetadata: UploadMetadata = {
                customMetadata: {
                    uploadedAt: new Date().toISOString(),
                    originalName: file.name,
                    fileSize: file.size.toString(),
                    fileType: file.type,
                    ...metadata?.customMetadata
                }
            };

            // Upload file
            const snapshot = await uploadBytes(fileRef, file, customMetadata);
            
            if (onProgress) onProgress(100);

            // Get download URL
            const downloadUrl = await getDownloadURL(fileRef);

            console.log(`✅ [STORAGE] Upload successful: ${downloadUrl}`);
            return {
                path: filePath,
                downloadUrl,
                size: snapshot.metadata.size,
                uploadedAt: new Date().toISOString()
            };
        } catch (error: any) {
            lastError = error;
            console.error(`❌ [STORAGE] Upload failed (attempt ${attempt}):`, error.message);
            
            if (attempt < maxRetries) {
                // Exponential backoff: 1s, 2s, 4s
                const backoffMs = 1000 * Math.pow(2, attempt - 1);
                console.log(`[STORAGE] Retrying in ${backoffMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
        }
    }

    throw new Error(`Upload failed after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Upload multiple files in parallel
 */
export async function uploadFilesInParallel(
    uploads: Array<{ path: string; file: File; options?: UploadOptions }>
): Promise<UploadResult[]> {
    const promises = uploads.map(({ path, file, options }) => 
        uploadFileToStorage(path, file, options)
    );
    return Promise.all(promises);
}

/**
 * Delete a file from Firebase Storage
 */
export async function deleteFileFromStorage(filePath: string): Promise<void> {
    try {
        const fileRef = ref(storage, filePath);
        await deleteObject(fileRef);
        console.log(`✅ [STORAGE] File deleted: ${filePath}`);
    } catch (error: any) {
        console.error(`❌ [STORAGE] Delete failed: ${error.message}`);
        throw error;
    }
}

/**
 * Generate a signed download URL (valid for 7 days by default)
 */
export async function getSignedUrl(filePath: string): Promise<string> {
    try {
        const fileRef = ref(storage, filePath);
        const url = await getDownloadURL(fileRef);
        return url;
    } catch (error: any) {
        console.error(`❌ [STORAGE] Failed to get signed URL:`, error.message);
        throw error;
    }
}

