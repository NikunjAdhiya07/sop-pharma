'use client';

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Video, Brain, Eye, BookOpen } from 'lucide-react';

interface SOPLibraryItem {
  _id: string;
  sopId: string;
  sopName: string;
  sopIdentifier: string;
  department: string;
  departmentCode: string;
  videos: any[];
  slides: any[];
  sopDocuments: any[];
  completionStatus: {
    hasVideos: boolean;
    hasSlides: boolean;
    hasMCQs: boolean;
    hasSOPDoc: boolean;
    percentage: number;
  };
  metadata: {
    views: number;
    totalMCQs: number;
  };
}

interface SubcategoryNode {
  code: string;
  name: string;
  sops: SOPLibraryItem[];
  totalSOPs: number;
  totalVideos: number;
  totalSlides: number;
  totalMCQs: number;
}

interface DepartmentNode {
  name: string;
  subcategories: SubcategoryNode[];
  totalSOPs: number;
  totalVideos: number;
  totalSlides: number;
  totalMCQs: number;
}

interface SOPLibraryTreeViewProps {
  tree: DepartmentNode[];
  searchTerm?: string;
  onViewSOP: (sop: SOPLibraryItem) => void;
}

export default function SOPLibraryTreeView({ tree, searchTerm = '', onViewSOP }: SOPLibraryTreeViewProps) {
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [expandedSubcats, setExpandedSubcats] = useState<Set<string>>(new Set());
  const [fullScreenDept, setFullScreenDept] = useState<DepartmentNode | null>(null);
  
  // Drag state for modal
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });

  const toggleDepartment = (deptName: string) => {
    const newExpanded = new Set(expandedDepts);
    if (newExpanded.has(deptName)) {
      newExpanded.delete(deptName);
    } else {
      newExpanded.add(deptName);
    }
    setExpandedDepts(newExpanded);
  };

  const toggleSubcategory = (key: string) => {
    const newExpanded = new Set(expandedSubcats);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedSubcats(newExpanded);
  };

  const getCompletionColor = (percentage: number) => {
    if (percentage >= 100) return 'text-green-400';
    if (percentage >= 66) return 'text-yellow-400';
    return 'text-red-400';
  };

  // Filter tree based on search term
  const filteredTree = tree.map(dept => {
    if (!searchTerm) return dept;
    
    const filteredSubcategories = dept.subcategories.map(subcat => {
      const filteredSOPs = subcat.sops.filter(sop =>
        sop.sopName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sop.sopIdentifier.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      return {
        ...subcat,
        sops: filteredSOPs,
        totalSOPs: filteredSOPs.length
      };
    }).filter(subcat => subcat.totalSOPs > 0);
    
    return {
      ...dept,
      subcategories: filteredSubcategories,
      totalSOPs: filteredSubcategories.reduce((sum, subcat) => sum + subcat.totalSOPs, 0)
    };
  }).filter(dept => dept.totalSOPs > 0);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.modal-header')) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - modalPosition.x,
        y: e.clientY - modalPosition.y
      });
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setModalPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

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
        <p className="text-gray-500 text-sm">Sync library to populate the SOP Library</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Departments Grid - 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTree.map((dept) => (
          <div key={dept.name} className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 hover:border-purple-500/50 transition-all duration-300 transform hover:scale-[1.02] shadow-xl overflow-hidden cursor-pointer">
            {/* Department Header - Click to open full screen */}
            <button
              onClick={() => setFullScreenDept(dept)}
              className="w-full px-5 py-4 flex flex-col gap-3 hover:bg-white/5 transition-all group"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <Folder className="h-6 w-6 text-purple-400" />
                  <h3 className="text-lg font-bold text-white group-hover:text-purple-300 transition-colors">
                    {dept.name}
                  </h3>
                </div>
                <ChevronRight className="h-5 w-5 text-purple-400 flex-shrink-0" />
              </div>
              
              <div className="flex items-center justify-between w-full text-sm">
                <div className="text-left space-y-1">
                  <p className="text-gray-300">
                    {dept.totalSOPs} SOP{dept.totalSOPs !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-gray-400">
                    {dept.totalVideos} Videos • {dept.totalSlides} Slides
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-purple-400">{dept.subcategories?.length || 0}</span>
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
          className="fixed rounded-2xl border border-purple-500/30 w-full max-w-7xl max-h-[90vh] overflow-hidden shadow-2xl bg-gradient-to-br from-slate-900 to-slate-800"
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
          <div className="modal-header bg-gradient-to-r from-purple-900/50 to-pink-900/50 px-6 py-4 border-b border-white/10 flex items-center justify-between cursor-grab active:cursor-grabbing select-none">
            <div className="flex items-center gap-3">
              <FolderOpen className="h-7 w-7 text-purple-400" />
              <div>
                <h2 className="text-2xl font-bold text-white">{fullScreenDept.name}</h2>
                <p className="text-sm text-gray-400">
                  {fullScreenDept.totalSOPs} SOPs • {fullScreenDept.subcategories?.length || 0} Categories
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
                  const subcatKey = `${fullScreenDept.name}-${subcat.code}`;
                  const isSubcatExpanded = expandedSubcats.has(subcatKey);

                  return (
                    <div key={subcatKey} className="bg-gradient-to-br from-purple-900/20 to-pink-900/10 rounded-xl border border-purple-500/20 overflow-hidden">
                      {/* Subcategory Header */}
                      <button
                        onClick={() => toggleSubcategory(subcatKey)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          {isSubcatExpanded ? (
                            <ChevronDown className="h-4 w-4 text-purple-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-purple-400" />
                          )}
                          {isSubcatExpanded ? (
                            <FolderOpen className="h-5 w-5 text-purple-400" />
                          ) : (
                            <Folder className="h-5 w-5 text-purple-400" />
                          )}
                          <div className="text-left">
                            <h4 className="text-base font-semibold text-white group-hover:text-purple-300 transition-colors">
                              {subcat.name}
                            </h4>
                            <p className="text-xs text-gray-400">
                              {subcat.totalSOPs} SOP{subcat.totalSOPs !== 1 ? 's' : ''} • {subcat.totalVideos} Videos • {subcat.totalSlides} Slides
                            </p>
                          </div>
                        </div>
                      </button>

                      {/* SOPs Grid */}
                      {isSubcatExpanded && (
                        <div className="px-4 pb-4 bg-black/10">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                            {(subcat.sops || []).map((sop) => (
                              <div 
                                key={sop._id} 
                                className="bg-slate-800/50 rounded-lg border border-slate-600/30 overflow-hidden hover:border-purple-500/50 transition-all cursor-pointer"
                                onClick={() => onViewSOP(sop)}
                              >
                                {/* SOP Header */}
                                <div className="px-3 py-2">
                                  <div className="flex items-start justify-between mb-1">
                                    <div className="flex-1 min-w-0">
                                      <h5 className="text-xs font-semibold text-white truncate" title={sop.sopName}>
                                        {sop.sopName}
                                      </h5>
                                      <p className="text-[10px] text-gray-400 font-mono">
                                        {sop.sopIdentifier}
                                      </p>
                                    </div>
                                    <span className={`text-sm font-bold ml-2 ${getCompletionColor(sop.completionStatus.percentage)}`}>
                                      {sop.completionStatus.percentage}%
                                    </span>
                                  </div>

                                  {/* Resource Icons */}
                                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                                    {/* Videos */}
                                    <div className={`flex items-center gap-1.5 p-1.5 rounded text-[9px] ${
                                      sop.completionStatus.hasVideos 
                                        ? 'bg-green-500/20 text-green-400' 
                                        : 'bg-red-500/10 text-red-400'
                                    }`}>
                                      <Video className="h-3 w-3" />
                                      <span>{sop.videos.length}</span>
                                    </div>

                                    {/* Slides */}
                                    <div className={`flex items-center gap-1.5 p-1.5 rounded text-[9px] ${
                                      sop.completionStatus.hasSlides 
                                        ? 'bg-green-500/20 text-green-400' 
                                        : 'bg-red-500/10 text-red-400'
                                    }`}>
                                      <FileText className="h-3 w-3" />
                                      <span>{sop.slides.length}</span>
                                    </div>

                                    {/* MCQs */}
                                    <div className={`flex items-center gap-1.5 p-1.5 rounded text-[9px] ${
                                      sop.completionStatus.hasMCQs 
                                        ? 'bg-green-500/20 text-green-400' 
                                        : 'bg-red-500/10 text-red-400'
                                    }`}>
                                      <Brain className="h-3 w-3" />
                                      <span>{sop.metadata.totalMCQs || 0}</span>
                                    </div>

                                    {/* SOP Doc */}
                                    <div className={`flex items-center gap-1.5 p-1.5 rounded text-[9px] ${
                                      sop.completionStatus.hasSOPDoc 
                                        ? 'bg-green-500/20 text-green-400' 
                                        : 'bg-gray-500/10 text-gray-400'
                                    }`}>
                                      <BookOpen className="h-3 w-3" />
                                      <span>{sop.sopDocuments.length}</span>
                                    </div>
                                  </div>

                                  {/* View Button */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onViewSOP(sop);
                                    }}
                                    className="w-full mt-2 px-2 py-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-[10px] rounded transition-colors flex items-center justify-center gap-1 hover:from-purple-700 hover:to-pink-700"
                                  >
                                    <Eye className="h-2.5 w-2.5" />
                                    View Details
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
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
