import { ISOPLibrary } from '@/models/SOPLibrary';

// Department mapping - maps short codes to full department names
export const DEPARTMENT_MAP: Record<string, string> = {
  'QAGE': 'QA General',
  'QAIC': 'QC - Instrument Calibration',
  'QCMI': 'QC - Microbiology',
  'QCCH': 'QC - Chemistry',
  'QCPH': 'QC - Physical Testing',
  'PROD': 'Production',
  'WARE': 'Warehouse',
  'ENGG': 'Engineering',
  'MAIN': 'Maintenance',
  'SAFE': 'Safety',
  'HR': 'Human Resources',
  'IT': 'Information Technology',
};

/**
 * Extracts department code and full name from SOP identifier
 * @param identifier - SOP identifier (e.g., "QAGE-04", "QAIC28-04")
 * @returns Object with departmentCode and departmentName
 */
export function extractDepartmentFromIdentifier(identifier: string): {
  departmentCode: string;
  departmentName: string;
} {
  // Remove any numbers and hyphens to get the base code
  const match = identifier.match(/^([A-Z]+)/);
  
  if (!match) {
    return {
      departmentCode: 'GENERAL',
      departmentName: 'General',
    };
  }
  
  const code = match[1];
  
  // Try to find exact match first
  if (DEPARTMENT_MAP[code]) {
    return {
      departmentCode: code,
      departmentName: DEPARTMENT_MAP[code],
    };
  }
  
  // Try to find partial match (e.g., QAIC from QAIC28)
  for (const [key, value] of Object.entries(DEPARTMENT_MAP)) {
    if (code.startsWith(key)) {
      return {
        departmentCode: key,
        departmentName: value,
      };
    }
  }
  
  // Default to the extracted code
  return {
    departmentCode: code,
    departmentName: code,
  };
}

/**
 * Calculates completion percentage for an SOP Library entry
 * @param sopLibrary - SOP Library document
 * @returns Completion percentage (0-100)
 */
export function calculateCompletionStatus(sopLibrary: ISOPLibrary): number {
  let completed = 0;
  const total = 3; // Videos, Slides, MCQs (SOP doc is optional)
  
  if (sopLibrary.videos.length > 0) completed++;
  if (sopLibrary.slides.length > 0) completed++;
  if (sopLibrary.mcqBankId) completed++;
  
  return Math.round((completed / total) * 100);
}

/**
 * Organizes SOP Library entries by department
 * @param sopLibraries - Array of SOP Library documents
 * @returns Object with departments as keys and arrays of SOPs as values
 */
export function organizeFolderStructure(sopLibraries: ISOPLibrary[]): Record<string, ISOPLibrary[]> {
  const organized: Record<string, ISOPLibrary[]> = {};
  
  sopLibraries.forEach(sop => {
    if (!organized[sop.department]) {
      organized[sop.department] = [];
    }
    organized[sop.department].push(sop);
  });
  
  // Sort SOPs within each department by identifier
  Object.keys(organized).forEach(dept => {
    organized[dept].sort((a, b) => a.sopIdentifier.localeCompare(b.sopIdentifier));
  });
  
  return organized;
}

/**
 * Validates file type against allowed types
 * @param fileName - Name of the file
 * @param allowedTypes - Array of allowed extensions (e.g., ['mp4', 'webm'])
 * @returns True if valid, false otherwise
 */
export function validateFileType(fileName: string, allowedTypes: string[]): boolean {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension ? allowedTypes.includes(extension) : false;
}

/**
 * Generates organized file path for SOP resources
 * @param sopIdentifier - SOP identifier
 * @param fileType - Type of file ('video', 'slide', 'document')
 * @param fileName - Original file name
 * @returns Organized file path
 */
export function generateFilePath(
  sopIdentifier: string,
  departmentCode: string,
  fileType: 'video' | 'slide' | 'document',
  fileName: string
): string {
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  
  return `uploads/sop-library/${departmentCode}/${sopIdentifier}/${fileType}s/${timestamp}_${sanitizedFileName}`;
}

/**
 * Gets allowed file extensions for each file type
 * @param fileType - Type of file
 * @returns Array of allowed extensions
 */
export function getAllowedExtensions(fileType: 'video' | 'slide' | 'document'): string[] {
  switch (fileType) {
    case 'video':
      return ['mp4', 'webm', 'mov', 'avi'];
    case 'slide':
      return ['pdf', 'ppt', 'pptx'];
    case 'document':
      return ['pdf', 'docx', 'doc'];
    default:
      return [];
  }
}

/**
 * Formats file size to human-readable format
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "2.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Gets resource status message for missing items
 * @param resourceType - Type of resource
 * @param hasResource - Whether the resource exists
 * @returns Status message or null
 */
export function getResourceStatusMessage(
  resourceType: 'video' | 'slide' | 'mcq' | 'document',
  hasResource: boolean
): string | null {
  if (hasResource) return null;
  
  switch (resourceType) {
    case 'video':
      return '📌 Training video will be uploaded soon';
    case 'slide':
      return '📌 Slides coming soon';
    case 'mcq':
      return '📌 MCQs not available yet';
    case 'document':
      return null; // SOP doc is optional
    default:
      return null;
  }
}
