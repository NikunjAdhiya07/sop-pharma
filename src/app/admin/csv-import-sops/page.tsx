'use client';

import { useState } from 'react';
import { Upload, Download, Loader2, CheckCircle, AlertCircle, FileSpreadsheet } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

export default function CSVImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const downloadTemplate = () => {
    const csvContent = `SOP Identifier,Effective Date,Review Date,Expiry Date,Version,Owner
QAGE01-10,2025-10-31,2027-10-30,2030-10-31,1.0,John Doe
QAMI26-07,2024-05-15,2026-05-14,2029-05-15,2.0,Jane Smith`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sop_dates_template.csv';
    link.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError('');
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a CSV file');
      return;
    }

    setUploading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/sop-monitoring/csv-import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
        setFile(null);
      } else {
        setError(data.error || 'Import failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <PageHeader />

        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
          <h1 className="text-4xl font-bold text-white mb-4">
            CSV Import - SOP Dates
          </h1>
          <p className="text-gray-300 mb-8">
            Import SOP dates and metadata from a CSV file
          </p>

          {/* Instructions */}
          <div className="bg-blue-500/20 border border-blue-500/50 rounded-xl p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">📋 Instructions:</h2>
            <ol className="text-blue-100 space-y-2 list-decimal list-inside">
              <li>Download the CSV template below</li>
              <li>Fill in your SOP data (dates in YYYY-MM-DD format)</li>
              <li>Upload the completed CSV file</li>
              <li>Review the results and check SOP Monitoring</li>
            </ol>
          </div>

          {/* CSV Format */}
          <div className="bg-white/5 rounded-xl p-6 mb-8">
            <h3 className="text-lg font-bold text-white mb-3">CSV Format:</h3>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm text-gray-300 overflow-x-auto">
              <div>SOP Identifier,Effective Date,Review Date,Expiry Date,Version,Owner</div>
              <div className="text-gray-500">QAGE01-10,2025-10-31,2027-10-30,2030-10-31,1.0,John Doe</div>
            </div>
            <p className="text-gray-400 text-sm mt-3">
              • Dates must be in <span className="text-purple-300 font-semibold">YYYY-MM-DD</span> format<br />
              • SOP Identifier must match exactly<br />
              • Leave fields empty to skip updating them
            </p>
          </div>

          {/* Download Template */}
          <button
            onClick={downloadTemplate}
            className="w-full mb-6 py-4 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
          >
            <Download className="h-5 w-5" />
            Download CSV Template
          </button>

          {/* File Upload */}
          <div className="border-2 border-dashed border-white/30 rounded-xl p-8 mb-6 text-center hover:border-purple-500/50 transition-colors">
            <FileSpreadsheet className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              id="csv-upload"
            />
            <label
              htmlFor="csv-upload"
              className="cursor-pointer inline-block px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-all"
            >
              {file ? file.name : 'Choose CSV File'}
            </label>
            <p className="text-gray-400 text-sm mt-2">
              Click to select a CSV file
            </p>
          </div>

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full py-4 px-6 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold rounded-xl hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                Import CSV
              </>
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="mt-6 bg-red-500/20 border border-red-500 rounded-xl p-4 flex items-start">
              <AlertCircle className="h-5 w-5 text-red-400 mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-red-200 font-semibold">Import Failed</p>
                <p className="text-red-300 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Success */}
          {result && (
            <div className="mt-6 bg-green-500/20 border border-green-500 rounded-xl p-6">
              <div className="flex items-center mb-4">
                <CheckCircle className="h-6 w-6 text-green-400 mr-3" />
                <h3 className="text-xl font-bold text-white">Import Successful!</h3>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-gray-300 text-sm">Total Rows</p>
                  <p className="text-white text-2xl font-bold">{result.totalRows}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-gray-300 text-sm">Updated SOPs</p>
                  <p className="text-green-300 text-2xl font-bold">{result.updatedCount}</p>
                </div>
              </div>

              {result.errors && result.errors.length > 0 && (
                <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-4">
                  <p className="text-yellow-200 font-semibold mb-2">
                    {result.errors.length} Error(s):
                  </p>
                  <ul className="text-yellow-100 text-sm space-y-1 max-h-40 overflow-y-auto">
                    {result.errors.map((err: any, idx: number) => (
                      <li key={idx}>
                        Row {err.row}: {err.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 bg-blue-500/20 border border-blue-500/50 rounded-lg p-4">
                <p className="text-blue-200 text-sm">
                  ✅ Import complete! Go to <a href="/sop-monitoring" className="underline font-semibold">SOP Monitoring</a> to see the updated dates.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
