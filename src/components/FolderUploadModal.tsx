'use client';

import React, { useState, useRef } from 'react';
import { Upload, X, Loader2, CheckCircle, XCircle, FolderTree, FileText } from 'lucide-react';

interface UploadProgress {
  total: number;
  completed: number;
  failed: number;
  current: string;
  errors: Array<{ fileName: string; error: string }>;
  results: Array<{ fileName: string; sopId: string; sopIdentifier: string; extracted: any }>;
}

interface FolderUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function FolderUploadModal({ isOpen, onClose, onSuccess }: FolderUploadModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [skippedFiles, setSkippedFiles] = useState<Array<{ fileName: string; reason: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const items = Array.from(e.dataTransfer.items);
    await processFiles(items);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    if (!input.files) return;

    setIsUploading(true);
    setProgress({ total: 0, completed: 0, failed: 0, current: '', errors: [], results: [] });
    setSkippedFiles([]);

    const formData = new FormData();
    let totalFiles = 0;
    let filteredFiles = 0;
    const currentSkipped: Array<{ fileName: string; reason: string }> = [];

    console.log('🔍 Frontend: Processing selected files...');
    console.log(`Total files selected: ${input.files.length}`);

    // When using webkitdirectory, files have webkitRelativePath property
    for (const file of Array.from(input.files)) {
      // @ts-ignore - webkitRelativePath exists but not in types
      const relativePath = file.webkitRelativePath || file.name;
      totalFiles++;
      
      // Filter files on frontend before uploading
      // 1. Skip temporary files (starting with ~$)
      if (file.name.startsWith('~$')) {
        console.log(`❌ Skipping temporary file: ${file.name}`);
        continue;
      }
      
      // 2. Only process DOCX/DOC files
      const ext = file.name.toLowerCase().split('.').pop();
      if (ext !== 'docx' && ext !== 'doc') {
        console.log(`❌ Skipping non-DOCX file: ${file.name}`);
        continue;
      }
      
      // 3. Only process main SOP file (filename should match parent folder name)
      const pathParts = relativePath.split('/').filter((p: string) => p.length > 0);
      const parentFolderName = pathParts[pathParts.length - 2]; // Second to last is parent folder
      const fileNameWithoutExt = file.name.replace(/\.(docx|doc)$/i, '');
      
      // Improved Regex: Matches 2-6 letters, optional space/hyphen, 2-3 digits, hyphen, 2-3 digits
      // Examples: QA01-01, QAGE01-01, QAGE127-03, MAGE 01-01, MAGE-01-01
      const sopCodeRegex = /([A-Z]{2,6}[\s-]?\d{2,3}-\d{2,3})/i;

      // Extract SOP code from folder name and filename
      const folderSopCode = parentFolderName?.match(sopCodeRegex)?.[1];
      const fileSopCode = fileNameWithoutExt.match(sopCodeRegex)?.[1];
      
      console.log(`🔍 Checking: ${file.name}`);
      console.log(`   📁 Parent folder: "${parentFolderName}"`);
      console.log(`   📁 Folder SOP code: "${folderSopCode}"`);
      console.log(`   📄 File (no ext): "${fileNameWithoutExt}"`);
      console.log(`   📄 File SOP code: "${fileSopCode}"`);
      
      // Normalize codes for comparison (remove spaces/hyphens/underscores, uppercase)
      const normalizeCode = (code: string) => code.replace(/[\s\-_]/g, '').toUpperCase();
      
      // Check if file matches folder
      const isMainSOP = folderSopCode && fileSopCode && 
                        normalizeCode(folderSopCode) === normalizeCode(fileSopCode);
      
      if (!isMainSOP) {
        let reason = `Not a main SOP (Annexure/Reference)`;
        if (!folderSopCode) reason = `Could not extract SOP code from folder "${parentFolderName}"`;
        else if (!fileSopCode) reason = `Could not extract SOP code from file "${file.name}"`;
        else reason = `Mismatch: Folder=${folderSopCode} vs File=${fileSopCode}`;

        console.log(`❌ Skipping: ${file.name}. Reason: ${reason}`);
        currentSkipped.push({ fileName: file.name, reason });
        continue;
      }
      
      console.log(`✅ Including main SOP file: ${file.name}`);
      console.log(`   Path: ${relativePath}`);
      console.log(`   Size: ${file.size} bytes`);
      formData.append(`files[${relativePath}]`, file);
      filteredFiles++;
    }

    setSkippedFiles(currentSkipped);

    console.log(`\n📊 Frontend Filtering Summary:`);
    console.log(`   Total files in folder: ${totalFiles}`);
    console.log(`   Main SOP files to upload: ${filteredFiles}`);
    console.log(`   Filtered out: ${totalFiles - filteredFiles}`);
    console.log('✅ Frontend: Filtered files added to FormData, sending to server...');

    if (filteredFiles === 0) {
      alert('No valid SOP files found! Make sure your folder structure has main SOP DOCX files that match their folder names.');
      setIsUploading(false);
      return;
    }

    // Upload via API
    await uploadFiles(formData);
  };

  const processFiles = async (items: DataTransferItemList | any[]) => {
    setIsUploading(true);
    setProgress({ total: 0, completed: 0, failed: 0, current: '', errors: [], results: [] });
    setSkippedFiles([]);

    const formData = new FormData();
    const fileMap = new Map<string, File>();

    // Recursively traverse directory structure
    const traverseDirectory = async (entry: any, path: string = '') => {
      if (entry.isFile) {
        return new Promise<void>((resolve) => {
          entry.file((file: File) => {
            const relativePath = path ? `${path}/${file.name}` : file.name;
            fileMap.set(relativePath, file);
            resolve();
          });
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        return new Promise<void>((resolve) => {
          dirReader.readEntries(async (entries: any[]) => {
            for (const childEntry of entries) {
              await traverseDirectory(childEntry, path ? `${path}/${entry.name}` : entry.name);
            }
            resolve();
          });
        });
      }
    };

    // Process all items
    for (const item of items) {
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : item;
      if (entry) {
        await traverseDirectory(entry);
      }
    }

    console.log('🔍 Frontend: Processing dropped files...');
    console.log(`Total files found: ${fileMap.size}`);

    let filteredFiles = 0;
    const currentSkipped: Array<{ fileName: string; reason: string }> = [];

    // Filter and add files to FormData
    for (const [relativePath, file] of fileMap.entries()) {
      // Filter files on frontend before uploading
      // 1. Skip temporary files (starting with ~$)
      if (file.name.startsWith('~$')) {
        console.log(`❌ Skipping temporary file: ${file.name}`);
        currentSkipped.push({ fileName: file.name, reason: 'Temporary file' });
        continue;
      }
      
      // 2. Only process DOCX/DOC files
      const ext = file.name.toLowerCase().split('.').pop();
      if (ext !== 'docx' && ext !== 'doc') {
        console.log(`❌ Skipping non-DOCX file: ${file.name}`);
        currentSkipped.push({ fileName: file.name, reason: 'Not a DOCX file' });
        continue;
      }
      
      // 3. Only process main SOP file (filename should match parent folder name)
      const pathParts = relativePath.split('/').filter((p: string) => p.length > 0);
      const parentFolderName = pathParts[pathParts.length - 2]; // Second to last is parent folder
      const fileNameWithoutExt = file.name.replace(/\.(docx|doc)$/i, '');
      
      // Improved Regex: Matches 2-6 letters, optional space/hyphen, 2-3 digits, hyphen, 2-3 digits
      // Examples: QA01-01, QAGE01-01, QAGE127-03, MAGE 01-01, MAGE-01-01
      const sopCodeRegex = /([A-Z]{2,6}[\s-]?\d{2,3}-\d{2,3})/i;

      // Extract SOP code from folder name and filename
      const folderSopCode = parentFolderName?.match(sopCodeRegex)?.[1];
      const fileSopCode = fileNameWithoutExt.match(sopCodeRegex)?.[1];
      
      console.log(`🔍 Checking: ${file.name}`);
      console.log(`   📁 Parent folder: "${parentFolderName}"`);
      console.log(`   📁 Folder SOP code: "${folderSopCode}"`);
      console.log(`   📄 File (no ext): "${fileNameWithoutExt}"`);
      console.log(`   📄 File SOP code: "${fileSopCode}"`);
      
      // Normalize codes for comparison (remove spaces/hyphens/underscores, uppercase)
      const normalizeCode = (code: string) => code.replace(/[\s\-_]/g, '').toUpperCase();
      
      // Check if file matches folder
      const isMainSOP = folderSopCode && fileSopCode && 
                        normalizeCode(folderSopCode) === normalizeCode(fileSopCode);
      
      if (!isMainSOP) {
        let reason = `Not a main SOP (Annexure/Reference)`;
        if (!folderSopCode) reason = `Could not extract SOP code from folder "${parentFolderName}"`;
        else if (!fileSopCode) reason = `Could not extract SOP code from file "${file.name}"`;
        else reason = `Mismatch: Folder=${folderSopCode} vs File=${fileSopCode}`;

        console.log(`❌ Skipping: ${file.name}. Reason: ${reason}`);
        currentSkipped.push({ fileName: file.name, reason });
        continue;
      }
      
      console.log(`✅ Including main SOP file: ${file.name}`);
      formData.append(`files[${relativePath}]`, file);
      filteredFiles++;
    }

    setSkippedFiles(currentSkipped);

    console.log(`\n📊 Frontend Filtering Summary:`);
    console.log(`   Total files in folder: ${fileMap.size}`);
    console.log(`   Main SOP files to upload: ${filteredFiles}`);
    console.log(`   Filtered out: ${fileMap.size - filteredFiles}`);

    if (filteredFiles === 0) {
      alert('No valid SOP files found! Make sure your folder structure has main SOP DOCX files that match their folder names.');
      setIsUploading(false);
      return;
    }

    // Upload via API
    await uploadFiles(formData);
  };

  const uploadFiles = async (formData: FormData) => {
    try {
      const response = await fetch('/api/sop/bulk-folder-upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      // Read streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Process complete messages
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.substring(6));
            setProgress(data);
          }
        }
      }

      setIsComplete(true);
      setIsUploading(false);

    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (isComplete) {
      onSuccess();
    }
    setProgress(null);
    setIsComplete(false);
    setIsUploading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-purple-500/30 w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FolderTree className="h-6 w-6 text-purple-400" />
            <h2 className="text-2xl font-bold text-white">Upload SOP Folders</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-all"
            disabled={isUploading}
          >
            <X className="h-6 w-6 text-gray-300" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
          {!isUploading && !isComplete && (
            <>
              {/* Instructions */}
              <div className="mb-6 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                <h3 className="text-lg font-semibold text-blue-300 mb-2">📋 Instructions</h3>
                <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside">
                  <li>Upload folders containing department subfolders (QA, QC, MICROBIOLOGY, etc.)</li>
                  <li><strong>Only main SOP DOCX files will be uploaded</strong> (matching folder name)</li>
                  <li>Annexures, references, and temporary files will be automatically skipped</li>
                  <li>SOP IDs will be auto-extracted from filenames (e.g., QAGE01-10)</li>
                  <li>Dates and versions will be extracted from DOCX content</li>
                  <li>Folder structure will be preserved in the system</li>
                </ul>
              </div>

              {/* Drag & Drop Area */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
                  isDragging
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-gray-600 hover:border-purple-500/50 hover:bg-white/5'
                }`}
              >
                <Upload className="h-16 w-16 text-purple-400 mx-auto mb-4" />
                <p className="text-xl font-semibold text-white mb-2">
                  Drag & Drop Folders Here
                </p>
                <p className="text-gray-400 mb-4">or</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all"
                >
                  Browse Folders
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  // @ts-ignore - webkitdirectory is not in types but works
                  webkitdirectory=""
                  directory=""
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
            </>
          )}

          {/* Upload Progress */}
          {isUploading && progress && (
            <div className="space-y-4">
              {/* Progress Bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-300">
                    Processing: {progress.completed + progress.failed} / {progress.total}
                  </span>
                  <span className="text-sm text-gray-400">
                    {progress.total > 0 ? Math.round(((progress.completed + progress.failed) / progress.total) * 100) : 0}%
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-300"
                    style={{
                      width: `${progress.total > 0 ? ((progress.completed + progress.failed) / progress.total) * 100 : 0}%`
                    }}
                  />
                </div>
              </div>

              {/* Current File */}
              {progress.current && (
                <div className="bg-white/5 rounded-lg p-4 flex items-center gap-3">
                  <Loader2 className="h-5 w-5 text-purple-400 animate-spin" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">Processing...</p>
                    <p className="text-xs text-gray-400 truncate">{progress.current}</p>
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="h-5 w-5 text-green-400" />
                    <span className="text-sm font-semibold text-green-300">Completed</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{progress.completed}</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle className="h-5 w-5 text-red-400" />
                    <span className="text-sm font-semibold text-red-300">Failed</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{progress.failed}</p>
                </div>
              </div>

              {/* Errors */}
              {progress.errors.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 max-h-48 overflow-y-auto">
                  <h4 className="text-sm font-semibold text-red-300 mb-2">Errors:</h4>
                  <div className="space-y-2">
                    {progress.errors.map((err, idx) => (
                      <div key={idx} className="text-xs text-gray-300">
                        <span className="font-semibold">{err.fileName}:</span> {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Success Summary */}
          {isComplete && progress && (
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 text-center">
                <CheckCircle className="h-16 w-16 text-green-400 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-white mb-2">Upload Complete!</h3>
                <p className="text-gray-300">
                  Successfully processed {progress.completed} out of {progress.total} files
                </p>
              </div>

               {/* Failed Files - Added per user request */}
              {progress.errors.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 max-h-48 overflow-y-auto">
                  <div className="flex items-center gap-2 mb-2">
                     <XCircle className="h-4 w-4 text-red-400" />
                     <h4 className="text-sm font-semibold text-red-300">Failed to Upload ({progress.errors.length}):</h4>
                  </div>
                  <div className="space-y-2">
                    {progress.errors.map((err, idx) => (
                      <div key={idx} className="text-xs text-gray-300 flex justify-between">
                        <span className="font-semibold">{err.fileName}</span>
                        <span className="text-red-400">{err.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skipped Files - Added per user request */}
              {skippedFiles.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 max-h-48 overflow-y-auto">
                   <div className="flex items-center gap-2 mb-2">
                     <FileText className="h-4 w-4 text-yellow-400" />
                     <h4 className="text-sm font-semibold text-yellow-300">Skipped Files ({skippedFiles.length}):</h4>
                  </div>
                  <div className="space-y-1">
                    {skippedFiles.map((file, idx) => (
                      <div key={idx} className="text-xs text-gray-400 flex justify-between">
                        <span>{file.fileName}</span>
                        <span className="text-yellow-500/70 italic">{file.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Results Summary */}
              <div className="bg-white/5 rounded-lg p-4 max-h-96 overflow-y-auto">
                <h4 className="text-sm font-semibold text-white mb-3">Uploaded SOPs:</h4>
                <div className="space-y-2">
                  {progress.results.map((result, idx) => (
                    <div key={idx} className="bg-white/5 rounded p-3 text-xs">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-4 w-4 text-purple-400" />
                        <span className="font-semibold text-white">{result.sopIdentifier}</span>
                      </div>
                      <p className="text-gray-400 truncate">{result.fileName}</p>
                      {result.extracted && (
                        <div className="mt-2 text-gray-500 space-y-1">
                          {result.extracted.version && <p>Version: {result.extracted.version}</p>}
                          {result.extracted.effectiveDate && (
                            <p>Effective: {new Date(result.extracted.effectiveDate).toLocaleDateString()}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleClose}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
