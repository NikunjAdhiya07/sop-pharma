'use client';
import { X, CheckCircle2, ChevronRight, UploadCloud, AlertTriangle, FileText, Download, Eye } from 'lucide-react';
import { useState } from 'react';
import { fileKindFromStoredPath, fileKindToLabel } from '@/lib/filePathFileKind';
import { buildViewDocHref, buildDocxDownloadHref, buildPdfDownloadHref } from '@/lib/viewDocLinks';

export default function SOPDetailPanel({ sop, onClose }: any) {
  const [dragActive, setDragActive] = useState(false);
  const [uploadOptions, setUploadOptions] = useState({
    pdf: false, docx: false, videos: false, slides: false, english: false, gujarati: false
  });

  if (!sop) return null;

  const handleDrag = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    // Stub upload logic for now
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      alert(`File dropped for SOP ${sop.sopNo}. Checkboxes selected: \n` + 
            Object.keys(uploadOptions).filter((k) => (uploadOptions as any)[k]).join(', '));
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[500px] bg-white shadow-2xl z-50 transform transition-transform border-l border-gray-200 overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <span className="text-purple-600 font-mono text-base">{sop.sopNo}</span>
          </h2>
          <p className="text-sm font-semibold text-gray-500 mt-1">{sop.sopName}</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Main Content */}
      <div className="p-5 flex flex-col gap-6">
        
        {/* Core Details Grid */}
        <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 border border-gray-100 p-4 rounded-xl">
          <div>
            <p className="text-gray-400 font-semibold uppercase text-xs">Department</p>
            <p className="font-bold text-gray-700">{sop.department}</p>
          </div>
          <div>
            <p className="text-gray-400 font-semibold uppercase text-xs">Version History</p>
            <p className="font-bold text-gray-700">Current: v{sop.version || '1'}</p>
            <div className="flex gap-1 mt-1">
              {sop.previousVersionsStatus?.map((pv: any, i: any) => (
                <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${pv.available ? 'bg-emerald-100 text-emerald-700' : 'bg-red-50 text-red-500 line-through'}`}>v{pv.version}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-gray-400 font-semibold uppercase text-xs">Languages</p>
            <p className="font-bold text-gray-700">{sop.language || 'English'}</p>
          </div>
          <div>
            <p className="text-gray-400 font-semibold uppercase text-xs">Assigned Trainers</p>
            <p className="font-bold text-gray-700 truncate" title={sop.assignedTrainer}>{sop.assignedTrainer || 'None'}</p>
          </div>
        </div>

        {/* Media & Expiry */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-gray-400 font-semibold uppercase text-xs">Training Media</p>
            <div className="flex items-center gap-2 text-sm font-bold">
              {sop.mediaStatus?.videos ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-4 w-4"/> Video</span> : <span className="text-gray-400 line-through">Video</span>}
              {sop.mediaStatus?.slides ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-4 w-4"/> Slides</span> : <span className="text-gray-400 line-through">Slides</span>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
             <p className="text-gray-400 font-semibold uppercase text-xs">Review Expiry</p>
             <div className="text-sm font-bold text-gray-800">
               {sop.expiryDate ? new Date(sop.expiryDate).toLocaleDateString() : 'Not set'}
             </div>
          </div>
        </div>

        {/* Files – grouped by language, open directly */}
        <div>
          <p className="text-gray-400 font-semibold uppercase text-xs mb-3">Linked Documents (click to open)</p>
          {(() => {
            const allDocs: Array<{ fileName: string; filePath: string; fileType?: string; fileSize?: number; language?: string }> = [];
            if (sop.sopFile) {
              allDocs.push({
                fileName: sop.sopFile.fileName,
                filePath: sop.sopFile.filePath,
                fileType: sop.sopFile.fileType,
                fileSize: sop.sopFile.fileSize,
                language: sop.sopFile.language || 'English',
              });
            }
            (sop.sopDocuments || []).forEach((doc: any) => {
              if (!doc.filePath) return;
              const lang = doc.language || 'English';
              const already = allDocs.some((d: any) => d.filePath === doc.filePath && (d.language || 'English') === lang);
              if (!already) {
                allDocs.push({
                  fileName: doc.fileName,
                  filePath: doc.filePath,
                  fileType: doc.fileType,
                  fileSize: doc.fileSize,
                  language: lang,
                });
              }
            });
            if (sop.englishVersion && sop.gujaratiVersion && allDocs.length > 0) {
              const eng = allDocs.filter((d: any) => (d.language || 'English') === 'English');
              const guj = allDocs.filter((d: any) => d.language === 'Gujarati');
              if (eng.length === 0 && guj.length > 0) guj.forEach((d: any) => allDocs.push({ ...d, language: 'English' }));
              else if (guj.length === 0 && eng.length > 0) eng.forEach((d: any) => allDocs.push({ ...d, language: 'Gujarati' }));
            }
            const previewHref = (path: string, fileType?: string, lang?: string) => {
              const kind = fileKindFromStoredPath(path, fileType);
              if (kind === 'docx' || kind === 'doc' || kind === 'pdf') {
                return buildViewDocHref(path, sop.sopNo, lang);
              }
              const dl = new URLSearchParams();
              dl.set('path', path);
              dl.set('open', '1');
              if (sop.sopNo) dl.set('identifier', sop.sopNo);
              if (lang) dl.set('language', lang);
              return `/api/files/download?${dl.toString()}`;
            };
            const byLang = { English: allDocs.filter((d: any) => (d.language || 'English') === 'English'), Gujarati: allDocs.filter((d: any) => d.language === 'Gujarati') };
            if (allDocs.length === 0) {
              return <div className="text-xs text-gray-500 italic">No document files attached.</div>;
            }
            return (
              <div className="flex flex-col gap-4">
                {byLang.English.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">English</p>
                    <div className="flex flex-col gap-2">
                      {byLang.English.map((doc: any, idx: number) => {
                        const effKind = fileKindFromStoredPath(doc.filePath, doc.fileType);
                        const effLabel = fileKindToLabel(effKind);
                        const docxDl =
                          effKind === 'docx' || effKind === 'doc'
                            ? buildDocxDownloadHref(doc.filePath, sop.sopNo, 'English')
                            : null;
                        const pdfDl = effKind === 'pdf' ? buildPdfDownloadHref(doc.filePath, sop.sopNo, 'English') : null;
                        return (
                        <div key={idx} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className={`shrink-0 rounded p-1.5 ${effKind === 'pdf' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-bold text-gray-700" title={doc.fileName}>{doc.fileName}</p>
                              <p className="text-[10px] font-mono uppercase text-gray-400">{effLabel} • {Math.round((doc.fileSize || 0) / 1024)} KB</p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <a href={previewHref(doc.filePath, doc.fileType, 'English')} target="_blank" rel="noopener noreferrer" className="rounded p-1.5 text-purple-600 hover:bg-purple-50" title="Preview">
                              <Eye className="h-4 w-4" />
                            </a>
                            {docxDl ? (
                              <a href={docxDl} className="rounded p-1.5 text-blue-600 hover:bg-blue-50" title="Download DOCX">
                                <Download className="h-4 w-4" />
                              </a>
                            ) : null}
                            {pdfDl ? (
                              <a href={pdfDl} className="rounded p-1.5 text-slate-600 hover:bg-slate-100" title="Download PDF">
                                <Download className="h-4 w-4" />
                              </a>
                            ) : null}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {byLang.Gujarati.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Gujarati</p>
                    <div className="flex flex-col gap-2">
                      {byLang.Gujarati.map((doc: any, idx: number) => {
                        const effKind = fileKindFromStoredPath(doc.filePath, doc.fileType);
                        const effLabel = fileKindToLabel(effKind);
                        const docxDlG =
                          effKind === 'docx' || effKind === 'doc'
                            ? buildDocxDownloadHref(doc.filePath, sop.sopNo, 'Gujarati')
                            : null;
                        const pdfDlG = effKind === 'pdf' ? buildPdfDownloadHref(doc.filePath, sop.sopNo, 'Gujarati') : null;
                        return (
                        <div key={idx} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className={`shrink-0 rounded p-1.5 ${effKind === 'pdf' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-bold text-gray-700" title={doc.fileName}>{doc.fileName}</p>
                              <p className="text-[10px] font-mono uppercase text-gray-400">{effLabel} • {Math.round((doc.fileSize || 0) / 1024)} KB</p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <a href={previewHref(doc.filePath, doc.fileType, 'Gujarati')} target="_blank" rel="noopener noreferrer" className="rounded p-1.5 text-indigo-600 hover:bg-indigo-50" title="Preview">
                              <Eye className="h-4 w-4" />
                            </a>
                            {docxDlG ? (
                              <a href={docxDlG} className="rounded p-1.5 text-blue-600 hover:bg-blue-50" title="Download DOCX">
                                <Download className="h-4 w-4" />
                              </a>
                            ) : null}
                            {pdfDlG ? (
                              <a href={pdfDlG} className="rounded p-1.5 text-slate-600 hover:bg-slate-100" title="Download PDF">
                                <Download className="h-4 w-4" />
                              </a>
                            ) : null}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
        
        {/* Upload Section */}
        <div className="mt-4 border-t border-gray-200 pt-5">
           <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
             <UploadCloud className="h-4 w-4 text-purple-600" /> Auto-Attach Upload Area
           </h3>
           
           {/* Checkboxes */}
           <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4 text-sm font-semibold text-gray-600">
             <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">File Type</p>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={uploadOptions.pdf} onChange={()=>setUploadOptions(o=>({...o,pdf:!o.pdf}))} className="rounded text-purple-600 focus:ring-purple-500" /> PDF</label>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={uploadOptions.docx} onChange={()=>setUploadOptions(o=>({...o,docx:!o.docx}))} className="rounded text-purple-600 focus:ring-purple-500" /> DOCX</label>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={uploadOptions.videos} onChange={()=>setUploadOptions(o=>({...o,videos:!o.videos}))} className="rounded text-purple-600 focus:ring-purple-500" /> Videos</label>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={uploadOptions.slides} onChange={()=>setUploadOptions(o=>({...o,slides:!o.slides}))} className="rounded text-purple-600 focus:ring-purple-500" /> Slides</label>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Language mapping</p>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={uploadOptions.english} onChange={()=>setUploadOptions(o=>({...o,english:!o.english}))} className="rounded text-purple-600 focus:ring-purple-500" /> English</label>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={uploadOptions.gujarati} onChange={()=>setUploadOptions(o=>({...o,gujarati:!o.gujarati}))} className="rounded text-purple-600 focus:ring-purple-500" /> Gujarati</label>
                </div>
             </div>
           </div>

           {/* Drag / Drop Zone */}
           <div 
             onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
             className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${dragActive ? 'border-purple-500 bg-purple-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400'}`}
           >
             <UploadCloud className={`h-8 w-8 mx-auto mb-3 ${dragActive ? 'text-purple-600' : 'text-gray-400'}`} />
             <p className="text-sm font-bold text-gray-700">Drag & Drop files here</p>
             <p className="text-xs font-semibold text-gray-400 mt-1">Files automatically link to {sop.sopNo}</p>
             <input type="file" multiple className="hidden" id="file-upload" onChange={(e) => {
               if(e.target.files?.length) alert('File selected: ' + e.target.files[0].name);
             }}/>
             <label htmlFor="file-upload" className="mt-4 inline-block bg-purple-600 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-md cursor-pointer hover:bg-purple-700 transition">
               Browse Files
             </label>
           </div>
        </div>
      </div>
    </div>
  );
}
