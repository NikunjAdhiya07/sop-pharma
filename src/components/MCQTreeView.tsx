'use client';

import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, BookOpen, Download, Eye, SortAsc, SortDesc } from 'lucide-react';

interface SOPNode {
  sopId: string;
  sopCode: string;
  sopName: string;
  sopFileUrl: string;
  sopFileType: 'pdf' | 'docx';
  mcqBanks: any[];
  totalQuestions: number;
}

interface SubcategoryNode {
  code: string;
  name: string;
  sops: SOPNode[];
  totalSOPs: number;
  totalQuestions: number;
}

interface DepartmentNode {
  type: 'department';
  name: string;
  totalSOPs: number;
  totalQuestions: number;
  subcategories: SubcategoryNode[];
}

interface MCQTreeViewProps {
  tree: DepartmentNode[];
  unorganized: {
    sops: SOPNode[];
    totalSOPs: number;
    totalQuestions: number;
  };
  searchTerm?: string;
  onViewMCQs: (sopNode: SOPNode) => void;
  onDownloadSOP: (sopNode: SOPNode) => void;
}


export default function MCQTreeView({ tree, unorganized, searchTerm = '', onViewMCQs, onDownloadSOP }: MCQTreeViewProps) {
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [expandedSubcats, setExpandedSubcats] = useState<Set<string>>(new Set());
  const [expandedSOPs, setExpandedSOPs] = useState<Set<string>>(new Set());
  const [isUnorganizedExpanded, setIsUnorganizedExpanded] = useState(false);
  
  // Full-screen department view
  const [fullScreenDept, setFullScreenDept] = useState<DepartmentNode | null>(null);
  
  // Modal dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Sort state for each department
  const [deptSortBy, setDeptSortBy] = useState<Record<string, 'name' | 'sops' | 'questions'>>({});
  const [deptSortOrder, setDeptSortOrder] = useState<Record<string, 'asc' | 'desc'>>({});
  
  // Sort state for each subcategory
  const [subcatSortBy, setSubcatSortBy] = useState<Record<string, 'name' | 'questions'>>({});
  const [subcatSortOrder, setSubcatSortOrder] = useState<Record<string, 'asc' | 'desc'>>({});
  
  // Efficient search filter function
  const searchLower = searchTerm.toLowerCase().trim();
  
  const matchesSOP = (sop: SOPNode): boolean => {
    if (!searchLower) return true;
    return (
      sop.sopName.toLowerCase().includes(searchLower) ||
      sop.sopCode.toLowerCase().includes(searchLower) ||
      sop.sopId.toLowerCase().includes(searchLower)
    );
  };
  
  const matchesSubcategory = (subcat: SubcategoryNode): boolean => {
    if (!searchLower) return true;
    // Match if subcategory name/code matches OR any SOP within it matches
    const subcatMatch = subcat.name.toLowerCase().includes(searchLower) || 
                        subcat.code.toLowerCase().includes(searchLower);
    const sopMatch = subcat.sops.some(matchesSOP);
    return subcatMatch || sopMatch;
  };
  
  const matchesDepartment = (dept: DepartmentNode): boolean => {
    if (!searchLower) return true;
    // Match if department name matches OR any subcategory within it matches
    const deptMatch = dept.name.toLowerCase().includes(searchLower);
    const subcatMatch = dept.subcategories.some(matchesSubcategory);
    return deptMatch || subcatMatch;
  };
  
  // Sorting functions
  const sortSubcategories = (subcats: SubcategoryNode[], deptName: string): SubcategoryNode[] => {
    const sortBy = deptSortBy[deptName] || 'name';
    const sortOrder = deptSortOrder[deptName] || 'asc';
    
    return [...subcats].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'sops':
          comparison = a.totalSOPs - b.totalSOPs;
          break;
        case 'questions':
          comparison = a.totalQuestions - b.totalQuestions;
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };
  
  const sortSOPs = (sops: SOPNode[], subcatKey: string): SOPNode[] => {
    const sortBy = subcatSortBy[subcatKey] || 'name';
    const sortOrder = subcatSortOrder[subcatKey] || 'asc';
    
    return [...sops].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.sopName.localeCompare(b.sopName);
          break;
        case 'questions':
          comparison = a.totalQuestions - b.totalQuestions;
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };
  
  const toggleDeptSort = (deptName: string, sortType: 'name' | 'sops' | 'questions') => {
    if (deptSortBy[deptName] === sortType) {
      setDeptSortOrder({
        ...deptSortOrder,
        [deptName]: deptSortOrder[deptName] === 'asc' ? 'desc' : 'asc'
      });
    } else {
      setDeptSortBy({ ...deptSortBy, [deptName]: sortType });
      setDeptSortOrder({ ...deptSortOrder, [deptName]: 'asc' });
    }
  };
  
  
  const toggleSubcatSort = (subcatKey: string, sortType: 'name' | 'questions') => {
    if (subcatSortBy[subcatKey] === sortType) {
      setSubcatSortOrder({
        ...subcatSortOrder,
        [subcatKey]: subcatSortOrder[subcatKey] === 'asc' ? 'desc' : 'asc'
      });
    } else {
      setSubcatSortBy({ ...subcatSortBy, [subcatKey]: sortType });
      setSubcatSortOrder({ ...subcatSortOrder, [subcatKey]: 'asc' });
    }
  };
  
  // Drag handlers for modal
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

  // Reset modal position when opening
  useEffect(() => {
    if (fullScreenDept) {
      setModalPosition({ x: 0, y: 0 });
    }
  }, [fullScreenDept]);
  
  // Filter tree based on search
  const filteredTree = tree.filter(matchesDepartment).map(dept => ({
    ...dept,
    subcategories: sortSubcategories(
      dept.subcategories.filter(matchesSubcategory).map(subcat => ({
        ...subcat,
        sops: subcat.sops.filter(matchesSOP)
      })),
      dept.name
    )
  }));
  
  // Filter unorganized SOPs
  const filteredUnorganized = {
    ...unorganized,
    sops: unorganized.sops.filter(matchesSOP),
    totalSOPs: unorganized.sops.filter(matchesSOP).length
  };

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

  const toggleSOP = (sopId: string) => {
    const newExpanded = new Set(expandedSOPs);
    if (newExpanded.has(sopId)) {
      newExpanded.delete(sopId);
    } else {
      newExpanded.add(sopId);
    }
    setExpandedSOPs(newExpanded);
  };

  return (
    <div className="space-y-6">
      {/* Search Results Info */}
      {searchLower && (
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
          <p className="text-blue-300 text-sm">
            <span className="font-semibold">Search Results:</span> Found {filteredTree.reduce((acc, dept) => acc + dept.subcategories.reduce((acc2, sub) => acc2 + sub.sops.length, 0), 0)} SOPs
            {filteredTree.length > 0 && ` across ${filteredTree.length} department(s)`}
          </p>
        </div>
      )}
      
      {/* No Results Message */}
      {searchLower && filteredTree.length === 0 && filteredUnorganized.sops.length === 0 && (
        <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10">
          <p className="text-gray-400 text-lg mb-2">No SOPs match your search</p>
          <p className="text-gray-500 text-sm">Try different keywords or clear the search</p>
        </div>
      )}
      
      {/* Departments Grid - 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {filteredTree.map((dept) => {
        const isDeptExpanded = expandedDepts.has(dept.name);
        
        return (
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
                <div className="text-left">
                  <p className="text-gray-300">
                    {dept.totalSOPs} SOP{dept.totalSOPs !== 1 ? 's' : ''}
                  </p>
                  <p className="text-gray-400 text-xs">
                    {dept.totalQuestions} Questions
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-purple-400">{dept.subcategories.length}</span>
                  <p className="text-xs text-gray-400">Subcategories</p>
                </div>
              </div>
            </button>
          </div>
        );
      })}
    </div>

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
          {/* Modal Header - Draggable */}
          <div 
            className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 px-6 py-4 border-b border-white/10 flex items-center justify-between cursor-move select-none"
            onMouseDown={handleMouseDown}
          >
            <div className="flex items-center gap-3">
              <FolderOpen className="h-7 w-7 text-purple-400" />
              <div>
                <h2 className="text-2xl font-bold text-white">{fullScreenDept.name}</h2>
                <p className="text-sm text-gray-400">
                  {fullScreenDept.totalSOPs} SOPs • {fullScreenDept.totalQuestions} Questions • {fullScreenDept.subcategories.length} Subcategories
                </p>
              </div>
            </div>
            <button
              onClick={() => setFullScreenDept(null)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <ChevronDown className="h-6 w-6 text-gray-400 hover:text-white rotate-180" />
            </button>
          </div>

          {/* Sort Controls */}
          {fullScreenDept.subcategories.length > 1 && (
            <div className="px-6 py-3 bg-black/20 border-b border-white/10">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-400 font-semibold">Sort subcategories:</span>
                {[
                  { value: 'name', label: 'Name' },
                  { value: 'sops', label: 'SOPs' },
                  { value: 'questions', label: 'Questions' }
                ].map((sort) => (
                  <button
                    key={sort.value}
                    onClick={() => toggleDeptSort(fullScreenDept.name, sort.value as 'name' | 'sops' | 'questions')}
                    className={`px-3 py-1.5 rounded text-sm font-semibold transition-all flex items-center gap-1 ${
                      deptSortBy[fullScreenDept.name] === sort.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-white/10 text-gray-300 hover:bg-white/20'
                    }`}
                  >
                    {sort.label}
                    {deptSortBy[fullScreenDept.name] === sort.value && (
                      deptSortOrder[fullScreenDept.name] === 'asc' ? 
                        <SortAsc className="h-4 w-4" /> : 
                        <SortDesc className="h-4 w-4" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Scrollable Content */}
          <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6">
            <div className="space-y-4">
              {sortSubcategories(fullScreenDept.subcategories, fullScreenDept.name).map((subcat) => {
                const subcatKey = `${fullScreenDept.name}-${subcat.code}`;
                const isSubcatExpanded = expandedSubcats.has(subcatKey);

                return (
                  <div key={subcatKey} className="bg-gradient-to-br from-green-900/20 to-green-800/10 rounded-xl border border-green-500/20 overflow-hidden">
                    {/* Subcategory Header */}
                    <button
                      onClick={() => toggleSubcategory(subcatKey)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        {isSubcatExpanded ? (
                          <ChevronDown className="h-4 w-4 text-green-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-green-400" />
                        )}
                        {isSubcatExpanded ? (
                          <FolderOpen className="h-5 w-5 text-green-400" />
                        ) : (
                          <Folder className="h-5 w-5 text-green-400" />
                        )}
                        <div className="text-left">
                          <h4 className="text-base font-semibold text-white group-hover:text-green-300 transition-colors">
                            {subcat.code} – {subcat.name}
                          </h4>
                          <p className="text-xs text-gray-400">
                            {subcat.totalSOPs} SOP{subcat.totalSOPs !== 1 ? 's' : ''} • {subcat.totalQuestions} Questions
                          </p>
                        </div>
                      </div>
                    </button>

                    {/* Sort Controls for SOPs */}
                    {isSubcatExpanded && subcat.sops.length > 1 && (
                      <div className="px-4 py-2 bg-black/30 border-t border-white/10">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-gray-400 font-semibold">Sort SOPs:</span>
                          {[
                            { value: 'name', label: 'Name' },
                            { value: 'questions', label: 'Questions' }
                          ].map((sort) => (
                            <button
                              key={sort.value}
                              onClick={() => toggleSubcatSort(subcatKey, sort.value as 'name' | 'questions')}
                              className={`px-2 py-1 rounded text-xs font-semibold transition-all flex items-center gap-1 ${
                                subcatSortBy[subcatKey] === sort.value
                                  ? 'bg-green-600 text-white'
                                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
                              }`}
                            >
                              {sort.label}
                              {subcatSortBy[subcatKey] === sort.value && (
                                subcatSortOrder[subcatKey] === 'asc' ? 
                                  <SortAsc className="h-3 w-3" /> : 
                                  <SortDesc className="h-3 w-3" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* SOPs Grid */}
                    {isSubcatExpanded && (
                      <div className="px-4 pb-4 bg-black/10">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                        {sortSOPs(subcat.sops, subcatKey).map((sop) => {
                          const isSOPExpanded = expandedSOPs.has(sop.sopId);

                          return (
                            <div key={sop.sopId} className="bg-slate-800/50 rounded-lg border border-slate-600/30 overflow-hidden hover:border-blue-500/50 transition-all">
                              {/* SOP Header - Compact */}
                              <button
                                onClick={() => toggleSOP(sop.sopId)}
                                className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-all group"
                                title={`${sop.sopCode} – ${sop.sopName}`}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  {isSOPExpanded ? (
                                    <ChevronDown className="h-3 w-3 text-blue-400 flex-shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3 text-blue-400 flex-shrink-0" />
                                  )}
                                  <FileText className="h-3 w-3 text-blue-400 flex-shrink-0" />
                                  <div className="text-left flex-1 min-w-0">
                                    <h5 className="text-xs font-semibold text-white group-hover:text-blue-300 transition-colors truncate">
                                      {sop.sopCode}
                                    </h5>
                                    <p className="text-[10px] text-gray-400 truncate">
                                      {sop.sopName}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="text-[10px] text-gray-400 bg-blue-900/20 px-2 py-0.5 rounded">
                                    {sop.totalQuestions} Q's
                                  </span>
                                </div>
                              </button>

                              {/* SOP Details (File + MCQ Banks) */}
                              {isSOPExpanded && (
                                <div className="px-3 pb-2 space-y-1.5 bg-slate-900/30 border-t border-slate-600/30">
                                  {/* SOP File */}
                                  {sop.sopFileUrl && (
                                    <div className="flex items-center gap-2 p-2 bg-blue-900/20 rounded border border-blue-500/20">
                                      <FileText className="h-3 w-3 text-blue-400 flex-shrink-0" />
                                      <span className="text-[10px] text-gray-300 flex-1">
                                        {sop.sopFileType.toUpperCase()} Document
                                      </span>
                                      <button
                                        onClick={() => onDownloadSOP(sop)}
                                        className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] rounded transition-colors flex items-center gap-1"
                                      >
                                        <Download className="h-2.5 w-2.5" />
                                        Download
                                      </button>
                                    </div>
                                  )}

                                  {/* MCQ Banks */}
                                  {sop.mcqBanks.length > 0 ? (
                                    <div className="space-y-1.5">
                                      {sop.mcqBanks.map((bank, idx) => (
                                        <div key={bank._id || idx} className="flex items-center gap-2 p-2 bg-purple-900/20 rounded border border-purple-500/20">
                                          <BookOpen className="h-3 w-3 text-purple-400 flex-shrink-0" />
                                          <div className="flex-1 min-w-0">
                                            <span className="text-[10px] text-gray-300 block">
                                              MCQ Bank #{idx + 1}
                                            </span>
                                            <p className="text-[9px] text-gray-400">
                                              {bank.totalQuestions} questions
                                            </p>
                                          </div>
                                          <button
                                            onClick={() => onViewMCQs(sop)}
                                            className="px-2 py-0.5 bg-purple-600 hover:bg-purple-700 text-white text-[10px] rounded transition-colors flex items-center gap-1 flex-shrink-0"
                                          >
                                            <Eye className="h-2.5 w-2.5" />
                                            View
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="p-2 bg-orange-900/20 rounded border border-orange-500/20 text-center">
                                      <p className="text-[10px] text-orange-300">No MCQs generated yet</p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        </div>
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

    {/* Unorganized Section */}
      {filteredUnorganized && filteredUnorganized.sops.length > 0 && (
        <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/20 rounded-2xl border border-orange-500/30 overflow-hidden">
          {/* Unorganized Header - Clickable */}
          <button
            onClick={() => setIsUnorganizedExpanded(!isUnorganizedExpanded)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-all group"
          >
            <div className="flex items-center gap-3">
              {isUnorganizedExpanded ? (
                <ChevronDown className="h-5 w-5 text-orange-400" />
              ) : (
                <ChevronRight className="h-5 w-5 text-orange-400" />
              )}
              {isUnorganizedExpanded ? (
                <FolderOpen className="h-6 w-6 text-orange-400" />
              ) : (
                <Folder className="h-6 w-6 text-orange-400" />
              )}
              <div>
                <h3 className="text-xl font-bold text-white group-hover:text-orange-300 transition-colors">Unorganized</h3>
                <p className="text-sm text-gray-400">
                  {filteredUnorganized.totalSOPs} SOP{filteredUnorganized.totalSOPs !== 1 ? 's' : ''} • {filteredUnorganized.totalQuestions} Questions
                </p>
              </div>
            </div>
          </button>
          
          {/* Unorganized Description */}
          <div className="px-6 pb-4">
            <p className="text-sm text-orange-300">
              These MCQ banks don't have corresponding SOP files in the system.
            </p>
          </div>

          {/* Unorganized SOPs Grid */}
          {isUnorganizedExpanded && (
            <div className="px-6 pb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredUnorganized.sops.map((sop) => {
                  const isSOPExpanded = expandedSOPs.has(sop.sopId);

                  return (
                    <div key={sop.sopId} className="bg-slate-800/50 rounded-lg border border-slate-600/30 overflow-hidden hover:border-orange-500/50 transition-all">
                      {/* SOP Header */}
                      <button
                        onClick={() => toggleSOP(sop.sopId)}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-all group"
                        title={`${sop.sopCode} – ${sop.sopName}`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {isSOPExpanded ? (
                            <ChevronDown className="h-3 w-3 text-orange-400 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-orange-400 flex-shrink-0" />
                          )}
                          <FileText className="h-3 w-3 text-orange-400 flex-shrink-0" />
                          <div className="text-left flex-1 min-w-0">
                            <h5 className="text-xs font-semibold text-white group-hover:text-orange-300 transition-colors truncate">
                              {sop.sopCode}
                            </h5>
                            <p className="text-[10px] text-gray-400 truncate">
                              {sop.sopName}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] text-gray-400 bg-orange-900/20 px-2 py-0.5 rounded">
                            {sop.totalQuestions} Q's
                          </span>
                        </div>
                      </button>

                      {/* SOP Details (MCQ Banks) */}
                      {isSOPExpanded && (
                        <div className="px-3 pb-2 space-y-1.5 bg-slate-900/30 border-t border-slate-600/30">
                          {/* MCQ Banks */}
                          {sop.mcqBanks.length > 0 ? (
                            <div className="space-y-1.5">
                              {sop.mcqBanks.map((bank, idx) => (
                                <div key={bank._id || idx} className="flex items-center gap-2 p-2 bg-purple-900/20 rounded border border-purple-500/20">
                                  <BookOpen className="h-3 w-3 text-purple-400 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <span className="text-[10px] text-gray-300 block">
                                      MCQ Bank #{idx + 1}
                                    </span>
                                    <p className="text-[9px] text-gray-400">
                                      {bank.totalQuestions} questions
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => onViewMCQs(sop)}
                                    className="px-2 py-0.5 bg-purple-600 hover:bg-purple-700 text-white text-[10px] rounded transition-colors flex items-center gap-1 flex-shrink-0"
                                  >
                                    <Eye className="h-2.5 w-2.5" />
                                    View
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-2 bg-orange-900/20 rounded border border-orange-500/20 text-center">
                              <p className="text-[10px] text-orange-300">No MCQs generated yet</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
