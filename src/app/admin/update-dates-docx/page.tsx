'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';

import { useState } from 'react';
import { Upload, Loader2, CheckCircle, AlertCircle, FileText, Calendar } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

interface ProcessedFile {
  fileName: string;
  sopIdentifier: string;
  extractedDates: {
    effectiveDate?: string;
    reviewDate?: string;
    expiryDate?: string;
    version?: string;
  };
  foundDates?: string[]; // List of which dates were found
  status: 'success' | 'error' | 'not_found';
  message: string;
}

export default function UpdateDatesFromDOCXPage() {
  useAuthGuard({ allowedRoles: ['admin', 'qa-head'] });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<ProcessedFile[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
      setResults([]);
      setProcessing(false);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setProcessing(true);
    setResults([]);

    const formData = new FormData();
    selectedFiles.forEach((file) => {
      formData.append('files', file);
    });

    try {
      const response = await fetch('/api/sop-monitoring/update-dates-from-docx', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setResults(data.results);
        console.log('✅ Processing complete:', data.summary);
      } else {
        alert('Error: ' + data.error);
      }
    } catch (error) {
      console.error('Error processing files:', error);
      alert('Failed to process files');
    } finally {
      setProcessing(false);
    }
  };

  const successCount = results.filter((r) => r.status === 'success').length;
  const notFoundCount = results.filter((r) => r.status === 'not_found').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  const [selectedFilter, setSelectedFilter] = useState<'all' | 'success' | 'not_found' | 'error'>('all');

  const filteredResults = selectedFilter === 'all' 
    ? results 
    : results.filter(r => r.status === selectedFilter);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            📅 Update SOP Dates from DOCX
          </h1>
          <p className="text-gray-300">
            Upload DOCX files to automatically extract and update SOP dates
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-blue-300 mb-3 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            How it works
          </h2>
          <ul className="space-y-2 text-gray-300">
            <li className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
              <span>Select multiple DOCX files (use Ctrl+Click to select many files)</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
              <span>System extracts dates from headers and tables automatically</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
              <span>Updates existing SOPs without affecting MCQs or other data</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
              <span>View detailed logs of what was found and updated</span>
            </li>
          </ul>
        </div>

        {/* File Upload */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-8 mb-8">
          <div className="border-2 border-dashed border-slate-600 rounded-lg p-12 text-center">
            <Upload className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            
            <input
              type="file"
              accept=".docx,.doc"
              multiple
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            
            <label
              htmlFor="file-upload"
              className="cursor-pointer inline-block"
            >
              <div className="text-xl font-semibold text-white mb-2">
                {selectedFiles.length > 0
                  ? `${selectedFiles.length} file(s) selected`
                  : 'Click to select multiple DOCX files'}
              </div>
              <div className="text-gray-400 text-sm">
                Select multiple files at once using Ctrl+Click or Shift+Click
              </div>
            </label>
          </div>

          {/* Process Button */}
          <button
            onClick={handleUpload}
            disabled={selectedFiles.length === 0 || processing}
            className="w-full mt-6 py-4 px-6 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold rounded-xl hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
          >
            {processing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Processing {selectedFiles.length} file(s)...
              </>
            ) : (
              <>
                <Calendar className="h-5 w-5" />
                Extract & Update Dates
              </>
            )}
          </button>

          {/* Summary - Clickable Cards */}
          {results.length > 0 && (
            <div className="mt-8 grid grid-cols-4 gap-4">
              {/* All */}
              <button
                onClick={() => setSelectedFilter('all')}
                className={`p-4 rounded-xl border transition-all ${
                  selectedFilter === 'all'
                    ? 'bg-blue-500/30 border-blue-400 ring-2 ring-blue-400'
                    : 'bg-blue-500/10 border-blue-500/50 hover:bg-blue-500/20'
                }`}
              >
                <p className="text-blue-300 text-sm mb-1">All Files</p>
                <p className="text-white text-3xl font-bold">{results.length}</p>
              </button>

              {/* Found Dates */}
              <button
                onClick={() => setSelectedFilter('success')}
                className={`p-4 rounded-xl border transition-all ${
                  selectedFilter === 'success'
                    ? 'bg-green-500/30 border-green-400 ring-2 ring-green-400'
                    : 'bg-green-500/10 border-green-500/50 hover:bg-green-500/20'
                }`}
              >
                <p className="text-green-300 text-sm mb-1">Found Dates</p>
                <p className="text-white text-3xl font-bold">{successCount}</p>
              </button>

              {/* Not Found */}
              <button
                onClick={() => setSelectedFilter('not_found')}
                className={`p-4 rounded-xl border transition-all ${
                  selectedFilter === 'not_found'
                    ? 'bg-yellow-500/30 border-yellow-400 ring-2 ring-yellow-400'
                    : 'bg-yellow-500/10 border-yellow-500/50 hover:bg-yellow-500/20'
                }`}
              >
                <p className="text-yellow-300 text-sm mb-1">Not Found</p>
                <p className="text-white text-3xl font-bold">{notFoundCount}</p>
              </button>

              {/* Errors */}
              <button
                onClick={() => setSelectedFilter('error')}
                className={`p-4 rounded-xl border transition-all ${
                  selectedFilter === 'error'
                    ? 'bg-red-500/30 border-red-400 ring-2 ring-red-400'
                    : 'bg-red-500/10 border-red-500/50 hover:bg-red-500/20'
                }`}
              >
                <p className="text-red-300 text-sm mb-1">Errors</p>
                <p className="text-white text-3xl font-bold">{errorCount}</p>
              </button>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">
                  Processing Results: 
                  <span className="ml-2 text-gray-400 text-base">
                    {selectedFilter === 'all' ? 'All Files' : 
                     selectedFilter === 'success' ? 'Found Dates' :
                     selectedFilter === 'not_found' ? 'Not Found' : 'Errors'}
                    {' '}({filteredResults.length})
                  </span>
                </h3>
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {filteredResults.map((result, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border ${
                      result.status === 'success'
                        ? 'bg-green-500/10 border-green-500/50'
                        : result.status === 'not_found'
                        ? 'bg-yellow-500/10 border-yellow-500/50'
                        : 'bg-red-500/10 border-red-500/50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {result.status === 'success' ? (
                            <CheckCircle className="h-5 w-5 text-green-400" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-yellow-400" />
                          )}
                          <p className="text-white font-semibold">{result.fileName}</p>
                        </div>
                        <p className="text-gray-300 text-sm mb-2">
                          Identifier: <span className="font-mono">{result.sopIdentifier || 'Not found'}</span>
                        </p>
                        
                        {/* Show found dates as badges */}
                        {result.foundDates && result.foundDates.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {result.foundDates.map((dateName: string, idx: number) => (
                              <span
                                key={idx}
                                className="px-2 py-1 bg-green-500/20 border border-green-500/50 rounded text-green-300 text-xs font-semibold"
                              >
                                ✓ {dateName}
                              </span>
                            ))}
                          </div>
                        )}
                        
                        {result.extractedDates && Object.keys(result.extractedDates).length > 0 && (
                          <div className="text-sm text-gray-400 space-y-1">
                            {result.extractedDates.effectiveDate && (
                              <p>• Effective: {new Date(result.extractedDates.effectiveDate).toLocaleDateString()}</p>
                            )}
                            {result.extractedDates.reviewDate && (
                              <p>• Review: {new Date(result.extractedDates.reviewDate).toLocaleDateString()}</p>
                            )}
                            {result.extractedDates.expiryDate && (
                              <p>• Expiry: {new Date(result.extractedDates.expiryDate).toLocaleDateString()}</p>
                            )}
                            {result.extractedDates.version && (
                              <p>• Version: {result.extractedDates.version}</p>
                            )}
                          </div>
                        )}
                        <p className={`text-sm mt-2 ${
                          result.status === 'success' ? 'text-green-300' : 'text-yellow-300'
                        }`}>
                          {result.message}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 bg-blue-500/20 border border-blue-500/50 rounded-xl p-4">
                <p className="text-blue-200 text-sm">
                  ✅ Processing complete! Go to <a href="/sop-monitoring" className="underline font-semibold">SOP Monitoring</a> to see the updated dates.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
