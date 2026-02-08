'use client';

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Download, Eye, Calendar } from 'lucide-react';

interface SOPDocument {
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

// New Interfaces
interface SOPFolderNode {
  name: string;
  path: string;
  sops: SOPDocument[];
}

interface SubcategoryNode {
  name: string;
  totalSOPs: number;
  sopFolders: SOPFolderNode[];
}

interface DepartmentNode {
  name: string;
  subcategories: SubcategoryNode[];
  totalSOPs: number;
}

interface SOPTreeViewProps {
  tree: DepartmentNode[];
  searchTerm?: string;
  onViewDocument: (sop: SOPDocument) => void;
  onDownloadDocument: (sop: SOPDocument) => void;
}

export default function SOPTreeView({ tree, searchTerm = '', onViewDocument, onDownloadDocument }: SOPTreeViewProps) {
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set());
  const [expandedSOPFolders, setExpandedSOPFolders] = useState<Set<string>>(new Set());
  const [expandedSOPs, setExpandedSOPs] = useState<Set<string>>(new Set());
  const [fullScreenDept, setFullScreenDept] = useState<DepartmentNode | null>(null);
  
  // Drag state for modal
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });

  const toggleDepartment = (deptName: string) => {
    const newExpanded = new Set(expandedDepts);
    if (newExpanded.has(deptName)) newExpanded.delete(deptName);
    else newExpanded.add(deptName);
    setExpandedDepts(newExpanded);
  };

  const toggleSubcategory = (key: string) => {
    const newExpanded = new Set(expandedSubcategories);
    if (newExpanded.has(key)) newExpanded.delete(key);
    else newExpanded.add(key);
    setExpandedSubcategories(newExpanded);
  };
  
  const toggleSOPFolder = (key: string) => {
    const newExpanded = new Set(expandedSOPFolders);
    if (newExpanded.has(key)) newExpanded.delete(key);
    else newExpanded.add(key);
    setExpandedSOPFolders(newExpanded);
  };

  const toggleSOP = (sopId: string) => {
    const newExpanded = new Set(expandedSOPs);
    if (newExpanded.has(sopId)) newExpanded.delete(sopId);
    else newExpanded.add(sopId);
    setExpandedSOPs(newExpanded);
  };

  // Drag handlers (omitted for brevity, assume they are same as before)
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.modal-header')) {
      setIsDragging(true);
      setDragOffset({ x: e.clientX - modalPosition.x, y: e.clientY - modalPosition.y });
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setModalPosition({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  React.useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  // Handle empty or undefined tree
  if (!tree || tree.length === 0) {
    return (
      <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10">
        <FolderOpen className="h-16 w-16 text-gray-500 mx-auto mb-4" />
        <p className="text-gray-400 text-lg mb-2">No SOPs found</p>
        <p className="text-gray-500 text-sm">Upload folders to populate the Master SOP Repository</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Total SOP Count Banner */}
      <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-green-400" />
            <div>
              <h3 className="text-lg font-bold text-white">Total SOPs</h3>
              <p className="text-sm text-gray-400">Across all departments</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold text-green-400">
              {tree.reduce((total, dept) => total + dept.totalSOPs, 0)}
            </p>
            <p className="text-xs text-gray-400">{tree.length} Departments</p>
          </div>
        </div>
      </div>

      {/* Departments Grid - 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tree.map((dept) => (
          <div key={dept.name} className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 hover:border-green-500/50 transition-all duration-300 transform hover:scale-[1.03] hover:shadow-2xl hover:shadow-green-500/20 shadow-xl overflow-hidden cursor-pointer">
            {/* Department Header - Click to open full screen */}
            <button
              onClick={() => setFullScreenDept(dept)}
              className="w-full px-5 py-4 flex flex-col gap-3 hover:bg-white/5 transition-all group"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <Folder className="h-6 w-6 text-green-400" />
                  <h3 className="text-lg font-bold text-white group-hover:text-green-300 transition-colors">
                    {dept.name}
                  </h3>
                </div>
                <ChevronRight className="h-5 w-5 text-green-400 flex-shrink-0" />
              </div>
              
              <div className="flex items-center justify-between w-full text-sm">
                <div className="text-left">
                  <p className="text-gray-300">
                    {dept.totalSOPs} SOP{dept.totalSOPs !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-green-400">{dept.subcategories?.length || 0}</span>
                  <p className="text-xs text-gray-400">Categories</p>
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>

      {/* Full-Screen Department Modal - Draggable, No Background */}
      {fullScreenDept && (
        <div 
          className="fixed rounded-2xl border border-green-500/30 w-full max-w-7xl max-h-[90vh] overflow-hidden shadow-2xl bg-gradient-to-br from-slate-900 to-slate-800"
          style={{
            top: '50%',
            left: '50%',
            transform: `translate(calc(-50% + ${modalPosition.x}px), calc(-50% + ${modalPosition.y}px))`,
            cursor: isDragging ? 'grabbing' : 'default',
            zIndex: 9999
          }}
          onMouseDown={handleMouseDown}
        >
          {/* Modal Header - Draggable */}
          <div className="modal-header bg-gradient-to-r from-green-900/50 to-emerald-900/50 px-6 py-4 border-b border-white/10 flex items-center justify-between cursor-grab active:cursor-grabbing select-none">
            <div className="flex items-center gap-3">
              <FolderOpen className="h-7 w-7 text-green-400" />
              <div>
                <h2 className="text-2xl font-bold text-white">{fullScreenDept.name}</h2>
                <p className="text-sm text-gray-400">
                  {fullScreenDept.totalSOPs} SOPs • {fullScreenDept.subcategories?.length || 0} Subcategories
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setFullScreenDept(null);
                setModalPosition({ x: 0, y: 0 });
              }}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <ChevronDown className="h-6 w-6 text-gray-400 hover:text-white rotate-180" />
            </button>
          </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto max-h-[calc(90vh-100px)] p-6">
              <div className="space-y-4">
                {(fullScreenDept.subcategories || []).map((subcat) => {
                   const subcatKey = `${fullScreenDept.name}-${subcat.name}`;
                   const isSubcatExpanded = expandedSubcategories.has(subcatKey);

                   return (
                     <div key={subcatKey} className="bg-gradient-to-br from-green-900/20 to-green-800/10 rounded-xl border border-green-500/20 overflow-hidden hover:border-green-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/10">
                       {/* Subcategory Header */}
                       <button
                         onClick={() => toggleSubcategory(subcatKey)}
                         className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-all group"
                       >
                         <div className="flex items-center gap-3">
                           {isSubcatExpanded ? <ChevronDown className="h-4 w-4 text-green-400" /> : <ChevronRight className="h-4 w-4 text-green-400" />}
                           <Folder className="h-5 w-5 text-green-400" />
                           <div className="text-left">
                             <h4 className="text-base font-semibold text-white group-hover:text-green-300 transition-colors">
                               {subcat.name}
                             </h4>
                             <p className="text-xs text-gray-400">
                               {subcat.totalSOPs} SOP{subcat.totalSOPs !== 1 ? 's' : ''}
                             </p>
                           </div>
                         </div>
                       </button>

                       {/* SOP Folders */}
                       {isSubcatExpanded && (
                         <div className="px-4 pb-4 space-y-2">
                           {(subcat.sopFolders || []).map(folder => {
                             const folderKey = `${subcatKey}-${folder.name}`;
                             const isFolderExpanded = expandedSOPFolders.has(folderKey);
                             
                             return (
                               <div key={folder.name} className="ml-4 border-l-2 border-green-500/20 pl-4 mt-2">
                                  <button 
                                    onClick={() => toggleSOPFolder(folderKey)}
                                    className="flex items-center gap-2 w-full text-left py-1 hover:text-green-300 transition-colors"
                                  >
                                    {isFolderExpanded ? <ChevronDown className="h-3 w-3 text-gray-400" /> : <ChevronRight className="h-3 w-3 text-gray-400" />}
                                    <FolderOpen className="h-4 w-4 text-green-500/80" />
                                    <span className="text-sm font-medium text-gray-200">{folder.name}</span>
                                  </button>
                                  
                                  {/* SOPs Grid */}
                                  {isFolderExpanded && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                                      {(folder.sops || []).map((sop) => {
                                        const isSOPExpanded = expandedSOPs.has(sop._id);
                                        return (
                                          <div key={sop._id} className="bg-slate-800/50 rounded-lg border border-slate-600/30 overflow-hidden hover:border-green-500/50 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-lg hover:shadow-green-500/10 hover:bg-slate-800/80">
                                            {/* SOP Header - Compact */}
                                            <button
                                              onClick={() => toggleSOP(sop._id)}
                                              className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-all group"
                                              title={`${sop.sopIdentifier} – ${sop.sopName}`}
                                            >
                                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                                {isSOPExpanded ? (
                                                  <ChevronDown className="h-3 w-3 text-green-400 flex-shrink-0" />
                                                ) : (
                                                  <ChevronRight className="h-3 w-3 text-green-400 flex-shrink-0" />
                                                )}
                                                <FileText className="h-3 w-3 text-green-400 flex-shrink-0" />
                                                <div className="text-left flex-1 min-w-0">
                                                  <h5 className="text-xs font-semibold text-white group-hover:text-green-300 transition-colors truncate">
                                                    {sop.sopIdentifier}
                                                  </h5>
                                                  <p className="text-[10px] text-gray-400 truncate">
                                                    {sop.sopName}
                                                  </p>
                                                </div>
                                              </div>
                                            </button>

                                            {/* SOP Details */}
                                            {isSOPExpanded && (
                                              <div className="px-3 pb-2 space-y-2 bg-slate-900/30 border-t border-slate-600/30">
                                                {/* File Info */}
                                                <div className="p-2 bg-blue-900/20 rounded border border-blue-500/20">
                                                  <div className="flex items-center gap-2 mb-1">
                                                    <FileText className="h-3 w-3 text-blue-400 flex-shrink-0" />
                                                    <span className="text-[10px] text-gray-300 truncate">
                                                      {sop.sopDocument.fileName}
                                                    </span>
                                                  </div>
                                                  <div className="flex items-center justify-between text-[9px] text-gray-400">
                                                    <span>{(sop.sopDocument.fileSize / 1024).toFixed(1)} KB</span>
                                                    <span>{new Date(sop.sopDocument.uploadedAt).toLocaleDateString()}</span>
                                                  </div>
                                                </div>

                                                {/* Metadata */}
                                                {(sop.metadata.effectiveDate || sop.metadata.reviewDate) && (
                                                  <div className="p-2 bg-purple-900/20 rounded border border-purple-500/20 space-y-1">
                                                    {sop.metadata.effectiveDate && (
                                                      <div className="flex items-center justify-between text-[9px]">
                                                        <span className="text-gray-400">Effective:</span>
                                                        <span className="text-gray-300">{new Date(sop.metadata.effectiveDate).toLocaleDateString()}</span>
                                                      </div>
                                                    )}
                                                    {sop.metadata.reviewDate && (
                                                      <div className="flex items-center justify-between text-[9px]">
                                                        <span className="text-gray-400">Review:</span>
                                                        <span className="text-gray-300">{new Date(sop.metadata.reviewDate).toLocaleDateString()}</span>
                                                      </div>
                                                    )}
                                                  </div>
                                                )}

                                                {/* Action Buttons */}
                                                <div className="flex gap-2">
                                                  <button
                                                    onClick={() => onViewDocument(sop)}
                                                    className="flex-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-[10px] rounded transition-colors flex items-center justify-center gap-1"
                                                  >
                                                    <Eye className="h-2.5 w-2.5" />
                                                    View
                                                  </button>
                                                  <button
                                                    onClick={() => onDownloadDocument(sop)}
                                                    className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] rounded transition-colors flex items-center justify-center gap-1"
                                                  >
                                                    <Download className="h-2.5 w-2.5" />
                                                    Download
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                               </div>
                             );
                           })}
                         </div>
                       )}
                     </div>
                   );
                 })}
              </div>
            </div>
          </div>
      )}
    </div>
  );
}
