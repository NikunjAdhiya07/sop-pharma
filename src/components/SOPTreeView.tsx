'use client';

import React, { useState, useEffect } from 'react';
import { Folder, FolderOpen, ChevronRight, ChevronDown, FileText, Video, Brain, BookOpen, Eye, X } from 'lucide-react';

interface SOPNode {
  _id: string;
  sopId: string;
  sopName: string;
  sopIdentifier: string;
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
    totalMCQs: number;
  };
}

interface SubcategoryNode {
  name: string;
  code: string;
  sops: SOPNode[];
  totalSOPs: number;
  totalVideos: number;
  totalSlides: number;
}

interface DepartmentNode {
  name: string;
  subcategories: SubcategoryNode[];
  totalSOPs: number;
  totalVideos: number;
  totalSlides: number;
}

interface SOPTreeViewProps {
  tree: DepartmentNode[];
  searchTerm?: string;
  onViewSOP: (sop: SOPNode) => void;
}

export default function SOPTreeView({ tree, searchTerm = '', onViewSOP }: SOPTreeViewProps) {
  const [expandedSubcats, setExpandedSubcats] = useState<Set<string>>(new Set());
  
  // Full-screen department view (like MCQ Bank)
  const [fullScreenDept, setFullScreenDept] = useState<DepartmentNode | null>(null);

  // Modal dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const toggleSubcategory = (subcatKey: string) => {
    const newExpanded = new Set(expandedSubcats);
    if (newExpanded.has(subcatKey)) {
      newExpanded.delete(subcatKey);
    } else {
      newExpanded.add(subcatKey);
    }
    setExpandedSubcats(newExpanded);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - modalPosition.x,
      y: e.clientY - modalPosition.y
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setModalPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Add/remove mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  // Reset position when modal closes
  useEffect(() => {
    if (!fullScreenDept) {
      setModalPosition({ x: 0, y: 0 });
    }
  }, [fullScreenDept]);

  const matchesSOP = (sop: SOPNode) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      sop.sopName.toLowerCase().includes(term) ||
      sop.sopIdentifier.toLowerCase().includes(term)
    );
  };

  const matchesSubcategory = (subcat: SubcategoryNode) => {
    return subcat.sops.some(matchesSOP);
  };

  const matchesDepartment = (dept: DepartmentNode) => {
    return dept.subcategories.some(matchesSubcategory);
  };

  const filteredTree = tree.filter(matchesDepartment).map(dept => ({
    ...dept,
    subcategories: dept.subcategories.filter(matchesSubcategory).map(subcat => ({
      ...subcat,
      sops: subcat.sops.filter(matchesSOP)
    }))
  }));

  const getCompletionColor = (percentage: number) => {
    if (percentage >= 100) return 'text-green-400';
    if (percentage >= 66) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <>
      {/* Department Grid - Horizontal Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTree.map((dept) => (
          <div
            key={dept.name}
            className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 rounded-xl border border-purple-500/30 overflow-hidden hover:border-purple-500/50 transition-all cursor-pointer"
            onClick={() => setFullScreenDept(dept)}
          >
            {/* Department Header */}
            <div className="px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-all group">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-purple-400" />
                <div className="text-left">
                  <h3 className="text-base font-bold text-white">{dept.name}</h3>
                  <p className="text-xs text-gray-400">
                    {dept.totalSOPs} SOPs • {dept.totalVideos} Videos • {dept.totalSlides} Slides
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-purple-400" />
            </div>
          </div>
        ))}
      </div>

      {filteredTree.length === 0 && (
        <div className="text-center py-12">
          <BookOpen className="h-12 w-12 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-400">No SOPs found matching your search</p>
        </div>
      )}

      {/* Full-Screen Department Modal */}
      {fullScreenDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="bg-gradient-to-br from-slate-900/95 to-slate-800/95 rounded-2xl border border-purple-500/30 w-full max-w-7xl max-h-[90vh] overflow-hidden shadow-2xl backdrop-blur-md"
            style={{
              transform: `translate(${modalPosition.x}px, ${modalPosition.y}px)`,
              transition: isDragging ? 'none' : 'transform 0.2s ease-out'
            }}
          >
            {/* Modal Header */}
            <div 
              className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 px-6 py-4 border-b border-white/10 flex items-center justify-between cursor-move select-none"
              onMouseDown={handleMouseDown}
            >
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <FolderOpen className="h-6 w-6 text-purple-400" />
                  {fullScreenDept.name}
                </h2>
                <p className="text-sm text-gray-300 mt-1">
                  {fullScreenDept.totalSOPs} SOPs • {fullScreenDept.totalVideos} Videos • {fullScreenDept.totalSlides} Slides
                </p>
              </div>
              <button
                onClick={() => setFullScreenDept(null)}
                className="p-2 hover:bg-white/10 rounded-lg transition-all"
              >
                <X className="h-6 w-6 text-gray-300" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
              <div className="space-y-4">
                {fullScreenDept.subcategories.map((subcat) => {
                  const subcatKey = `${fullScreenDept.name}-${subcat.code}`;
                  return (
                    <div
                      key={subcatKey}
                      className="bg-gradient-to-br from-green-900/20 to-green-800/10 rounded-lg border border-green-500/20 overflow-hidden"
                    >
                      {/* Subcategory Header */}
                      <button
                        onClick={() => toggleSubcategory(subcatKey)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-all"
                      >
                        <div className="flex items-center gap-2">
                          {expandedSubcats.has(subcatKey) ? (
                            <FolderOpen className="h-5 w-5 text-green-400" />
                          ) : (
                            <Folder className="h-5 w-5 text-green-400" />
                          )}
                          <div className="text-left">
                            <h4 className="text-base font-semibold text-white">{subcat.name}</h4>
                            <p className="text-sm text-gray-400">
                              {subcat.totalSOPs} SOPs
                            </p>
                          </div>
                        </div>
                        {expandedSubcats.has(subcatKey) ? (
                          <ChevronDown className="h-5 w-5 text-green-400" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-green-400" />
                        )}
                      </button>

                      {/* SOPs Grid */}
                      {expandedSubcats.has(subcatKey) && (
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {subcat.sops.map((sop) => (
                            <div
                              key={sop._id}
                              className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-lg p-3 border border-white/10 hover:border-purple-500/50 transition-all cursor-pointer"
                              onClick={() => {
                                setFullScreenDept(null);
                                onViewSOP(sop);
                              }}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1 min-w-0">
                                  <h5 className="text-sm font-semibold text-white truncate" title={sop.sopName}>
                                    {sop.sopIdentifier}
                                  </h5>
                                  <p className="text-xs text-gray-400 truncate" title={sop.sopName}>
                                    {sop.sopName}
                                  </p>
                                </div>
                                <span className={`text-sm font-bold ml-2 ${getCompletionColor(sop.completionStatus.percentage)}`}>
                                  {sop.completionStatus.percentage}%
                                </span>
                              </div>

                              {/* Resource Icons */}
                              <div className="flex items-center gap-3 text-xs mb-3">
                                <div className={`flex items-center gap-1 ${sop.completionStatus.hasVideos ? 'text-green-400' : 'text-red-400'}`}>
                                  <Video className="h-3 w-3" />
                                  <span>{sop.videos.length}</span>
                                </div>
                                <div className={`flex items-center gap-1 ${sop.completionStatus.hasSlides ? 'text-green-400' : 'text-red-400'}`}>
                                  <FileText className="h-3 w-3" />
                                  <span>{sop.slides.length}</span>
                                </div>
                                <div className={`flex items-center gap-1 ${sop.completionStatus.hasMCQs ? 'text-green-400' : 'text-red-400'}`}>
                                  <Brain className="h-3 w-3" />
                                  <span>{sop.metadata.totalMCQs || 0}</span>
                                </div>
                                <div className={`flex items-center gap-1 ${sop.completionStatus.hasSOPDoc ? 'text-green-400' : 'text-gray-400'}`}>
                                  <BookOpen className="h-3 w-3" />
                                  <span>{sop.sopDocuments.length}</span>
                                </div>
                              </div>

                              {/* Action Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFullScreenDept(null);
                                  onViewSOP(sop);
                                }}
                                className="w-full py-2 px-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-semibold rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all flex items-center justify-center gap-1"
                              >
                                <Eye className="h-3 w-3" />
                                View Details
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
