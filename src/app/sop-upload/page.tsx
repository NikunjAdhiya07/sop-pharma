'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, Library, FolderOpen, Archive, X, Trash2, Eye, Download, RotateCcw } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { fileKindFromStoredPath, fileKindToLabel } from '@/lib/filePathFileKind';
import { buildViewDocHref, buildDocxDownloadHref, buildPdfDownloadHref } from '@/lib/viewDocLinks';

interface UploadResponse {
  success: boolean;
  message: string;
  sop: {
    id: string;
    name: string;
    identifier: string;
    status: string;
    wordCount: number;
    language?: string;
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function buildPreviewHref(path: string, fileType?: string, identifier?: string, language?: string) {
  const trimmed = (path || '').trim();
  const kind = fileKindFromStoredPath(trimmed, fileType);
  if (kind === 'docx' || kind === 'doc') return buildViewDocHref(path, identifier, language);
  if (kind === 'pdf') {
    const dl = new URLSearchParams();
    dl.set('path', path);
    if (identifier) dl.set('identifier', identifier);
    if (language) dl.set('language', language);
    return `/api/files/download?${dl.toString()}`;
  }
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const dl = new URLSearchParams();
  dl.set('path', path);
  dl.set('open', '1');
  if (identifier) dl.set('identifier', identifier);
  if (language) dl.set('language', language);
  return `/api/files/download?${dl.toString()}`;
}

function getVersionNum(sopNo: string): number | null {
  if (typeof sopNo !== 'string') return null;
  const m = sopNo.match(/-0*(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function SOPUploadPage() {
  useAuthGuard();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [sopName, setSopName] = useState('');
  const [sopIdentifier, setSopIdentifier] = useState('');
  const [department, setDepartment] = useState('QA');
  const [language, setLanguage] = useState<'English' | 'Gujarati' | 'auto'>('auto');
  const [uploading, setUploading] = useState(false);

  // Obsolete SOPs panel
  const [showObsoletePanel, setShowObsoletePanel] = useState(false);
  const [obsoleteList, setObsoleteList] = useState<any[]>([]);
  const [obsoleteLoading, setObsoleteLoading] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ identifier: string; name: string } | null>(null);
  const [removePassword, setRemovePassword] = useState('');
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const [obsoleteFilterDept, setObsoleteFilterDept] = useState('');

  const fetchObsoleteList = async () => {
    setObsoleteLoading(true);
    try {
      const res = await fetch('/api/sop/obsolete-list');
      const j = await res.json();
      if (j.success) setObsoleteList(j.data ?? []);
    } catch { /* ignore */ } finally { setObsoleteLoading(false); }
  };

  const handleOpenObsoletePanel = () => {
    setShowObsoletePanel(true);
    fetchObsoleteList();
  };

  const handleRemoveObsolete = async () => {
    if (!removeTarget || !removePassword) return;
    setRemoveBusy(true);
    setRemoveError('');
    try {
      const user = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
      const res = await fetch('/api/sop/remove-obsolete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sopIdentifier: removeTarget.identifier, password: removePassword, username: user?.username }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) { setRemoveError(j.error || 'Failed'); return; }
      setRemoveTarget(null);
      setRemovePassword('');
      setObsoleteList(prev => prev.filter(x => x.identifier !== removeTarget.identifier));
    } catch { setRemoveError('Network error — please try again'); }
    finally { setRemoveBusy(false); }
  };

  const obsoleteDepts = Array.from(new Set(obsoleteList.map((x: any) => x.department).filter(Boolean))).sort() as string[];
  const displayedObsolete = obsoleteFilterDept
    ? obsoleteList.filter((x: any) => x.department === obsoleteFilterDept)
    : obsoleteList;

  const departments = [
    'QA',
    'QC',
    'Microbiology',
    'Production',
    'Store',
    'Engineering and Maintenance',
    'Personnel'
  ];
  const [generating, setGenerating] = useState(false);
  const [uploadedSOP, setUploadedSOP] = useState<UploadResponse['sop'] | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [duplicateSOP, setDuplicateSOP] = useState<{ type: string, existingSOP: any } | null>(null);
  const [generatedSopId, setGeneratedSopId] = useState<string | null>(null);

  // MCQ generation progress
  const [genStep, setGenStep] = useState<'idle' | 'connecting' | 'reading' | 'generating' | 'saving' | 'done' | 'error'>('idle');
  const [genCount, setGenCount] = useState(0); // live question count from DB poll
  const genPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopGenPoll = () => {
    if (genPollRef.current) { clearInterval(genPollRef.current); genPollRef.current = null; }
  };

  // Poll the MCQ bank count while generating so the bar moves in real time
  const startGenPoll = (sopId: string) => {
    stopGenPoll();
    genPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/sop/generate-mcqs?sopId=${sopId}`, { cache: 'no-store' });
        if (res.ok) {
          const d = await res.json();
          const count = d.mcqBank?.mcqs?.length ?? d.mcqBank?.totalQuestions ?? 0;
          if (count > 0) {
            setGenCount(count);
            setGenStep('generating');
          }
        }
      } catch { /* ignore poll errors */ }
    }, 2500);
  };

  useEffect(() => () => stopGenPoll(), []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const extension = selectedFile.name.split('.').pop()?.toLowerCase();
      if (extension === 'pdf' || extension === 'docx') {
        setFile(selectedFile);
        setError('');
        
        // Auto-populate SOP name and identifier from filename
        const nameWithoutExt = selectedFile.name.replace(/\.(pdf|docx)$/i, '');
        
        if (!sopName) {
          setSopName(nameWithoutExt);
        }
        
        if (!sopIdentifier) {
          // Generate identifier from filename
          // Extract any existing code (e.g., QCMI01-00, SOP-001, etc.)
          const codeMatch = nameWithoutExt.match(/([A-Z]{2,}[-_]?\d+[-_]?\d*)/i);
          if (codeMatch) {
            // Use the extracted code
            setSopIdentifier(codeMatch[1].toUpperCase());
          } else {
            // Generate a simple identifier from the first few words
            const words = nameWithoutExt.split(/[\s_-]+/).filter(w => w.length > 0);
            const identifier = words.slice(0, 3).join('-').toUpperCase();
            setSopIdentifier(identifier || `SOP-${Date.now()}`);
          }
        }
      } else {
        setError('Please select a PDF or DOCX file');
        setFile(null);
      }
    }
  };

  const handleUpload = async (e?: React.FormEvent, overwrite = false) => {
    if (e) e.preventDefault();
    
    if (!file || !sopName || !sopIdentifier) {
      setError('Please fill in all fields');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sopName', sopName);
      formData.append('sopIdentifier', sopIdentifier);
      formData.append('department', department);
      formData.append('language', language);
      if (overwrite) {
        formData.append('overwrite', 'true');
      }

      const response = await fetch('/api/sop/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
            setDuplicateSOP({
                type: data.type,
                existingSOP: data.existingSOP
            });
            setDuplicateWarning(true);
            setUploading(false); // Stop loading state
            return; 
        }
        throw new Error(data.error || 'Upload failed');
      }

      // If successful (and maybe was a retry), clear duplicate warning
      setDuplicateWarning(false);
      setDuplicateSOP(null);

      setUploadedSOP(data.sop);
      if (data.mcqGenerating) {
        setSuccess('SOP updated! Old MCQs have been archived. New MCQs are being generated in the background — check the MCQ Bank in a minute.');
      } else {
        setSuccess('SOP uploaded successfully! You can now generate MCQs.');
      }

      // Reset form
      setFile(null);
      setSopName('');
      setSopIdentifier('');
      setGeneratedSopId(null);
      
    } catch (err) {
      // Extract detailed error message from API response
      let errorMessage = 'Upload failed';
      
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      // Add helpful context for common errors
      if (errorMessage.includes('scanned images') || errorMessage.includes('selectable text')) {
        errorMessage += '\n\n💡 Solution: Use a PDF with selectable text, or convert your scanned PDF using an OCR tool.';
      } else if (errorMessage.includes('password')) {
        errorMessage += '\n\n💡 Solution: Remove the password protection from your PDF and try again.';
      } else if (errorMessage.includes('word(s)')) {
        errorMessage += '\n\n💡 Solution: Ensure your PDF contains readable text content (minimum 10 words).';
      }
      
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateMCQs = async () => {
    if (!uploadedSOP) return;

    setGenerating(true);
    setError('');
    setSuccess('');
    setGenCount(0);
    setGenStep('connecting');

    try {
      // Step 1 — brief pause so "Connecting" renders visibly
      await new Promise(r => setTimeout(r, 400));
      setGenStep('reading');

      // Step 2 — start polling the DB for live question count
      startGenPoll(uploadedSOP.id);
      await new Promise(r => setTimeout(r, 600));
      setGenStep('generating');

      // Step 3 — fire the actual generation (blocks until AI finishes)
      const response = await fetch('/api/sop/generate-mcqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sopId: uploadedSOP.id, targetCount: 100 }),
      });

      stopGenPoll();

      const data = await response.json();

      if (!response.ok) {
        setGenStep('error');
        throw new Error(data.error || data.details || 'MCQ generation failed');
      }

      // Step 4 — saving
      setGenStep('saving');
      const questionCount = data.total ?? data.mcqBank?.mcqs?.length ?? data.mcqBank?.totalQuestions ?? 0;
      setGenCount(questionCount);
      await new Promise(r => setTimeout(r, 500));

      // Step 5 — done
      setGenStep('done');
      setGeneratedSopId(uploadedSOP.id);
      setSuccess(`✅ MCQ Bank generated! ${questionCount} questions created for "${uploadedSOP.name}".`);
      await new Promise(r => setTimeout(r, 1200));
      setUploadedSOP(null);
      setGenStep('idle');

    } catch (err) {
      stopGenPoll();
      setGenStep('error');
      const msg = err instanceof Error ? err.message : 'MCQ generation failed';
      setError(`❌ ${msg}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Navigation */}
        <PageHeader />

        {/* Header with Navigation Button */}
        <div className="mb-12">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 text-center">
              <h1 className="text-5xl font-bold text-white mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                SOP → MCQ Bank Generator
              </h1>
              <p className="text-gray-300 text-lg">
                Upload your SOP document and generate comprehensive MCQ banks powered by Gemini 2.0 Flash
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/bulk-process')}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-yellow-600 to-orange-600 text-white font-semibold rounded-xl hover:from-yellow-700 hover:to-orange-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg whitespace-nowrap"
              >
                <FolderOpen className="h-5 w-5" />
                Bulk Process
              </button>
              <button
                onClick={() => router.push('/files-manager')}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg whitespace-nowrap"
              >
                <FolderOpen className="h-5 w-5" />
                Files Manager
              </button>
              <button
                onClick={() => router.push('/mcq-bank')}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg whitespace-nowrap"
              >
                <Library className="h-5 w-5" />
                MCQ Bank
              </button>
            </div>
          </div>
        </div>



        {/* Upload Form */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20 mb-8">
          {/* Section header with Obsolete SOPs button */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Single SOP Upload</h2>
            <button
              type="button"
              onClick={handleOpenObsoletePanel}
              className="flex items-center gap-2 px-4 py-2 bg-rose-600/80 hover:bg-rose-600 border border-rose-400/40 text-white font-semibold rounded-xl transition-all duration-200 text-sm"
            >
              <Archive className="h-4 w-4" />
              Obsolete SOPs
            </button>
          </div>
          <form onSubmit={handleUpload} className="space-y-6">
            {/* File Upload */}
            <div>
              <label className="block text-white font-semibold mb-3 text-lg">
                Upload SOP Document
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept=".pdf,.docx"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                  disabled={uploading}
                />
                <label
                  htmlFor="file-upload"
                  className="flex items-center justify-center w-full px-6 py-8 border-2 border-dashed border-purple-400 rounded-xl cursor-pointer hover:border-purple-300 hover:bg-white/5 transition-all duration-300"
                >
                  <div className="text-center">
                    <Upload className="mx-auto h-12 w-12 text-purple-400 mb-3" />
                    <p className="text-white font-medium mb-1">
                      {file ? file.name : 'Click to upload PDF or DOCX'}
                    </p>
                    <p className="text-gray-400 text-sm">
                      Maximum file size: 10MB
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* SOP Name */}
            <div>
              <label htmlFor="sopName" className="block text-white font-semibold mb-3 text-lg">
                SOP Name
              </label>
              <input
                type="text"
                id="sopName"
                value={sopName}
                onChange={(e) => setSopName(e.target.value)}
                placeholder="e.g., Quality Control Procedures"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                disabled={uploading}
              />
            </div>

            {/* SOP Identifier */}
            <div>
              <label htmlFor="sopIdentifier" className="block text-white font-semibold mb-3 text-lg">
                SOP Identifier <span className="text-gray-400 text-sm font-normal">(Auto-generated from filename)</span>
              </label>
              <input
                type="text"
                id="sopIdentifier"
                value={sopIdentifier}
                onChange={(e) => setSopIdentifier(e.target.value)}
                placeholder="Auto-detected or enter manually (e.g., SOP-QC-001)"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                disabled={uploading}
              />
              <p className="text-gray-400 text-sm mt-2">
                💡 Identifier is automatically extracted from your filename. You can edit if needed.
              </p>
            </div>

            {/* Department */}
            <div>
              <label htmlFor="department" className="block text-white font-semibold mb-3 text-lg">
                Department
              </label>
              <select
                id="department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all overflow-hidden"
                disabled={uploading}
              >
                {departments.map((dept) => (
                  <option key={dept} value={dept} className="bg-slate-800 text-white">
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            {/* Language Selection */}
            <div>
              <label className="block text-white font-semibold mb-3 text-lg">
                SOP Language
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                {(
                  [
                    { key: 'auto' as const, label: 'Auto detect' },
                    { key: 'English' as const, label: 'English' },
                    { key: 'Gujarati' as const, label: 'Gujarati' },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLanguage(key)}
                    className={`flex-1 py-3 px-4 rounded-xl border-2 transition-all flex items-center justify-center gap-3 ${
                      language === key
                        ? 'border-purple-500 bg-purple-500/10 text-white shadow-lg shadow-purple-500/10'
                        : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:text-gray-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        language === key ? 'border-purple-500 bg-purple-500' : 'border-slate-600'
                      }`}
                    >
                      {language === key && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <span className="font-bold text-base text-left">{label}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-sm text-gray-400">
                Auto uses Gujarati script in the file name or body to tag the record as Gujarati; otherwise English. MCQs follow the stored language.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={uploading || !file || !sopName || !sopIdentifier}
              className="w-full py-4 px-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg"
            >
              {uploading ? (
                <span className="flex items-center justify-center">
                  <Loader2 className="animate-spin mr-2 h-5 w-5" />
                  Uploading...
                </span>
              ) : (
                'Upload SOP'
              )}
            </button>
          </form>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-red-500/20 border border-red-500 rounded-xl p-4 mb-6 flex items-start">
            <AlertCircle className="h-5 w-5 text-red-400 mr-3 mt-0.5 flex-shrink-0" />
            <p className="text-red-200 whitespace-pre-line">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-500/20 border border-green-500 rounded-xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start">
              <CheckCircle2 className="h-5 w-5 text-green-400 mr-3 mt-0.5 flex-shrink-0" />
              <p className="text-green-200">{success}</p>
            </div>
            {success.includes('MCQ Bank generated') && generatedSopId && (
              <button
                onClick={() => router.push(`/mcq-bank?sopId=${generatedSopId}`)}
                className="flex-shrink-0 px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-lg hover:from-emerald-600 hover:to-teal-600 transition-all shadow-md"
              >
                View MCQs →
              </button>
            )}
          </div>
        )}

        {/* Uploaded SOP Card */}
        {uploadedSOP && (
          <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-green-500/30">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-start">
                <FileText className="h-8 w-8 text-green-400 mr-4 mt-1" />
                <div>
                  <h3 className="text-2xl font-bold text-white mb-2">
                    {uploadedSOP.name}
                  </h3>
                  <p className="text-gray-300 mb-1">
                    Identifier: <span className="font-mono text-green-300">{uploadedSOP.identifier}</span>
                  </p>
                  <p className="text-gray-300 mb-1">
                    Word Count:{' '}
                    <span className="font-semibold text-green-300">
                      {(uploadedSOP.wordCount ?? 0).toLocaleString()}
                    </span>
                  </p>
                  {uploadedSOP.language ? (
                    <p className="text-gray-300">
                      Language: <span className="font-semibold text-green-300">{uploadedSOP.language}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {/* ── Generate button / progress panel ── */}
            {genStep === 'idle' || !generating ? (
              <button
                onClick={handleGenerateMCQs}
                disabled={generating}
                className="w-full py-4 px-6 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold rounded-xl hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg"
              >
                ⚡ Generate 100 MCQs
              </button>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/30 p-5 space-y-4">

                {/* Step indicators */}
                {(() => {
                  const steps: { key: typeof genStep; label: string; detail: string }[] = [
                    { key: 'connecting', label: 'Connecting',   detail: 'Reaching AI service' },
                    { key: 'reading',    label: 'Reading SOP',  detail: 'Parsing document content' },
                    { key: 'generating', label: 'Generating',   detail: `${genCount} / 100 questions so far` },
                    { key: 'saving',     label: 'Saving',       detail: 'Writing MCQ bank to database' },
                    { key: 'done',       label: 'Done',         detail: `${genCount} questions ready` },
                  ];
                  const order = ['connecting','reading','generating','saving','done'];
                  const currentIdx = order.indexOf(genStep);

                  return (
                    <div className="space-y-2">
                      {steps.map((s, i) => {
                        const isPast    = i < currentIdx;
                        const isCurrent = i === currentIdx;
                        const isFuture  = i > currentIdx;
                        const isErr     = genStep === 'error' && i === currentIdx;

                        return (
                          <div key={s.key} className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-300 ${
                            isCurrent && !isErr ? 'bg-green-500/10 border border-green-500/20' :
                            isPast              ? 'opacity-60' :
                            isFuture            ? 'opacity-25' : ''
                          }`}>
                            {/* icon */}
                            <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                              {isPast ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                              ) : isCurrent && !isErr ? (
                                <Loader2 className="h-4 w-4 text-green-400 animate-spin" />
                              ) : isErr ? (
                                <AlertCircle className="h-4 w-4 text-red-400" />
                              ) : (
                                <div className="h-3 w-3 rounded-full border-2 border-white/20" />
                              )}
                            </div>
                            {/* label */}
                            <div className="flex-1 min-w-0">
                              <span className={`text-xs font-bold uppercase tracking-widest ${
                                isCurrent ? 'text-white' : isPast ? 'text-emerald-400' : 'text-gray-500'
                              }`}>{s.label}</span>
                              {isCurrent && (
                                <p className="text-[10px] text-gray-400 mt-0.5">{s.detail}</p>
                              )}
                            </div>
                            {/* step number badge */}
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                              isCurrent ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                              isPast    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                              'border-white/10 text-gray-600'
                            }`}>{i + 1}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      {genStep === 'generating' ? `${genCount} of 100 questions` :
                       genStep === 'done'       ? `${genCount} questions complete` :
                       genStep === 'saving'     ? 'Saving to database…' :
                       genStep === 'error'      ? 'Generation failed' :
                       'Starting…'}
                    </span>
                    <span className="text-[10px] font-black text-green-400">
                      {genStep === 'done' ? '100%' :
                       genStep === 'saving' ? '95%' :
                       genStep === 'generating' ? `${Math.min(Math.round((genCount / 100) * 90), 90)}%` :
                       genStep === 'reading' ? '5%' :
                       genStep === 'connecting' ? '2%' : '0%'}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        genStep === 'error' ? 'bg-red-500' :
                        genStep === 'done'  ? 'bg-emerald-500' :
                        'bg-gradient-to-r from-green-500 to-emerald-400'
                      }`}
                      style={{
                        width:
                          genStep === 'done'       ? '100%' :
                          genStep === 'saving'     ? '95%' :
                          genStep === 'generating' ? `${Math.max(10, Math.min(Math.round((genCount / 100) * 90), 90))}%` :
                          genStep === 'reading'    ? '5%' :
                          genStep === 'connecting' ? '2%' :
                          genStep === 'error'      ? '100%' : '0%'
                      }}
                    />
                  </div>
                </div>

                <p className="text-[10px] text-gray-500 text-center">
                  AI is reading the SOP and writing questions — this takes 2–5 minutes. Do not close this tab.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Info Section */}
        <div className="mt-12 bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10">
          <h2 className="text-2xl font-bold text-white mb-6">How It Works</h2>
          <div className="space-y-4">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold mr-4">
                1
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Upload SOP</h3>
                <p className="text-gray-300">Upload your SOP document in PDF or DOCX format</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold mr-4">
                2
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">AI Processing</h3>
                <p className="text-gray-300">Gemini 2.0 Flash analyzes your SOP content</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold mr-4">
                3
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">MCQ Generation</h3>
                <p className="text-gray-300">100 MCQs are generated with Easy, Medium, and Hard difficulty levels, with correct answer mapping</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold mr-4">
                4
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Permanent Storage</h3>
                <p className="text-gray-300">MCQs are stored in the database and can be reused for tests</p>
              </div>
            </div>
          </div>
        </div>
        {/* Duplicate Warning Modal */}
        {duplicateWarning && duplicateSOP && (
           <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-red-500/50 rounded-2xl max-w-lg w-full p-8 shadow-2xl relative">
                  <div className="flex items-start mb-6">
                      <div className="bg-red-500/20 p-3 rounded-full mr-4">
                          <AlertCircle className="h-8 w-8 text-red-500" />
                      </div>
                      <div>
                          <h3 className="text-2xl font-bold text-white mb-2">Duplicate SOP Detected</h3>
                          <p className="text-gray-300">
                             A similar SOP already exists in the system. 
                          </p>
                      </div>
                  </div>

                  <div className="bg-slate-800 rounded-xl p-4 mb-6 border border-white/10">
                      <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-400">Conflict Type:</span>
                          <span className="text-sm font-bold text-red-400 uppercase">{duplicateSOP.type} Match</span>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-400">Existing Identifier:</span>
                          <span className="text-sm font-mono text-white">{duplicateSOP.existingSOP.identifier}</span>
                      </div>
                      <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-400">Existing Name:</span>
                          <span className="text-sm text-white">{duplicateSOP.existingSOP.name}</span>
                      </div>
                  </div>

                  <p className="text-gray-300 mb-8 leading-relaxed">
                      Do you want to <span className="font-bold text-white">overwrite</span> the existing SOP record? 
                      This will update the file content, version history, and compliance dates, but preserve the ID.
                  </p>

                  <div className="flex gap-4">
                      <button 
                         onClick={() => {
                             setDuplicateWarning(false);
                             setDuplicateSOP(null);
                         }}
                         className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-colors"
                      >
                         Cancel
                      </button>
                      <button 
                         onClick={() => handleUpload(undefined, true)}
                         className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-red-500/20"
                      >
                         Overwrite & Update
                      </button>
                  </div>
              </div>
           </div>
        )}

        {/* ── Obsolete SOPs Modal ─────────────────────────────────────────── */}
        {showObsoletePanel && (
          <div
            className="fixed inset-0 z-[990] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowObsoletePanel(false)}>
            <div
              className="relative w-full max-w-6xl rounded-2xl border border-rose-200 bg-white shadow-2xl flex flex-col max-h-[90vh]"
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-center justify-between border-b border-rose-100 px-6 py-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-100">
                    <Archive className="h-4 w-4 text-rose-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Obsolete SOPs</h3>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">
                      Removed from registry &amp; MCQ bank
                    </p>
                  </div>
                  {!obsoleteLoading && (
                    <span className="ml-2 rounded-full bg-rose-100 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                      {displayedObsolete.length} of {obsoleteList.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {/* Department filter */}
                  <select
                    value={obsoleteFilterDept}
                    onChange={e => setObsoleteFilterDept(e.target.value)}
                    className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-rose-400">
                    <option value="">All Departments</option>
                    {obsoleteDepts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowObsoletePanel(false)}
                    className="rounded p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Body — full registry table */}
              <div className="flex-1 overflow-auto">
                {obsoleteLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="h-7 w-7 animate-spin rounded-full border-2 border-rose-400 border-t-transparent" />
                  </div>
                ) : displayedObsolete.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
                    <Trash2 className="h-10 w-10 opacity-30" />
                    <p className="text-sm font-semibold">No obsolete SOPs found</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse min-w-[900px] text-[11px]">
                    <thead className="bg-gray-100 border-b border-gray-300 sticky top-0 z-10">
                      <tr>
                        {['SOP No', 'Ver', 'SOP Name', 'Department', 'Language', 'Files', 'Location', 'Expiry', 'Obsolete Date', 'Source', 'Actions'].map(h => (
                          <th key={h} className="px-2 py-2 text-[9px] font-bold text-gray-600 uppercase tracking-wide whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayedObsolete.map((item: any, idx: number) => {
                        const vNum = getVersionNum(item.identifier);
                        const expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;
                        const now = new Date(); now.setHours(0,0,0,0);
                        const diffDays = expiryDate ? Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000) : null;
                        const expiryLabel = !expiryDate ? '—'
                          : diffDays! < 0 ? `Expired`
                          : diffDays! <= 30 ? `${diffDays}d`
                          : `${diffDays}d`;
                        const expiryColor = !expiryDate ? 'text-gray-400'
                          : diffDays! < 0 ? 'text-red-700 bg-red-50'
                          : diffDays! <= 30 ? 'text-orange-700 bg-orange-50'
                          : 'text-emerald-700 bg-emerald-50';

                        // Collect all document files
                        const allDocs: { filePath: string; fileType?: string; fileName?: string; language?: string }[] = [];
                        if (item.sopFile?.filePath) allDocs.push(item.sopFile);
                        (item.sopDocuments || []).forEach((d: any) => {
                          if (d.filePath && !allDocs.some(x => x.filePath === d.filePath)) allDocs.push(d);
                        });

                        return (
                          <tr key={item.identifier} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-rose-50/30'}`}>
                            {/* SOP No */}
                            <td className="px-2 py-1.5 font-mono font-bold text-rose-800 whitespace-nowrap align-middle text-[12px]">
                              {item.identifier}
                            </td>
                            {/* Ver */}
                            <td className="px-2 py-1.5 text-center align-middle">
                              {vNum != null
                                ? <span className="font-bold text-gray-800">{vNum}</span>
                                : <span className="text-gray-400">—</span>}
                            </td>
                            {/* SOP Name */}
                            <td className="px-2 py-1.5 align-middle max-w-[240px]">
                              {item.englishName && (
                                <p className="font-semibold text-gray-900 truncate" title={item.englishName}>{item.englishName}</p>
                              )}
                              {item.gujaratiName && (
                                <p className="text-[10px] text-indigo-700 font-semibold truncate" title={item.gujaratiName}>{item.gujaratiName}</p>
                              )}
                              {!item.englishName && !item.gujaratiName && (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            {/* Department */}
                            <td className="px-2 py-1.5 align-middle whitespace-nowrap">
                              <span className="bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded text-[9px] font-semibold">
                                {item.department || 'Other'}
                              </span>
                            </td>
                            {/* Language */}
                            <td className="px-2 py-1.5 text-center align-middle whitespace-nowrap">
                              {item.isDualLanguage
                                ? <span className="text-[9px] font-bold text-gray-800">ENG/GUJ</span>
                                : <span className="text-[9px] font-semibold text-gray-700">{item.language === 'Gujarati' ? 'GUJ' : 'ENG'}</span>}
                            </td>
                            {/* Files */}
                            <td className="px-2 py-1.5 align-middle">
                              {allDocs.length === 0 ? (
                                <span className="text-gray-400">—</span>
                              ) : (
                                <div className="flex flex-col gap-0.5">
                                  {allDocs.map((doc, i) => {
                                    const kind = fileKindFromStoredPath(doc.filePath, doc.fileType);
                                    const label = fileKindToLabel(kind);
                                    const lang = doc.language === 'Gujarati' ? 'Gujarati' : 'English';
                                    const href = buildPreviewHref(doc.filePath, doc.fileType, item.identifier, lang);
                                    const dlHref = (kind === 'docx' || kind === 'doc')
                                      ? buildDocxDownloadHref(doc.filePath, item.identifier, lang)
                                      : kind === 'pdf'
                                        ? buildPdfDownloadHref(doc.filePath, item.identifier, lang)
                                        : null;
                                    const isWord = kind === 'docx' || kind === 'doc';
                                    return (
                                      <div key={i} className="flex items-center gap-1">
                                        <span className="text-[8px] font-bold text-gray-400 w-6 shrink-0">
                                          {doc.language === 'Gujarati' ? 'GUJ' : 'ENG'}
                                        </span>
                                        {isWord && (
                                          <a href={href} target="_blank" rel="noopener noreferrer"
                                            className="shrink-0 rounded p-0.5 text-violet-600 hover:bg-violet-100">
                                            <Eye className="h-3 w-3" />
                                          </a>
                                        )}
                                        <a href={href} target="_blank" rel="noopener noreferrer"
                                          className={`font-bold text-[9px] hover:underline ${isWord ? 'text-purple-600' : 'text-blue-600'}`}>
                                          {label}
                                        </a>
                                        {dlHref && (
                                          <a href={dlHref} target="_blank" rel="noopener noreferrer"
                                            className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                                            <Download className="h-3 w-3" />
                                          </a>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                            {/* Location */}
                            <td className="px-2 py-1.5 align-middle max-w-[120px]">
                              <span className="text-gray-600 text-[10px] line-clamp-2" title={item.location || ''}>
                                {item.location || <span className="text-gray-400">—</span>}
                              </span>
                            </td>
                            {/* Expiry */}
                            <td className="px-2 py-1.5 align-middle whitespace-nowrap">
                              <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold ${expiryColor}`}>
                                {expiryDate
                                  ? `${expiryLabel} · ${expiryDate.toLocaleDateString()}`
                                  : '—'}
                              </span>
                            </td>
                            {/* Obsolete Date */}
                            <td className="px-2 py-1.5 align-middle whitespace-nowrap text-[10px] text-gray-500">
                              {item.obsoleteAt
                                ? new Date(item.obsoleteAt).toLocaleDateString()
                                : item.archivedAt
                                  ? new Date(item.archivedAt).toLocaleDateString()
                                  : '—'}
                            </td>
                            {/* Source badges */}
                            <td className="px-2 py-1.5 align-middle">
                              <div className="flex flex-col gap-0.5">
                                {item.fromRegistry && (
                                  <span className="inline-block rounded-full bg-rose-100 border border-rose-200 px-1.5 py-px text-[8px] font-bold text-rose-700 uppercase tracking-wide">
                                    Registry
                                  </span>
                                )}
                                {item.fromMCQBank && (
                                  <span className="inline-block rounded-full bg-amber-100 border border-amber-200 px-1.5 py-px text-[8px] font-bold text-amber-800 uppercase tracking-wide">
                                    MCQ Bank {item.mcqCount != null ? `· ${item.mcqCount}Q` : ''}
                                  </span>
                                )}
                              </div>
                            </td>
                            {/* Actions */}
                            <td className="px-2 py-1.5 align-middle whitespace-nowrap">
                              {item.fromRegistry && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRemoveTarget({ identifier: item.identifier, name: item.englishName || item.gujaratiName || item.identifier });
                                    setRemovePassword('');
                                    setRemoveError('');
                                  }}
                                  className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-800 hover:bg-emerald-100 transition-colors">
                                  <RotateCcw className="h-3 w-3" />
                                  Remove from Obsolete
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer */}
              <div className="shrink-0 border-t border-gray-100 px-6 py-2 text-[10px] text-gray-400 text-right">
                {obsoleteList.length} record{obsoleteList.length !== 1 ? 's' : ''} total
              </div>
            </div>
          </div>
        )}

        {/* Remove from Obsolete confirmation modal */}
        {removeTarget && (
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setRemoveTarget(null)}>
            <div
              className="w-full max-w-sm rounded-xl border border-emerald-200 bg-white p-6 shadow-2xl"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                    <RotateCcw className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Remove from Obsolete</h3>
                    <p className="text-[10px] text-gray-500">Restore SOP to the registry</p>
                  </div>
                </div>
                <button type="button" onClick={() => setRemoveTarget(null)}
                  className="rounded p-0.5 text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mb-1 rounded bg-emerald-50 border border-emerald-100 px-3 py-2 text-[11px] font-semibold text-emerald-900 leading-snug">
                <span className="block font-bold text-emerald-800 font-mono">{removeTarget.identifier}</span>
                {removeTarget.name}
              </p>
              <p className="mb-3 text-[10px] text-gray-600 leading-snug">
                This SOP will be restored to the registry. Enter the obsolete password to confirm.
              </p>
              <input
                type="password"
                placeholder="Enter password"
                value={removePassword}
                onChange={e => { setRemovePassword(e.target.value); setRemoveError(''); }}
                onKeyDown={e => { if (e.key === 'Enter' && removePassword && !removeBusy) handleRemoveObsolete(); }}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-800 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-300 mb-1"
              />
              {removeError && <p className="text-[10px] text-red-600 font-semibold mb-2">{removeError}</p>}
              <div className="flex gap-2 mt-3">
                <button type="button" onClick={() => setRemoveTarget(null)}
                  className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="button" disabled={!removePassword || removeBusy} onClick={handleRemoveObsolete}
                  className="flex-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  {removeBusy ? 'Restoring…' : 'Confirm Restore'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
