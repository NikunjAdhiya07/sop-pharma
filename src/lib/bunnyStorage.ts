/**
 * Bunny Storage Utility
 * 
 * Provides helper functions to interact with Bunny CDN/Storage
 * for serving SOP documents and videos.
 */

// Environment variables should be set in .env.local:
// BUNNY_STORAGE_ZONE_NAME - The storage zone name
// BUNNY_API_KEY - The API key for storage operations
// BUNNY_CDN_HOSTNAME - The CDN hostname (e.g., your-zone.b-cdn.net)
// BUNNY_STORAGE_HOSTNAME - Usually storage.bunnycdn.com

interface BunnyConfig {
  storageZone: string;
  apiKey: string;
  cdnHostname: string;
  storageHostname: string;
}

function getConfig(): BunnyConfig {
  const storageZone = process.env.BUNNY_STORAGE_ZONE_NAME || '';
  const apiKey = process.env.BUNNY_API_KEY || '';
  const cdnHostname = process.env.BUNNY_CDN_HOSTNAME || '';
  const storageHostname = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';

  if (!storageZone || !apiKey || !cdnHostname) {
    console.warn('[BunnyStorage] Missing Bunny configuration in environment variables');
  }

  return { storageZone, apiKey, cdnHostname, storageHostname };
}

/**
 * Construct a public CDN URL for a file stored in Bunny Storage.
 * @param filePath - The path within the storage zone (e.g., "sops/QAGE01-01/document.pdf")
 * @returns The full CDN URL
 */
export function getBunnyCdnUrl(filePath: string): string {
  const config = getConfig();
  
  if (!config.cdnHostname) {
    console.error('[BunnyStorage] CDN hostname not configured');
    return '';
  }

  // Remove leading slash if present
  const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  
  return `https://${config.cdnHostname}/${cleanPath}`;
}

/**
 * Check if a file path is a Bunny Storage path (starts with bunny:// or is a full bunny URL)
 */
export function isBunnyPath(filePath: string): boolean {
  const config = getConfig();
  return (
    filePath.startsWith('bunny://') ||
    filePath.includes(config.cdnHostname) ||
    filePath.includes('b-cdn.net')
  );
}

/**
 * Extract the storage path from a bunny:// URI or full URL
 */
export function extractBunnyPath(filePath: string): string {
  if (filePath.startsWith('bunny://')) {
    return filePath.replace('bunny://', '');
  }
  
  const config = getConfig();
  if (filePath.includes(config.cdnHostname)) {
    try {
      const url = new URL(filePath);
      return url.pathname.slice(1); // Remove leading slash
    } catch {
      return filePath;
    }
  }
  
  return filePath;
}

/**
 * Upload a file to Bunny Storage
 * @param fileBuffer - The file data as a Buffer
 * @param destinationPath - The path within the storage zone
 * @returns The CDN URL of the uploaded file, or null on failure
 */
export async function uploadToBunny(
  fileBuffer: Buffer,
  destinationPath: string
): Promise<string | null> {
  const config = getConfig();
  
  if (!config.storageZone || !config.apiKey) {
    console.error('[BunnyStorage] Storage zone or API key not configured');
    return null;
  }

  const cleanPath = destinationPath.startsWith('/') ? destinationPath.slice(1) : destinationPath;
  const uploadUrl = `https://${config.storageHostname}/${config.storageZone}/${cleanPath}`;

  try {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': config.apiKey,
        'Content-Type': 'application/octet-stream',
      },
      body: new Uint8Array(fileBuffer),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[BunnyStorage] Upload failed:', response.status, errorText);
      return null;
    }

    // Return the CDN URL
    return getBunnyCdnUrl(cleanPath);
  } catch (error) {
    console.error('[BunnyStorage] Upload error:', error);
    return null;
  }
}

/**
 * Delete a file from Bunny Storage
 * @param storagePath - The path within the storage zone
 * @returns true if successful, false otherwise
 */
export async function deleteFromBunny(storagePath: string): Promise<boolean> {
  const config = getConfig();
  
  if (!config.storageZone || !config.apiKey) {
    console.error('[BunnyStorage] Storage zone or API key not configured');
    return false;
  }

  const cleanPath = extractBunnyPath(storagePath);
  const deleteUrl = `https://${config.storageHostname}/${config.storageZone}/${cleanPath}`;

  try {
    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'AccessKey': config.apiKey,
      },
    });

    if (!response.ok) {
      console.error('[BunnyStorage] Delete failed:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[BunnyStorage] Delete error:', error);
    return false;
  }
}

/**
 * Check if a file exists in Bunny Storage (by making a HEAD request to CDN)
 * @param storagePath - The path within the storage zone
 * @returns true if file exists, false otherwise
 */
export async function checkBunnyFileExists(storagePath: string): Promise<boolean> {
  const cdnUrl = getBunnyCdnUrl(extractBunnyPath(storagePath));
  
  if (!cdnUrl) return false;

  try {
    const response = await fetch(cdnUrl, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Generate a destination path for SOP files in Bunny Storage
 * @param sopIdentifier - e.g., "QAGE01-01"
 * @param fileType - "document", "video", or "slide"
 * @param fileName - The original file name
 */
export function generateBunnyPath(
  sopIdentifier: string,
  fileType: 'document' | 'video' | 'slide',
  fileName: string
): string {
  const sanitizedId = sopIdentifier.replace(/[^a-zA-Z0-9-]/g, '_');
  const timestamp = Date.now();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  
  return `sop-files/${sanitizedId}/${fileType}s/${timestamp}-${sanitizedName}`;
}
