'use client';

import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, BookOpen, Download, Eye, SortAsc, SortDesc, Star } from 'lucide-react';
import Link from 'next/link';

// Helper function to clean SOP name from folder path
function cleanSOPName(rawName: string, identifier: string): string {
  if (rawName.includes('/')) {
    const segments = rawName.split('/').filter(s => s.trim());
    const lastSegment = segments[segments.length - 1] || rawName;
    rawName = lastSegment;
  }
  
  let cleanedName = rawName
    .replace(new RegExp(`^${identifier}[_\\-\\s]*`, 'i'), '')
    .trim();
  
  cleanedName = cleanedName.replace(/_/g, ' ');
  return cleanedName || rawName;
}

// Helper to get department theme colors
const getDeptTheme = (deptName: string) => {
  const name = deptName.toLowerCase();
  
  if (name.includes('qa')) return {
    text: 'text-purple-400',
    textHover: 'group-hover:text-purple-300',
    bg: 'bg-purple-500',
    border: 'border-purple-500',
    borderHover: 'hover:border-purple-400',
    gradient: 'from-purple-900/40 to-indigo-900/40',
    subcatBg: 'from-purple-900/20 to-purple-800/10',
    icon: 'text-purple-400',
    button: 'bg-purple-600 hover:bg-purple-700'
  };
  
  if (name.includes('qc')) return {
    text: 'text-blue-400',
    textHover: 'group-hover:text-blue-300',
    bg: 'bg-blue-500',
    border: 'border-blue-500',
    borderHover: 'hover:border-blue-400',
    gradient: 'from-blue-900/40 to-cyan-900/40',
    subcatBg: 'from-blue-900/20 to-blue-800/10',
    icon: 'text-blue-400',
    button: 'bg-blue-600 hover:bg-blue-700'
  };

  if (name.includes('microbiology')) return {
    text: 'text-orange-400',
    textHover: 'group-hover:text-orange-300',
    bg: 'bg-orange-500',
    border: 'border-orange-500', 
    borderHover: 'hover:border-orange-400',
    gradient: 'from-orange-900/40 to-amber-900/40',
    subcatBg: 'from-orange-900/20 to-orange-800/10',
    icon: 'text-orange-400',
    button: 'bg-orange-600 hover:bg-orange-700'
  };

  if (name.includes('production')) return {
    text: 'text-green-400',
    textHover: 'group-hover:text-green-300',
    bg: 'bg-green-500',
    border: 'border-green-500',
    borderHover: 'hover:border-green-400',
    gradient: 'from-green-900/40 to-emerald-900/40',
    subcatBg: 'from-green-900/20 to-green-800/10',
    icon: 'text-green-400',
    button: 'bg-green-600 hover:bg-green-700'
  };
  
  if (name.includes('store')) return {
    text: 'text-yellow-400',
    textHover: 'group-hover:text-yellow-300',
    bg: 'bg-yellow-500',
    border: 'border-yellow-500',
    borderHover: 'hover:border-yellow-400',
    gradient: 'from-yellow-900/40 to-amber-900/40',
    subcatBg: 'from-yellow-900/20 to-yellow-800/10',
    icon: 'text-yellow-400',
    button: 'bg-yellow-600 hover:bg-yellow-700'
  };

  if (name.includes('engineering')) return {
    text: 'text-cyan-400',
    textHover: 'group-hover:text-cyan-300',
    bg: 'bg-cyan-500',
    border: 'border-cyan-500',
    borderHover: 'hover:border-cyan-400',
    gradient: 'from-cyan-900/40 to-blue-900/40',
    subcatBg: 'from-cyan-900/20 to-cyan-800/10',
    icon: 'text-cyan-400',
    button: 'bg-cyan-600 hover:bg-cyan-700'
  };

  if (name.includes('personnel') || name.includes('hr')) return {
    text: 'text-pink-400',
    textHover: 'group-hover:text-pink-300',
    bg: 'bg-pink-500',
    border: 'border-pink-500',
    borderHover: 'hover:border-pink-400',
    gradient: 'from-pink-900/40 to-rose-900/40',
    subcatBg: 'from-pink-900/20 to-pink-800/10',
    icon: 'text-pink-400',
    button: 'bg-pink-600 hover:bg-pink-700'
  };

  return {
    text: 'text-gray-300',
    textHover: 'group-hover:text-white',
    bg: 'bg-gray-500',
    border: 'border-gray-500',
    borderHover: 'hover:border-gray-400',
    gradient: 'from-slate-800 to-slate-900',
    subcatBg: 'from-slate-800/50 to-slate-900/50',
    icon: 'text-gray-400',
    button: 'bg-gray-600 hover:bg-gray-700'
  };
};

interface SOPNode {
  sopId: string;
  sopCode: string;
  sopName: string;
  sopFileUrl: string;
  sopFileType: 'pdf' | 'docx';
  mcqBanks: any[];
  totalQuestions: number;
  checkedCount?: number;
  reviewedCount?: number;
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
    const sortBy = subcatSortBy[subcatKey] || 'questions'; // Default to questions
    const sortOrder = subcatSortOrder[subcatKey] || 'desc'; // Default descending so most questions first
    
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
        const theme = getDeptTheme(dept.name);
        
        return (
          <div key={dept.name} className={`bg-white/5 backdrop-blur-lg rounded-3xl border border-white/10 ${theme.borderHover} transition-all duration-300 transform hover:scale-[1.03] shadow-xl hover:shadow-2xl overflow-hidden cursor-pointer group`}>
            {/* Department Header */}
            <button
              onClick={() => setFullScreenDept(dept)}
              className={`w-full px-6 py-6 flex flex-col gap-4 bg-gradient-to-br from-white/5 to-transparent transition-all`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl bg-white/5 border border-white/10 ${theme.text}`}>
                    <Folder className="h-8 w-8" />
                  </div>
                  <div className="text-left">
                    <h3 className={`text-xl font-bold text-white ${theme.textHover} transition-colors`}>
                      {dept.name}
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                      {dept.subcategories.length} Subcategor{dept.subcategories.length !== 1 ? 'ies' : 'y'}
                    </p>
                  </div>
                </div>
                <div className={`h-8 w-8 rounded-full flex items-center justify-center border border-white/10 ${theme.text}`}>
                  <ChevronRight className="h-5 w-5" />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 w-full mt-2">
                <div className="bg-black/20 rounded-xl p-3 text-left">
                  <p className="text-gray-400 text-xs uppercase tracking-wider font-medium mb-1">Total SOPs</p>
                  <span className="text-2xl font-bold text-white">{dept.totalSOPs}</span>
                </div>
                <div className="bg-black/20 rounded-xl p-3 text-left">
                  <p className="text-gray-400 text-xs uppercase tracking-wider font-medium mb-1">Questions</p>
                  <span className={`text-2xl font-bold ${theme.text}`}>{dept.totalQuestions}</span>
                </div>
              </div>
            </button>
          </div>
        );
      })}
    </div>

    {/* Full-Screen Department Modal */}
    {fullScreenDept && (() => {
      const theme = getDeptTheme(fullScreenDept.name);
      return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
        <div 
          className={`bg-[#0f111a] rounded-3xl border ${theme.border} w-full max-w-[90vw] h-[90vh] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col`}
          style={{
            transform: `translate(${modalPosition.x}px, ${modalPosition.y}px)`,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out'
          }}
        >
          {/* Modal Header */}
          <div 
            className={`bg-gradient-to-r ${theme.gradient} px-8 py-6 border-b border-white/10 flex items-center justify-between cursor-move select-none shrink-0`}
            onMouseDown={handleMouseDown}
          >
            <div className="flex items-center gap-5">
              <div className="p-3 bg-white/10 rounded-2xl border border-white/10">
                <FolderOpen className={`h-8 w-8 ${theme.text} text-white`} />
              </div>
              <div>
                <h2 className="text-3xl font-bold text-white tracking-tight">{fullScreenDept.name}</h2>
                <div className="flex items-center gap-4 mt-2 text-blue-100/70 text-sm font-medium">
                  <span className="bg-black/20 px-3 py-1 rounded-lg border border-white/5">{fullScreenDept.totalSOPs} SOPs</span>
                  <span className="bg-black/20 px-3 py-1 rounded-lg border border-white/5">{fullScreenDept.totalQuestions} Questions</span>
                  <span className="bg-black/20 px-3 py-1 rounded-lg border border-white/5">{fullScreenDept.subcategories.length} Subcategories</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Review Center Button */}
              <Link href="/mcq-review">
                <button
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-xl transition-all shadow-lg hover:shadow-yellow-500/20 font-semibold text-sm"
                  title="Go to Review Center"
                >
                  <Star className="h-4 w-4" />
                  Review Center
                </button>
              </Link>
              
              {/* Close Button */}
              <button
                onClick={() => setFullScreenDept(null)}
                className="p-3 hover:bg-white/10 rounded-full transition-colors border border-transparent hover:border-white/10"
              >
                <ChevronDown className="h-6 w-6 text-white rotate-180" />
              </button>
            </div>
          </div>

          {/* Sort Controls */}
          <div className="px-8 py-4 bg-white/5 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400 font-medium">Sort by:</span>
              <div className="flex gap-2">
                {[
                  { value: 'name', label: 'Name' },
                  { value: 'sops', label: 'SOP Count' },
                  { value: 'questions', label: 'Questions' }
                ].map((sort) => (
                  <button
                    key={sort.value}
                    onClick={() => toggleDeptSort(fullScreenDept.name, sort.value as 'name' | 'sops' | 'questions')}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                      deptSortBy[fullScreenDept.name] === sort.value
                        ? `${theme.button} text-white shadow-lg shadow-${theme.bg}/20`
                        : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
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
          </div>

          {/* Scrollable Content */}
          <div className="overflow-y-auto flex-1 p-8 space-y-6 custom-scrollbar">
              {sortSubcategories(fullScreenDept.subcategories, fullScreenDept.name).map((subcat) => {
                const subcatKey = `${fullScreenDept.name}-${subcat.code}`;
                const isSubcatExpanded = expandedSubcats.has(subcatKey);

                return (
                  <div key={subcatKey} className={`rounded-2xl border border-white/5 overflow-hidden bg-gradient-to-br ${theme.subcatBg}`}>
                    {/* Subcategory Header */}
                    <button
                      onClick={() => toggleSubcategory(subcatKey)}
                      className="w-full px-6 py-5 flex items-center justify-between hover:bg-white/5 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg bg-black/20 ${theme.text}`}>
                          {isSubcatExpanded ? <FolderOpen className="h-6 w-6" /> : <Folder className="h-6 w-6" />}
                        </div>
                        <div className="text-left">
                          <h4 className={`text-lg font-bold text-white ${theme.textHover} transition-colors flex items-center gap-3`}>
                            {subcat.name}
                            <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-300 font-normal">{subcat.code}</span>
                          </h4>
                          <p className="text-sm text-gray-400 mt-1">
                            {subcat.totalSOPs} SOPs • {subcat.totalQuestions} Questions
                          </p>
                        </div>
                      </div>
                      
                      <div className={`p-2 rounded-full ${isSubcatExpanded ? 'bg-white/10' : 'bg-transparent'} transition-colors`}>
                        <ChevronRight className={`h-5 w-5 ${theme.text} transition-transform duration-300 ${isSubcatExpanded ? 'rotate-90' : ''}`} />
                      </div>
                    </button>

                    {/* SOP Content Area */}
                    {isSubcatExpanded && (
                      <div className="px-6 pb-6 bg-black/20 border-t border-white/5">
                        {/* SOP Sort Controls */}
                        {subcat.sops.length > 1 && (
                          <div className="py-4 flex items-center justify-end gap-3">
                            <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Sort SOPs:</span>
                             <div className="flex bg-black/30 rounded-lg p-1">
                              {[
                                { value: 'questions', label: 'Most Questions' },
                                { value: 'name', label: 'Name' }
                              ].map((sort) => (
                                <button
                                  key={sort.value}
                                  onClick={() => toggleSubcatSort(subcatKey, sort.value as 'name' | 'questions')}
                                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                    subcatSortBy[subcatKey] === sort.value
                                      ? 'bg-white/10 text-white shadow-sm'
                                      : 'text-gray-500 hover:text-gray-300'
                                  }`}
                                >
                                  {sort.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* SOP Grid */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {sortSOPs(subcat.sops, subcatKey).map((sop) => {
                          const isSOPExpanded = expandedSOPs.has(sop.sopId);
                          const hasQuestions = sop.totalQuestions > 0;

                          return (
                            <div 
                              key={sop.sopId} 
                              className={`group relative bg-[#131620] rounded-xl border overflow-hidden transition-all duration-300 cursor-pointer
                                  ${isSOPExpanded 
                                    ? 'border-purple-500 bg-[#1A1E2E] shadow-[0_0_20px_rgba(168,85,247,0.15)]' 
                                    : 'border-white/5 hover:border-purple-500/50 hover:bg-[#1A1E2E] hover:shadow-[0_0_20px_rgba(168,85,247,0.15)] hover:scale-[1.02]'
                                  }`}
                            >
                              {/* SOP Header */}
                              <button
                                onClick={() => toggleSOP(sop.sopId)}
                                className="w-full px-6 py-5 flex items-start gap-5 text-left"
                              >
                                {/* Icon Box */}
                                <div className={`mt-1 p-3 rounded-xl transition-all duration-300 shrink-0
                                  ${hasQuestions 
                                    ? 'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 group-hover:scale-110' 
                                    : 'bg-gray-800/40 text-gray-500 group-hover:bg-purple-500/10 group-hover:text-purple-400 group-hover:scale-110'
                                  }`}>
                                  <FileText className="h-5 w-5" />
                                </div>
                                
                                <div className="flex-1 min-w-0 pt-0.5">
                                  {/* Identifier Row */}
                                  <div className="flex items-center gap-3 mb-2">
                                    <h4 className="text-lg font-extrabold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-pink-300 transition-all duration-300 group-hover:to-white group-hover:from-purple-200 drop-shadow-sm">
                                      {sop.sopCode}
                                    </h4>
                                    
                                    <span className={`text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-md border transition-all duration-300
                                      ${hasQuestions 
                                        ? 'bg-green-500/10 text-green-400 border-green-500/20 group-hover:bg-green-500/20 group-hover:border-green-500/40' 
                                        : 'bg-gray-800 text-gray-500 border-gray-700 group-hover:border-gray-600'
                                      }`}>
                                        {sop.totalQuestions > 0 ? `${sop.totalQuestions} Qs` : 'No Qs'}
                                      </span>
                                      
                                      {/* Checked Count Badge */}
                                      {sop.checkedCount && sop.checkedCount > 0 ? (
                                        <span className="text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-md border border-green-500/30 bg-green-500/20 text-green-400 shadow-[0_0_10px_rgba(34,197,94,0.1)] flex items-center gap-1">
                                          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
                                          {sop.checkedCount} Checked
                                        </span>
                                      ) : null}

                                      {/* Reviewed Count Badge */}
                                      {sop.reviewedCount && sop.reviewedCount > 0 ? (
                                        <span className="text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-md border border-yellow-500/30 bg-yellow-500/20 text-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.1)] flex items-center gap-1">
                                          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400"></div>
                                          {sop.reviewedCount} Reviewed
                                        </span>
                                      ) : null}
                                  </div>
                                  
                                  {/* SOP Name */}
                                  <p className="text-gray-400 font-medium text-sm leading-relaxed transition-colors duration-300 group-hover:text-white line-clamp-2 pr-4">
                                    {cleanSOPName(sop.sopName, sop.sopCode)}
                                  </p>
                                </div>
                                
                                <ChevronRight className={`h-5 w-5 mt-1 transition-all duration-300 shrink-0 
                                  ${isSOPExpanded 
                                    ? 'rotate-90 text-purple-400' 
                                    : 'text-gray-600 group-hover:text-purple-400 group-hover:translate-x-1'
                                  }`} 
                                />
                              </button>

                              {/* Expanded SOP Details */}
                              {isSOPExpanded && (
                                <div className="px-4 pb-4 pt-0 space-y-3">
                                  <div className="h-px w-full bg-white/5 mb-3"></div>
                                  
                                  {/* Download Button */}
                                  {sop.sopFileUrl && (
                                    <button
                                      onClick={() => onDownloadSOP(sop)}
                                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-gray-300 transition-colors border border-white/5 hover:border-white/10"
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                      Download {sop.sopFileType.toUpperCase()}
                                    </button>
                                  )}

                                  {/* MCQ Banks List */}
                                  {sop.mcqBanks.length > 0 ? (
                                    <div className="space-y-2 mt-2">
                                      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold ml-1">Available Question Banks</p>
                                      {sop.mcqBanks.map((bank, idx) => (
                                        <div key={bank._id || idx} className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-purple-900/10 to-blue-900/10 border border-white/5 group/bank hover:border-purple-500/30 transition-all">
                                          <div className="flex items-center gap-3">
                                            <div className="p-1.5 rounded bg-purple-500/10 text-purple-400">
                                              <BookOpen className="h-3.5 w-3.5" />
                                            </div>
                                            <div>
                                              <span className="text-xs font-semibold text-gray-200 block">Bank Set #{idx + 1}</span>
                                              <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] text-gray-400">{bank.totalQuestions} questions</span>
                                                {(() => {
                                                  const checkedCount = bank.mcqs?.filter((q: any) => q?.isChecked).length || 0;
                                                  const reviewedCount = bank.mcqs?.filter((q: any) => q?.isReviewed).length || 0;
                                                  console.log(`Bank ${idx + 1}: mcqs length=${bank.mcqs?.length}, checked=${checkedCount}, reviewed=${reviewedCount}`);
                                                  return (
                                                    <>
                                                      {checkedCount > 0 && (
                                                        <span className="text-[10px] text-green-400 font-medium bg-green-900/40 px-1.5 py-0.5 rounded border border-green-500/30">
                                                          {checkedCount} Checked
                                                        </span>
                                                      )}
                                                      {reviewedCount > 0 && (
                                                        <span className="text-[10px] text-yellow-400 font-medium bg-yellow-900/40 px-1.5 py-0.5 rounded border border-yellow-500/30">
                                                          {reviewedCount} Reviewed
                                                        </span>
                                                      )}
                                                    </>
                                                  );
                                                })()}
                                              </div>
                                            </div>
                                          </div>
                                          
                                          <button
                                            onClick={() => onViewMCQs(sop)}
                                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded-lg transition-colors font-medium shadow-lg shadow-purple-900/20"
                                          >
                                            View
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="p-4 rounded-lg bg-white/5 border border-dashed border-white/10 text-center">
                                      <p className="text-xs text-gray-500">No question banks generated yet.</p>
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
      );
    })()}

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
                              {cleanSOPName(sop.sopName, sop.sopCode)}
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
