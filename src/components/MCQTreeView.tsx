'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, BookOpen, Download, Eye, SortAsc, SortDesc, Star, Search, Loader2, X, ArrowLeft, CheckCircle2, AlertTriangle, MessageSquare } from 'lucide-react';
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
  similarCount?: number;
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
  onViewMCQs: (sopNode: SOPNode, filterStatus?: 'all' | 'checked' | 'similar' | 'reviewed') => void;
  onDownloadSOP: (sopNode: SOPNode) => void;
  
  // Lifted state for persistence
  expandedDepts: Set<string>;
  setExpandedDepts: (expanded: Set<string>) => void;
  expandedSubcats: Set<string>;
  setExpandedSubcats: (expanded: Set<string>) => void;
  expandedSOPs: Set<string>;
  setExpandedSOPs: (expanded: Set<string>) => void;

  // Lifted fullScreenDept so it survives parent re-renders (e.g. loading spinner)
  fullScreenDept: DepartmentNode | null;
  setFullScreenDept: (dept: DepartmentNode | null) => void;
}


export default function MCQTreeView({ 
  tree, 
  unorganized, 
  searchTerm = '', 
  onViewMCQs, 
  onDownloadSOP,
  expandedDepts,
  setExpandedDepts,
  expandedSubcats,
  setExpandedSubcats,
  expandedSOPs,
  setExpandedSOPs,
  fullScreenDept,
  setFullScreenDept,
}: MCQTreeViewProps) {
  // Expansion state is now managed by parent
  const [isUnorganizedExpanded, setIsUnorganizedExpanded] = useState(false);
  
  // fullScreenDept is now lifted to parent — no local state needed
  
  // Modal dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Sort state for each department
  const [deptSortBy, setDeptSortBy] = useState<Record<string, 'name' | 'sops' | 'questions' | 'checked' | 'similar' | 'reviewed' | 'notChecked'>>({});
  const [deptSortOrder, setDeptSortOrder] = useState<Record<string, 'asc' | 'desc'>>({});
  
  // Sort state for each subcategory
  const [subcatSortBy, setSubcatSortBy] = useState<Record<string, 'name' | 'questions' | 'identifier' | 'checked' | 'similar' | 'reviewed' | 'notChecked'>>({});
  const [subcatSortOrder, setSubcatSortOrder] = useState<Record<string, 'asc' | 'desc'>>({});

  // Department modal: filter mode (questions view vs SOP view)
  const [deptFilterMode, setDeptFilterMode] = useState<'sops' | 'checked' | 'similar' | 'reviewed' | 'notChecked'>('sops');
  const [deptSearchTerm, setDeptSearchTerm] = useState('');
  const [deptQuestions, setDeptQuestions] = useState<any[]>([]);
  const [loadingDeptQuestions, setLoadingDeptQuestions] = useState(false);

  // Fetch all questions for a department when switching to questions view
  const fetchDeptQuestions = useCallback(async (deptName: string, filter: 'checked' | 'similar' | 'reviewed' | 'notChecked') => {
    setLoadingDeptQuestions(true);
    try {
      // Collect all MCQ bank IDs from the tree data (already available in fullScreenDept)
      // This is reliable because the tree computes departments from SOP identifiers,
      // NOT from the folderDepartment field which may not be set on MCQ bank documents.
      const bankIds: string[] = [];
      if (fullScreenDept) {
        fullScreenDept.subcategories.forEach((sub: any) => {
          sub.sops.forEach((sop: any) => {
            if (sop.mcqBanks && sop.mcqBanks.length > 0) {
              sop.mcqBanks.forEach((bank: any) => {
                if (bank._id) bankIds.push(bank._id.toString());
              });
            }
          });
        });
      }

      if (bankIds.length === 0) {
        setDeptQuestions([]);
        return;
      }

      // Use bulk IDs endpoint — single request, native driver preserves isChecked/isReviewed/isSimilar
      const allQs: any[] = [];
      
      // Split IDs into chunks to avoid URL length limits (~2000 chars per chunk)
      const chunkSize = 50;
      for (let i = 0; i < bankIds.length; i += chunkSize) {
        const chunk = bankIds.slice(i, i + chunkSize);
        const idsParam = chunk.join(',');
        const res = await fetch(`/api/mcq-bank?ids=${idsParam}&t=${Date.now()}`, { cache: 'no-store' });
        const data = await res.json();
        if (data.success && data.mcqBanks) {
          data.mcqBanks.forEach((bank: any) => {
            if (bank.mcqs && bank.mcqs.length > 0) {
              bank.mcqs.forEach((mcq: any, idx: number) => {
                allQs.push({
                  ...mcq,
                  _bankId: bank._id,
                  _sopIdentifier: bank.sopIdentifier || '',
                  _sopName: bank.sopName || '',
                  _originalIndex: idx,
                });
              });
            }
          });
        }
      }
      setDeptQuestions(allQs);
    } catch (err) {
      console.error('Error fetching dept questions:', err);
    } finally {
      setLoadingDeptQuestions(false);
    }
  }, [fullScreenDept]);

  // Reset filter mode when department changes
  useEffect(() => {
    setDeptFilterMode('sops');
    setDeptSearchTerm('');
    setDeptQuestions([]);
  }, [fullScreenDept?.name]);
  
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
  
  // Helper for natural sorting (deals with numbers in strings correctly)
  const naturalCompare = (a: string, b: string) => {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  };

  // Sorting functions
  const sortSubcategories = (subcats: SubcategoryNode[], deptName: string): SubcategoryNode[] => {
    const sortBy = deptSortBy[deptName] || 'name';
    const sortOrder = deptSortOrder[deptName] || 'asc';
    
    return [...subcats].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = naturalCompare(a.name, b.name);
          break;
        case 'sops':
          comparison = a.totalSOPs - b.totalSOPs;
          break;
        case 'questions':
          comparison = a.totalQuestions - b.totalQuestions;
          break;
        case 'checked':
          comparison = a.sops.reduce((sum, s) => sum + (s.checkedCount || 0), 0) - b.sops.reduce((sum, s) => sum + (s.checkedCount || 0), 0);
          break;
        case 'similar':
          comparison = a.sops.reduce((sum, s) => sum + (s.similarCount || 0), 0) - b.sops.reduce((sum, s) => sum + (s.similarCount || 0), 0);
          break;
        case 'reviewed':
          comparison = a.sops.reduce((sum, s) => sum + (s.reviewedCount || 0), 0) - b.sops.reduce((sum, s) => sum + (s.reviewedCount || 0), 0);
          break;
        case 'notChecked':
          comparison = a.sops.reduce((sum, s) => sum + (s.totalQuestions - (s.checkedCount || 0)), 0) - b.sops.reduce((sum, s) => sum + (s.totalQuestions - (s.checkedCount || 0)), 0);
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };
  
  const sortSOPs = (sops: SOPNode[], subcatKey: string): SOPNode[] => {
    const sortBy = subcatSortBy[subcatKey] || 'identifier'; // Default to identifier
    const sortOrder = subcatSortOrder[subcatKey] || 'asc';    // Default ascending for identifiers
    
    return [...sops].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'identifier':
          comparison = naturalCompare(a.sopCode, b.sopCode);
          break;
        case 'name':
          // Clean the names of identifier prefixes before comparing for a true "Name" sort
          const cleanA = cleanSOPName(a.sopName, a.sopCode);
          const cleanB = cleanSOPName(b.sopName, b.sopCode);
          comparison = cleanA.localeCompare(cleanB, undefined, { sensitivity: 'base' });
          break;
        case 'questions':
          comparison = a.totalQuestions - b.totalQuestions;
          break;
        case 'checked':
          comparison = (a.checkedCount || 0) - (b.checkedCount || 0);
          break;
        case 'similar':
          comparison = (a.similarCount || 0) - (b.similarCount || 0);
          break;
        case 'reviewed':
          comparison = (a.reviewedCount || 0) - (b.reviewedCount || 0);
          break;
        case 'notChecked':
          comparison = (a.totalQuestions - (a.checkedCount || 0)) - (b.totalQuestions - (b.checkedCount || 0));
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };
  
  const toggleDeptSort = (deptName: string, sortType: 'name' | 'sops' | 'questions' | 'checked' | 'similar' | 'reviewed' | 'notChecked') => {
    if (deptSortBy[deptName] === sortType) {
      setDeptSortOrder({
        ...deptSortOrder,
        [deptName]: deptSortOrder[deptName] === 'asc' ? 'desc' : 'asc'
      });
    } else {
      setDeptSortBy({ ...deptSortBy, [deptName]: sortType });
      // Default to descending for numeric stats, ascending for name
      const defaultOrder = ['questions', 'sops', 'checked', 'similar', 'reviewed', 'notChecked'].includes(sortType) ? 'desc' : 'asc';
      setDeptSortOrder({ ...deptSortOrder, [deptName]: defaultOrder });
    }
  };
  
  
  const toggleSubcatSort = (subcatKey: string, sortType: 'name' | 'questions' | 'identifier' | 'checked' | 'similar' | 'reviewed' | 'notChecked') => {
    if (subcatSortBy[subcatKey] === sortType) {
      setSubcatSortOrder({
        ...subcatSortOrder,
        [subcatKey]: subcatSortOrder[subcatKey] === 'asc' ? 'desc' : 'asc'
      });
    } else {
      setSubcatSortBy({ ...subcatSortBy, [subcatKey]: sortType });
      // Default to descending for numeric stats
      const defaultOrder = ['questions', 'checked', 'similar', 'reviewed', 'notChecked'].includes(sortType) ? 'desc' : 'asc';
      setSubcatSortOrder({ ...subcatSortOrder, [subcatKey]: defaultOrder });
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
          <div key={dept.name} className={`backdrop-blur-lg rounded-3xl border border-white/5 ${theme.borderHover} bg-gradient-to-br ${theme.subcatBg} transition-all duration-300 transform hover:scale-[1.03] shadow-xl hover:shadow-2xl overflow-hidden cursor-pointer group`}>
            {/* Department Header */}
            <button
              onClick={() => setFullScreenDept(dept)}
              className={`w-full px-6 py-6 flex flex-col gap-4 bg-transparent transition-all`}
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
                  {(() => {
                    const stats = fullScreenDept.subcategories.reduce((acc: any, sub: any) => {
                      sub.sops.forEach((sop: any) => {
                        acc.checked += sop.checkedCount || 0;
                        acc.similar += sop.similarCount || 0;
                        acc.reviewed += sop.reviewedCount || 0;
                      });
                      return acc;
                    }, { checked: 0, similar: 0, reviewed: 0 });
                    
                    const filterPills = [
                      { id: 'checked' as const, label: 'Checked', count: stats.checked,
                        active: 'bg-green-600 border-green-600 text-white shadow-lg',
                        inactive: 'bg-green-900/20 border-green-500/25 text-green-300 hover:bg-green-900/40',
                        dot: 'bg-green-400' },
                      { id: 'notChecked' as const, label: 'Not Checked', count: (fullScreenDept.totalQuestions || 0) - stats.checked,
                        active: 'bg-red-600 border-red-600 text-white shadow-lg',
                        inactive: 'bg-red-900/20 border-red-500/25 text-red-300 hover:bg-red-900/40',
                        dot: 'bg-red-400' },
                      { id: 'similar' as const, label: 'Similar', count: stats.similar,
                        active: 'bg-orange-600 border-orange-600 text-white shadow-lg',
                        inactive: 'bg-orange-900/20 border-orange-500/25 text-orange-300 hover:bg-orange-900/40',
                        dot: 'bg-orange-400' },
                      { id: 'reviewed' as const, label: 'Reviewed', count: stats.reviewed,
                        active: 'bg-amber-600 border-amber-600 text-white shadow-lg',
                        inactive: 'bg-amber-900/20 border-amber-500/25 text-amber-300 hover:bg-amber-900/40',
                        dot: 'bg-amber-400' },
                    ];
                    
                    return (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {filterPills.map(pill => (
                          <button
                            key={pill.id}
                            onClick={() => {
                              if (deptFilterMode === pill.id) {
                                setDeptFilterMode('sops');
                              } else {
                                setDeptFilterMode(pill.id);
                                fetchDeptQuestions(fullScreenDept.name, pill.id);
                              }
                            }}
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border transition-all ${
                              deptFilterMode === pill.id ? pill.active : pill.inactive
                            }`}
                          >
                            <div className={`w-1.5 h-1.5 rounded-full ${pill.dot}`}></div>
                            {pill.count} {pill.label}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
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

          {/* Search + Sort Controls Bar */}
          <div className="px-8 py-4 bg-white/5 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search SOPs by name or code..."
                  value={deptSearchTerm}
                  onChange={e => setDeptSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-8 py-2 bg-black/30 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all"
                />
                {deptSearchTerm && (
                  <button onClick={() => setDeptSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Sort controls — only show in SOP view mode */}
              {deptFilterMode === 'sops' && (
                <>
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
                            ? `${theme.button} text-white shadow-lg`
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
                    
                    <div className="w-px h-6 bg-white/10 mx-2"></div>
                    
                    {[
                      { value: 'checked', label: 'Checked' },
                      { value: 'notChecked', label: 'Not Checked' },
                      { value: 'similar', label: 'Similar' },
                      { value: 'reviewed', label: 'Reviewed' }
                    ].map((sort) => (
                      <button
                        key={sort.value}
                        onClick={() => toggleDeptSort(fullScreenDept.name, sort.value as any)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                          deptSortBy[fullScreenDept.name] === sort.value
                            ? `${theme.button} text-white shadow-lg`
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
                </>
              )}

              {/* Back to SOPs button when in questions view */}
              {deptFilterMode !== 'sops' && (
                <button
                  onClick={() => setDeptFilterMode('sops')}
                  className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-xl text-sm font-medium transition-all border border-white/10"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to SOPs
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="overflow-y-auto flex-1 p-8 space-y-6 custom-scrollbar">

            {/* Questions View — when a status filter is active */}
            {deptFilterMode !== 'sops' ? (
              <div>
                {loadingDeptQuestions ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="h-10 w-10 text-purple-400 animate-spin mb-4" />
                    <p className="text-gray-400 text-sm">Loading questions across all SOPs...</p>
                  </div>
                ) : (() => {
                  // Filter questions based on the selected filter
                  let filtered = deptQuestions.filter(q => {
                    if (deptFilterMode === 'checked') return q.isChecked === true;
                    if (deptFilterMode === 'notChecked') return q.isChecked !== true;
                    if (deptFilterMode === 'similar') return q.isSimilar === true;
                    if (deptFilterMode === 'reviewed') return q.isReviewed === true;
                    return true;
                  });

                  // Apply search filter
                  if (deptSearchTerm.trim()) {
                    const searchLow = deptSearchTerm.toLowerCase().trim();
                    filtered = filtered.filter(q =>
                      (q.question || '').toLowerCase().includes(searchLow) ||
                      (q._sopIdentifier || '').toLowerCase().includes(searchLow) ||
                      (q._sopName || '').toLowerCase().includes(searchLow)
                    );
                  }

                  if (filtered.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-20">
                        <BookOpen className="h-12 w-12 text-gray-600 mb-3" />
                        <p className="text-gray-400 text-sm">No questions found for this filter.</p>
                      </div>
                    );
                  }

                  const filterLabel = deptFilterMode === 'checked' ? 'Checked' : deptFilterMode === 'notChecked' ? 'Not Checked' : deptFilterMode === 'similar' ? 'Similar' : 'Reviewed';
                  const filterDotClass = deptFilterMode === 'checked' ? 'bg-green-400' : deptFilterMode === 'notChecked' ? 'bg-red-400' : deptFilterMode === 'similar' ? 'bg-orange-400' : 'bg-amber-400';

                  return (
                    <>
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${filterDotClass}`} />
                          <h3 className="text-lg font-bold text-white">
                            {filtered.length} {filterLabel} Questions
                          </h3>
                          <span className="text-xs text-gray-500">across all SOPs in {fullScreenDept.name}</span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {filtered.slice(0, 100).map((q, idx) => (
                          <div
                            key={`${q._bankId}-${q._originalIndex}`}
                            className="bg-[#131620] rounded-xl border border-slate-800/60 hover:border-purple-500/40 transition-all p-5"
                          >
                            {/* Question header */}
                            <div className="flex items-start justify-between gap-4 mb-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                                  {q._sopIdentifier}
                                </span>
                                <span className="text-[10px] text-gray-500">Q{q._originalIndex + 1}</span>
                                {q.difficulty && (
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                    q.difficulty === 'Easy' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                                    q.difficulty === 'Medium' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                                    'bg-red-500/10 text-red-400 border border-red-500/20'
                                  }`}>
                                    {q.difficulty}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {q.isChecked && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> Checked
                                  </span>
                                )}
                                {q.isSimilar && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" /> Similar
                                  </span>
                                )}
                                {q.isReviewed && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                                    <Star className="h-3 w-3" /> Reviewed
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Question text */}
                            <p className="text-sm text-gray-200 leading-relaxed mb-3 font-medium">
                              {q.question}
                            </p>

                            {/* Options */}
                            {q.options && q.options.length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {q.options.map((opt: any, optIdx: number) => {
                                  const optLabel = String.fromCharCode(65 + optIdx);
                                  const isCorrect = q.correctAnswer === optLabel || q.correctAnswer === opt;
                                  return (
                                    <div
                                      key={optIdx}
                                      className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                                        isCorrect
                                          ? 'bg-green-500/10 border border-green-500/30 text-green-300'
                                          : 'bg-white/5 border border-white/5 text-gray-400'
                                      }`}
                                    >
                                      <span className={`font-bold flex-shrink-0 ${isCorrect ? 'text-green-400' : 'text-gray-500'}`}>
                                        {optLabel}.
                                      </span>
                                      <span className="leading-relaxed">{opt}</span>
                                      {isCorrect && <CheckCircle2 className="h-3.5 w-3.5 text-green-400 ml-auto flex-shrink-0 mt-0.5" />}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}

                        {filtered.length > 100 && (
                          <div className="text-center py-4">
                            <p className="text-sm text-gray-500">Showing first 100 of {filtered.length} questions. Use search to narrow results.</p>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (

            /* SOP/Subcategory View — default */
            <div className="space-y-6">
              {sortSubcategories(
                fullScreenDept.subcategories
                  .map(sub => ({
                    ...sub,
                    sops: deptSearchTerm.trim()
                      ? sub.sops.filter(s => {
                          const st = deptSearchTerm.toLowerCase().trim();
                          return s.sopName.toLowerCase().includes(st) || s.sopCode.toLowerCase().includes(st);
                        })
                      : sub.sops,
                  }))
                  .filter(sub => sub.sops.length > 0),
                fullScreenDept.name
              ).map((subcat) => {
                const subcatKey = `${fullScreenDept.name}-${subcat.code}`;
                const isSubcatExpanded = expandedSubcats.has(subcatKey);

                return (
                  <div key={subcatKey} className={`rounded-2xl border border-white/5 overflow-hidden bg-gradient-to-br ${theme.subcatBg}`}>
                    {/* Subcategory Header */}
                    <div
                      onClick={() => toggleSubcategory(subcatKey)}
                      className="w-full px-6 py-5 flex items-center justify-between hover:bg-white/5 transition-all group cursor-pointer"
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
                          <p className="text-sm text-gray-400 mt-1 flex items-center gap-2">
                             {subcat.totalSOPs} SOPs • {subcat.totalQuestions} Questions
                             {(() => {
                               const stats = subcat.sops.reduce((acc, sop) => {
                                 acc.checked += sop.checkedCount || 0;
                                 acc.similar += sop.similarCount || 0;
                                 acc.reviewed += sop.reviewedCount || 0;
                                 return acc;
                               }, { checked: 0, similar: 0, reviewed: 0 });
                               return (
                               <span className="flex items-center gap-2 text-xs ml-2 border-l border-white/10 pl-2">
                                     <button 
                                      onClick={(e) => { e.stopPropagation(); toggleSubcatSort(subcatKey, 'checked'); }}
                                      className={`flex items-center gap-1 hover:underline ${stats.checked > 0 ? 'text-green-400' : 'text-gray-600'}`}
                                     >
                                       <div className={`w-1.5 h-1.5 rounded-full ${stats.checked > 0 ? 'bg-green-400' : 'bg-gray-600'}`}></div>
                                       {stats.checked} Checked
                                     </button>
                                     <button 
                                      onClick={(e) => { e.stopPropagation(); toggleSubcatSort(subcatKey, 'notChecked'); }}
                                      className={`flex items-center gap-1 hover:underline ${subcat.totalQuestions - stats.checked > 0 ? 'text-red-400' : 'text-gray-600'}`}
                                     >
                                       <div className={`w-1.5 h-1.5 rounded-full ${subcat.totalQuestions - stats.checked > 0 ? 'bg-red-400' : 'bg-gray-600'}`}></div>
                                       {subcat.totalQuestions - stats.checked} Not Checked
                                     </button>
                                     <button 
                                      onClick={(e) => { e.stopPropagation(); toggleSubcatSort(subcatKey, 'similar'); }}
                                      className={`flex items-center gap-1 hover:underline ${stats.similar > 0 ? 'text-orange-400' : 'text-gray-600'}`}
                                     >
                                       <div className={`w-1.5 h-1.5 rounded-full ${stats.similar > 0 ? 'bg-orange-400' : 'bg-gray-600'}`}></div>
                                       {stats.similar} Similar
                                     </button>
                                     <button 
                                      onClick={(e) => { e.stopPropagation(); toggleSubcatSort(subcatKey, 'reviewed'); }}
                                      className={`flex items-center gap-1 hover:underline ${stats.reviewed > 0 ? 'text-yellow-400' : 'text-gray-600'}`}
                                     >
                                        <div className={`w-1.5 h-1.5 rounded-full ${stats.reviewed > 0 ? 'bg-yellow-400' : 'bg-gray-600'}`}></div>
                                       {stats.reviewed} Reviewed
                                     </button>
                                   </span>
                               );
                             })()}
                          </p>
                        </div>
                      </div>
                      
                      <div className={`p-2 rounded-full ${isSubcatExpanded ? 'bg-white/10' : 'bg-transparent'} transition-colors`}>
                        <ChevronRight className={`h-5 w-5 ${theme.text} transition-transform duration-300 ${isSubcatExpanded ? 'rotate-90' : ''}`} />
                      </div>
                    </div>

                    {/* SOP Content Area */}
                    {isSubcatExpanded && (
                      <div className="px-6 pb-6 bg-black/20 border-t border-white/5">
                        {/* SOP Sort Controls */}
                        {subcat.sops.length > 1 && (
                          <div className="py-4 flex items-center justify-end gap-3">
                            <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Sort SOPs:</span>
                              <div className="flex bg-black/30 rounded-lg p-1">
                                {[
                                  { value: 'identifier', label: 'ID' },
                                   { value: 'name', label: 'Name' },
                                  { value: 'questions', label: 'Questions' }
                                ].map((sort) => (
                                  <button
                                    key={sort.value}
                                    onClick={() => toggleSubcatSort(subcatKey, sort.value as 'name' | 'questions' | 'identifier')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                      (subcatSortBy[subcatKey] || 'identifier') === sort.value
                                        ? 'bg-white/10 text-white shadow-sm'
                                        : 'text-gray-500 hover:text-gray-300'
                                    }`}
                                  >
                                    {sort.label}
                                  </button>
                                ))}
                                
                                <span className="w-px h-4 bg-white/10 mx-1"></span>
                                
                                {[
                                  { value: 'checked', label: 'Checked' },
                                  { value: 'notChecked', label: 'Not Checked' },
                                  { value: 'similar', label: 'Similar' },
                                  { value: 'reviewed', label: 'Reviewed' }
                                ].map((sort) => (
                                  <button
                                    key={sort.value}
                                    onClick={() => toggleSubcatSort(subcatKey, sort.value as any)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                      (subcatSortBy[subcatKey] || 'identifier') === sort.value
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

                        {/* SOP Grid - 2 columns, each SOP is a compact row */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                        {sortSOPs(subcat.sops, subcatKey).map((sop) => {
                          const hasQuestions = sop.totalQuestions > 0;

                          return (
                            <div
                              key={sop.sopId}
                              className="group relative bg-[#131620] rounded-xl border border-slate-800/60 hover:border-purple-500/50 hover:bg-[#1A1E2E] transition-all duration-200 overflow-hidden"
                            >
                              <div
                                onClick={() => sop.mcqBanks && sop.mcqBanks.length > 0 ? onViewMCQs(sop) : undefined}
                                className={`flex items-center gap-4 px-5 py-4 ${sop.mcqBanks && sop.mcqBanks.length > 0 ? 'cursor-pointer' : 'cursor-default'}`}
                              >
                                {/* Icon */}
                                <div className={`flex-shrink-0 p-2.5 rounded-xl transition-all duration-200 ${
                                  hasQuestions
                                    ? 'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20'
                                    : 'bg-gray-800/60 text-gray-600'
                                }`}>
                                  <FileText className="h-5 w-5" />
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                  {/* Identifier + count badges */}
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <h4 className="text-sm font-extrabold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-pink-300">
                                      {sop.sopCode}
                                    </h4>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                      hasQuestions
                                        ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                        : 'bg-gray-800/40 text-gray-500 border-gray-700'
                                    }`}>
                                      {sop.totalQuestions > 0 ? `${sop.totalQuestions} Qs` : 'No Qs'}
                                    </span>

                                    {/* Status badges - clickable */}
                                    {sop.similarCount && sop.similarCount > 0 ? (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); onViewMCQs(sop, 'similar'); }}
                                        className="text-[10px] font-bold px-2 py-0.5 rounded border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/25 transition-all flex items-center gap-1"
                                      >
                                        <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse"></div>
                                        {sop.similarCount} Similar
                                      </button>
                                    ) : null}
                                    {sop.checkedCount && sop.checkedCount > 0 ? (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); onViewMCQs(sop, 'checked'); }}
                                        className="text-[10px] font-bold px-2 py-0.5 rounded border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/25 transition-all flex items-center gap-1"
                                      >
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
                                        {sop.checkedCount} Checked
                                      </button>
                                    ) : null}
                                    {sop.reviewedCount && sop.reviewedCount > 0 ? (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); onViewMCQs(sop, 'reviewed'); }}
                                        className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/25 transition-all flex items-center gap-1"
                                      >
                                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
                                        {sop.reviewedCount} Reviewed
                                      </button>
                                    ) : null}
                                  </div>

                                  {/* SOP name */}
                                  <p className="text-gray-400 text-xs leading-tight group-hover:text-gray-200 transition-colors line-clamp-1">
                                    {cleanSOPName(sop.sopName, sop.sopCode)}
                                  </p>
                                </div>

                                {/* Arrow — only when has questions */}
                                {sop.mcqBanks && sop.mcqBanks.length > 0 ? (
                                  <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-600 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all" />
                                ) : (
                                  <div className="h-5 w-5 flex-shrink-0" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}</div>
            )}
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
