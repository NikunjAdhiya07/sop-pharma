import React, { useState, useRef } from 'react';
import { X, Upload, FileText, Loader2, CheckCircle2, AlertCircle, Files, Eye } from 'lucide-react';
import * as XLSX from 'xlsx';

interface TrainingMatrixUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface PreviewRow { [key: string]: string; }

export default function TrainingMatrixUploadModal({ isOpen, onClose, onSuccess }: TrainingMatrixUploadModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; summary?: any } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Excel preview/mapping state
  const [isExcel, setIsExcel] = useState(false);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [empCol, setEmpCol] = useState('');
  const [sopCol, setSopCol] = useState('');
  const [dateCol, setDateCol] = useState('');
  const [deptCol, setDeptCol] = useState('');
  const [trainerCol, setTrainerCol] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  if (!isOpen) return null;

  const autoMatch = (cols: string[], candidates: string[]) => {
    for (const cand of candidates) {
      const exact = cols.find(c => c.toLowerCase().trim() === cand.toLowerCase());
      if (exact) return exact;
    }
    for (const cand of candidates) {
      const partial = cols.find(c => c.toLowerCase().includes(cand.toLowerCase()));
      if (partial) return partial;
    }
    return '';
  };

  const parseExcelPreview = async (f: File) => {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'buffer' });
    setSheetNames(wb.SheetNames);
    // Preview from the FIRST sheet only (column mapping applies to all)
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as PreviewRow[];
    if (rows.length === 0) return;

    const cols = Object.keys(rows[0]);
    setAvailableColumns(cols);
    setPreviewRows(rows.slice(0, 6));

    setEmpCol(autoMatch(cols, ['employee name', 'employee', 'trainee name', 'trainee', 'name', 'staff name']));
    setSopCol(autoMatch(cols, ['sop no.', 'sop no', 'sop code', 'sop identifier', 'sop', 'protocol id']));
    setDateCol(autoMatch(cols, ['training date', 'date of training', 'date', 'trained on']));
    setDeptCol(autoMatch(cols, ['department name', 'department', 'dept']));
    setTrainerCol(autoMatch(cols, ['trainer name', 'trainer', 'training officer', 'trained by', 'incharge']));
    setShowPreview(true);
  };

  const onFileSelected = async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    setFiles(selectedFiles);
    setResult(null);
    setShowPreview(false);
    const f = selectedFiles[0];
    const excelFile = f.name.endsWith('.xlsx') || f.name.endsWith('.xls');
    setIsExcel(excelFile);
    if (excelFile) await parseExcelPreview(f);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSheetNames([]);
      await onFileSelected(Array.from(e.target.files));
    }
  };


  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) await onFileSelected([f]);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setResult(null);

    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    if (isExcel) {
      if (empCol) formData.append('empCol', empCol);
      if (sopCol) formData.append('sopCol', sopCol);
      if (dateCol) formData.append('dateCol', dateCol);
      if (deptCol) formData.append('deptCol', deptCol);
      if (trainerCol) formData.append('trainerCol', trainerCol);
    }

    try {
      const response = await fetch('/api/training-matrix/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (data.success) {
        setResult({
          success: true,
          message: `Successfully processed ${data.summary.totalSuccess} records from ${data.summary.totalFiles} files.`,
          summary: data.summary
        });
        if (onSuccess) onSuccess();
      } else {
        setResult({ success: false, message: data.error || 'Failed to process files' });
      }
    } catch (error) {
      setResult({ success: false, message: 'An unexpected error occurred during processing.' });
    } finally {
      setUploading(false);
    }
  };

  const ColSelect = ({
    value, onChange, label, optional
  }: { value: string; onChange: (v: string) => void; label: string; optional?: boolean }) => (
    <div className="space-y-1">
      <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1">
        {label}
        {optional && <span className="text-gray-600 normal-case font-normal">(optional)</span>}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:ring-2 ring-teal-500/50 outline-none cursor-pointer"
      >
        <option value="">— Not mapped —</option>
        {availableColumns.map(col => (
          <option key={col} value={col}>{col}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div
        className="bg-[#0f0d1e] border border-indigo-500/20 rounded-[32px] w-full max-w-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-emerald-600 p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md">
              <Files className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Bulk Upload Training Matrix</h2>
              <p className="text-white/60 text-[10px] font-medium mt-0.5">Upload Excel (.xlsx) or Word (.docx)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
            <X className="h-6 w-6 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Drop Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            className={`cursor-pointer border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 transition-all ${
              files.length > 0
                ? 'border-teal-500/40 bg-teal-500/5'
                : 'border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 hover:border-indigo-500/40'
            }`}
          >
            {files.length > 0 ? (
              <>
                <div className="flex -space-x-4">
                  {files.slice(0, 3).map((_, i) => (
                    <div key={i} className="p-3 bg-teal-500/20 rounded-xl border border-teal-500/30 text-teal-400">
                      <FileText className="h-8 w-8" />
                    </div>
                  ))}
                </div>
                <div className="text-center">
                  <p className="text-teal-400 font-bold text-sm">{files[0].name}</p>
                  <p className="text-gray-500 text-xs mt-1">
                    {isExcel
                      ? `📊 Excel — ${sheetNames.length > 0 ? `${sheetNames.length} sheet${sheetNames.length > 1 ? 's' : ''} detected` : 'map columns below'}`
                      : '📄 Word doc — AI will extract'}
                  </p>
                  {isExcel && sheetNames.length > 1 && (
                    <p className="text-[10px] text-teal-600 mt-1 max-w-xs truncate">
                      {sheetNames.join(' · ')}
                    </p>
                  )}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setFiles([]); setShowPreview(false); setResult(null); setIsExcel(false); }}
                  className="text-[10px] font-bold text-gray-500 hover:text-rose-400 uppercase tracking-wide transition-colors"
                >
                  ✕ Remove
                </button>
              </>
            ) : (
              <>
                <div className="p-4 rounded-full bg-teal-500/10 text-teal-400">
                  <Upload className="h-8 w-8" />
                </div>
                <div className="text-center">
                  <p className="text-teal-100 font-bold text-sm">Drop your file here or click to browse</p>
                  <p className="text-gray-500 text-xs mt-1">.xlsx, .xls (Excel) or .docx (Word) supported</p>
                </div>
              </>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls,.docx"
              multiple
              className="hidden"
            />
          </div>

          {/* Excel Column Mapping */}
          {isExcel && showPreview && availableColumns.length > 0 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white/[0.03] rounded-2xl border border-white/5 p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-teal-500 shadow-[0_0_8px_#14b8a6]" />
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Map Your Columns</h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <ColSelect value={empCol} onChange={setEmpCol} label="Employee Name Column" />
                  <ColSelect value={sopCol} onChange={setSopCol} label="SOP Code Column" />
                  <ColSelect value={dateCol} onChange={setDateCol} label="Training Date Column" optional />
                  <ColSelect value={deptCol} onChange={setDeptCol} label="Department Column" optional />
                </div>
                <ColSelect value={trainerCol} onChange={setTrainerCol} label="Trainer Name Column" optional />
                <p className="text-[10px] text-gray-600">
                  💡 <strong className="text-gray-400">Employee Name</strong> and <strong className="text-gray-400">SOP Code</strong> are required to import records.
                </p>
              </div>

              {/* Data Preview */}
              <div className="bg-white/[0.03] rounded-2xl border border-white/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-teal-400" />
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    Preview (first {previewRows.length} rows)
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/5">
                        {availableColumns.map(col => (
                          <th
                            key={col}
                            className={`px-3 py-2 text-left font-black uppercase tracking-wide whitespace-nowrap ${
                              col === empCol ? 'text-teal-400' :
                              col === sopCol ? 'text-amber-400' :
                              col === dateCol ? 'text-blue-400' :
                              col === deptCol ? 'text-purple-400' :
                              col === trainerCol ? 'text-indigo-400' :
                              'text-gray-600'
                            }`}
                          >
                            {col === empCol ? '👤 ' : col === sopCol ? '📄 ' : col === dateCol ? '📅 ' : col === deptCol ? '🏢 ' : col === trainerCol ? '🏷 ' : ''}
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {previewRows.map((row, i) => (
                        <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                          {availableColumns.map(col => (
                            <td
                              key={col}
                              className={`px-3 py-2 whitespace-nowrap ${
                                col === empCol ? 'text-teal-300 font-medium' :
                                col === sopCol ? 'text-amber-300' :
                                col === dateCol ? 'text-blue-300' :
                                col === deptCol ? 'text-purple-300' :
                                col === trainerCol ? 'text-indigo-300' :
                                'text-gray-500'
                              }`}
                            >
                              {row[col]?.toString() || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Info for DOCX */}
          {!isExcel && (
            <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                AI-Powered Extraction
              </h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                Our system will scan your DOC file, identify training tables, and extract employee names, SOP codes, and training dates using Gemini AI.
              </p>
            </div>
          )}

          {result && (
            <div className={`p-4 rounded-xl flex items-start gap-3 border ${
              result.success
                ? 'bg-teal-500/10 border-teal-500/20 text-teal-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}>
              {result.success ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
              <div className="flex-1">
                <p className="text-xs font-bold mb-1">{result.success ? 'Success' : 'Failed'}</p>
                <p className="text-[11px] font-medium leading-relaxed opacity-80">{result.message}</p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 pt-0 flex gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-xl font-bold transition-all border border-white/5 uppercase tracking-widest text-[10px]"
          >
            Cancel
          </button>
          <button
            disabled={files.length === 0 || uploading || (isExcel && (!empCol || !sopCol))}
            onClick={handleUpload}
            title={isExcel && (!empCol || !sopCol) ? 'Select Employee Name and SOP Code columns first' : ''}
            className="flex-1 py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
          >
            {uploading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Processing...</>
            ) : (
              'Start Bulk Process'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
