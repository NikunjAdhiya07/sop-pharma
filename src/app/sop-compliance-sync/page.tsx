'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { Upload, CheckCircle2, AlertTriangle, Loader2, FileText, Calendar, Database, Zap } from 'lucide-react';

export default function SOPComplianceSyncPage() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    updated: number;
    skipped: number;
    errors: number;
  } | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      
      // Add all DOCX files
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.endsWith('.docx') || file.name.endsWith('.DOCX')) {
          formData.append('files', file);
        }
      }

      const response = await fetch('/api/sop-compliance-sync/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setResult({
          updated: data.updated,
          skipped: data.skipped,
          errors: data.errors
        });
        
        // Auto-redirect to SOP Monitoring after 3 seconds
        setTimeout(() => {
          router.push('/sop-monitoring');
        }, 3000);
      } else {
        alert(`❌ Upload failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('❌ Upload failed. Please check the console for details.');
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Navigation */}
        <PageHeader />
        
        {/* Custom Title Section */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-4 bg-gradient-to-br from-green-600 to-emerald-600 rounded-2xl shadow-lg">
              <Database className="w-10 h-10 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white">SOP Compliance Sync</h1>
              <p className="text-gray-300 mt-2">Upload department DOCX files to sync SOP compliance dates</p>
            </div>
          </div>
        </div>

        {/* Instructions Card */}
        <div className="mt-8 bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 p-8">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-500/20 rounded-xl">
              <FileText className="w-6 h-6 text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-white mb-2">Expected File Format</h3>
              <p className="text-gray-300 mb-4">
                Upload department DOCX files (e.g., "1. QA.docx", "2. QC.docx") containing SOP compliance tables.
              </p>
              
              <div className="bg-black/30 rounded-lg p-4 font-mono text-sm text-gray-300">
                <div className="grid grid-cols-6 gap-2 mb-2 text-gray-400 font-semibold">
                  <div>Sr. No.</div>
                  <div>SOP Subject</div>
                  <div>SOP No.</div>
                  <div>Version</div>
                  <div>Effective Date</div>
                  <div>Review Date</div>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  <div>75.</div>
                  <div>Power Failure...</div>
                  <div className="text-yellow-400">QAGE98</div>
                  <div>04</div>
                  <div className="text-green-400">07/10/2024</div>
                  <div className="text-blue-400">06/10/2026</div>
                </div>
              </div>

              <div className="mt-4 flex items-start gap-2 text-sm text-gray-400">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p>
                  Dates must be in <span className="text-white font-semibold">DD/MM/YYYY</span> format.
                  The system will automatically match SOPs by identifier and update their compliance dates.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Upload Section */}
        <div className="mt-8 bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 p-8">
          <div className="text-center">
            <div className="inline-flex p-4 bg-purple-500/20 rounded-2xl mb-4">
              <Upload className="w-12 h-12 text-purple-400" />
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-2">Upload Department Files</h2>
            <p className="text-gray-300 mb-6">
              Select one or more department DOCX files containing SOP compliance dates
            </p>

            <label className="inline-block">
              <input
                type="file"
                accept=".docx"
                multiple
                onChange={handleUpload}
                disabled={uploading}
                className="hidden"
              />
              <div className={`
                px-8 py-4 rounded-xl font-semibold text-lg cursor-pointer
                transition-all duration-200
                ${uploading 
                  ? 'bg-gray-500 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-lg hover:shadow-xl'
                }
                text-white
              `}>
                {uploading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Upload className="w-5 h-5" />
                    Select Department Files
                  </span>
                )}
              </div>
            </label>
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="mt-8 bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 p-8">
            <div className="flex items-center gap-3 mb-6">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
              <h3 className="text-2xl font-bold text-white">Upload Complete!</h3>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-green-500/20 rounded-xl p-4 border border-green-500/30">
                <div className="text-3xl font-bold text-green-400 mb-1">{result.updated}</div>
                <div className="text-sm text-gray-300">SOPs Updated</div>
              </div>
              
              <div className="bg-yellow-500/20 rounded-xl p-4 border border-yellow-500/30">
                <div className="text-3xl font-bold text-yellow-400 mb-1">{result.skipped}</div>
                <div className="text-sm text-gray-300">Skipped</div>
              </div>
              
              <div className="bg-red-500/20 rounded-xl p-4 border border-red-500/30">
                <div className="text-3xl font-bold text-red-400 mb-1">{result.errors}</div>
                <div className="text-sm text-gray-300">Errors</div>
              </div>
            </div>

            <div className="bg-blue-500/20 rounded-xl p-4 border border-blue-500/30 flex items-center gap-3">
              <Zap className="w-5 h-5 text-blue-400" />
              <p className="text-gray-300">
                Redirecting to <span className="text-white font-semibold">SOP Monitoring</span> in 3 seconds...
              </p>
            </div>
          </div>
        )}

        {/* Features */}
        <div className="mt-8 grid grid-cols-3 gap-6">
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
            <div className="p-3 bg-purple-500/20 rounded-lg w-fit mb-4">
              <Calendar className="w-6 h-6 text-purple-400" />
            </div>
            <h4 className="text-lg font-semibold text-white mb-2">Auto Date Extraction</h4>
            <p className="text-sm text-gray-400">
              Automatically extracts effective and review dates from your department files
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
            <div className="p-3 bg-blue-500/20 rounded-lg w-fit mb-4">
              <Database className="w-6 h-6 text-blue-400" />
            </div>
            <h4 className="text-lg font-semibold text-white mb-2">Smart Matching</h4>
            <p className="text-sm text-gray-400">
              Intelligently matches SOPs by identifier, even with version suffixes
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
            <div className="p-3 bg-green-500/20 rounded-lg w-fit mb-4">
              <Zap className="w-6 h-6 text-green-400" />
            </div>
            <h4 className="text-lg font-semibold text-white mb-2">Instant Sync</h4>
            <p className="text-sm text-gray-400">
              Updates sync immediately to SOP Monitoring for compliance tracking
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
