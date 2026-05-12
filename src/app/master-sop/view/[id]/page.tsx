'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import PageHeader from '@/components/PageHeader';
import DocxPreviewClient from '@/app/dashboard/components/DocxPreviewClient';
import { ArrowLeft, FileText, Loader2, Download, Calendar, Hash } from 'lucide-react';

interface MasterSOP {
  _id: string;
  sopIdentifier: string;
  sopName: string;
  department: string;
  departmentCode: string;
  folderPath: string;
  sopDocument: {
    fileName: string;
    filePath: string;
    fileSize: number;
    uploadedAt: string;
  };
  metadata: {
    effectiveDate?: string;
    reviewDate?: string;
    expiryDate?: string;
    version?: string;
    wordCount: number;
  };
}

export default function ViewDocumentPage() {
  useAuthGuard();
  const router = useRouter();
  const params = useParams();
  const sopId = params.id as string;

  const [sop, setSop] = useState<MasterSOP | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sopId) {
      fetchSOPDetails();
    }
  }, [sopId]);

  const fetchSOPDetails = async () => {
    try {
      setLoading(true);
      console.log('[Frontend] Fetching SOP with ID:', sopId);
      console.log('[Frontend] ID type:', typeof sopId);
      console.log('[Frontend] ID length:', sopId?.length);
      
      const response = await fetch(`/api/master-sop-repository/${sopId}`);
      const data = await response.json();

      console.log('[Frontend] API Response status:', response.status);
      console.log('[Frontend] API Response data:', data);

      if (data.success) {
        setSop(data.sop);
      } else {
        console.error('[Frontend] API returned error:', data.error);
        alert(`Error: ${data.error}. Please check the console for details.`);
      }
    } catch (error) {
      console.error('[Frontend] Error fetching SOP details:', error);
      alert('Failed to fetch SOP details. Please check the console for details.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!sop) return;
    
    try {
      const dl = new URLSearchParams();
      dl.set('path', sop.sopDocument.filePath);
      dl.set('identifier', sop.sopIdentifier);
      const response = await fetch(`/api/files/download?${dl.toString()}`);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || response.statusText);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = sop.sopDocument.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading document:', error);
      alert('Failed to download document');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950">
        <PageHeader />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-12 w-12 text-green-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (!sop) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950">
        <PageHeader />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center text-gray-400">
            <p>Document not found</p>
            <button
              onClick={() => router.push('/master-sop')}
              className="mt-4 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700"
            >
              Back to Master SOP
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950">
      <PageHeader />
      
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/master-sop')}
                className="p-2 hover:bg-white/10 rounded-lg transition-all"
              >
                <ArrowLeft className="h-6 w-6 text-gray-300" />
              </button>
              <FileText className="h-8 w-8 text-green-400" />
              <div>
                <h1 className="text-2xl font-bold text-white">{sop.sopIdentifier}</h1>
                <p className="text-gray-300">{sop.sopName}</p>
              </div>
            </div>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all"
            >
              <Download className="h-5 w-5" />
              Download DOCX
            </button>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
            <div className="bg-white/10 rounded-lg p-3">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <Hash className="h-4 w-4" />
                Department
              </div>
              <div className="text-white font-semibold">{sop.department}</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <FileText className="h-4 w-4" />
                Version
              </div>
              <div className="text-white font-semibold">{sop.metadata.version || 'N/A'}</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <Calendar className="h-4 w-4" />
                Effective Date
              </div>
              <div className="text-white font-semibold">
                {sop.metadata.effectiveDate ? new Date(sop.metadata.effectiveDate).toLocaleDateString() : 'N/A'}
              </div>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <Calendar className="h-4 w-4" />
                Review Date
              </div>
              <div className="text-white font-semibold">
                {sop.metadata.reviewDate ? new Date(sop.metadata.reviewDate).toLocaleDateString() : 'N/A'}
              </div>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <FileText className="h-4 w-4" />
                Word Count
              </div>
              <div className="text-white font-semibold">{sop.metadata.wordCount.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Document — Word Online / docx-preview (no plain-text HTML) */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden p-2 sm:p-4">
          <DocxPreviewClient
            pathParam={sop.sopDocument.filePath}
            identifierParam={sop.sopIdentifier}
            languageParam="English"
            layout="embedded"
            backHref="/master-sop"
            backLabel="Back to Master SOP"
          />
        </div>
      </div>
    </div>
  );
}
