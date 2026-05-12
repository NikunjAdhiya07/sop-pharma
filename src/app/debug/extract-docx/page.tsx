'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';

import { useState } from 'react';

export default function DebugExtractPage() {
  useAuthGuard();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);

  const handleTest = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/debug/extract-docx', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    setResult(data);
  };

  return (
    <div className="min-h-screen bg-slate-900 p-8 text-white">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Debug: DOCX Date Extraction</h1>
        
        <input
          type="file"
          accept=".docx"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mb-4 text-white"
        />
        
        <button
          onClick={handleTest}
          disabled={!file}
          className="px-6 py-2 bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          Test Extraction
        </button>

        {result && (
          <div className="mt-8 space-y-4">
            <div className="bg-slate-800 p-4 rounded">
              <h2 className="font-bold mb-2">File: {result.fileName}</h2>
              <p>Identifier: {result.identifier || 'NOT FOUND'}</p>
            </div>

            <div className="bg-slate-800 p-4 rounded">
              <h2 className="font-bold mb-2">Extracted Dates:</h2>
              <pre className="text-sm">{JSON.stringify(result.extractedDates, null, 2)}</pre>
            </div>

            <div className="bg-slate-800 p-4 rounded">
              <h2 className="font-bold mb-2">Content Preview (first 1000 chars):</h2>
              <pre className="text-xs whitespace-pre-wrap">{result.contentPreview}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
