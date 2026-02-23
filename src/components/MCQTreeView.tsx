'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, BookOpen, Download, Eye, SortAsc, SortDesc, Star, Search, Loader2, X, ArrowLeft, CheckCircle2, AlertTriangle, AlertCircle, MessageSquare, Info, ArrowRight, Users, Maximize2, Minimize2 } from 'lucide-react';
import Link from 'next/link';
import { normalizeDepartmentName } from '@/lib/mcqTreeBuilder';

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
// Helper to get department theme colors - High Quality Vibrance
const getDeptTheme = (deptName: string) => {
  const name = deptName.toLowerCase();
  
  if (name.includes('qa')) return {
    text: 'text-purple-400',
    textHover: 'group-hover:text-purple-300',
    bg: 'bg-purple-600',
    badge: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
    border: 'border-purple-600',
    borderHover: 'hover:border-purple-400',
    gradient: 'from-purple-900/40 via-indigo-900/40 to-[#0a0817]/40',
    subcatBg: 'from-purple-900/20 to-purple-800/10',
    icon: 'text-purple-500',
    secondary: 'text-purple-200',
    button: 'bg-purple-600 hover:bg-purple-700 shadow-purple-500/20'
  };
  
  if (name.includes('qc')) return {
    text: 'text-blue-400',
    textHover: 'group-hover:text-blue-300',
    bg: 'bg-blue-600',
    badge: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    border: 'border-blue-600',
    borderHover: 'hover:border-blue-400',
    gradient: 'from-blue-900/40 via-cyan-900/40 to-[#0a0817]/40',
    subcatBg: 'from-blue-900/20 to-blue-800/10',
    icon: 'text-blue-500',
    secondary: 'text-blue-200',
    button: 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
  };

  if (name.includes('microbiology')) return {
    text: 'text-orange-400',
    textHover: 'group-hover:text-orange-300',
    bg: 'bg-orange-600',
    badge: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
    border: 'border-orange-600', 
    borderHover: 'hover:border-orange-400',
    gradient: 'from-orange-900/40 via-amber-900/40 to-[#0a0817]/40',
    subcatBg: 'from-orange-900/20 to-orange-800/10',
    icon: 'text-orange-500',
    secondary: 'text-orange-200',
    button: 'bg-orange-600 hover:bg-orange-700 shadow-orange-500/20'
  };

  if (name.includes('production')) return {
    text: 'text-emerald-400',
    textHover: 'group-hover:text-emerald-300',
    bg: 'bg-emerald-600',
    badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    border: 'border-emerald-600',
    borderHover: 'hover:border-emerald-400',
    gradient: 'from-purple-900/40 via-indigo-900/40 to-[#0a0817]/40',
    subcatBg: 'from-purple-900/20 to-purple-800/10',
    icon: 'text-purple-500',
    secondary: 'text-purple-200',
    button: 'bg-purple-600 hover:bg-purple-700 shadow-purple-500/20'
  };
  
  if (name.includes('store')) return {
    text: 'text-amber-400',
    textHover: 'group-hover:text-amber-300',
    bg: 'bg-amber-600',
    badge: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    border: 'border-amber-600',
    borderHover: 'hover:border-amber-400',
    gradient: 'from-amber-900/40 via-yellow-900/40 to-[#0a0817]/40',
    subcatBg: 'from-amber-900/20 to-amber-800/10',
    icon: 'text-amber-500',
    secondary: 'text-amber-200',
    button: 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/20'
  };

  if (name.includes('engineering')) return {
    text: 'text-cyan-400',
    textHover: 'group-hover:text-cyan-300',
    bg: 'bg-cyan-600',
    badge: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
    border: 'border-cyan-600',
    borderHover: 'hover:border-cyan-400',
    gradient: 'from-cyan-900/40 via-blue-900/40 to-[#0a0817]/40',
    subcatBg: 'from-cyan-900/20 to-cyan-800/10',
    icon: 'text-cyan-500',
    secondary: 'text-cyan-200',
    button: 'bg-cyan-600 hover:bg-cyan-700 shadow-cyan-500/20'
  };

  if (name.includes('personnel') || name.includes('hr')) return {
    text: 'text-pink-400',
    textHover: 'group-hover:text-pink-300',
    bg: 'bg-pink-600',
    badge: 'bg-pink-500/10 border-pink-500/20 text-pink-400',
    border: 'border-pink-600',
    borderHover: 'hover:border-pink-400',
    gradient: 'from-pink-900/40 via-rose-900/40 to-[#0a0817]/40',
    subcatBg: 'from-pink-900/20 to-pink-800/10',
    icon: 'text-pink-500',
    secondary: 'text-pink-200',
    button: 'bg-pink-600 hover:bg-pink-700 shadow-pink-500/20'
  };

  return {
    text: 'text-indigo-400',
    textHover: 'group-hover:text-indigo-300',
    bg: 'bg-indigo-600',
    badge: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
    border: 'border-indigo-600',
    borderHover: 'hover:border-indigo-400',
    gradient: 'from-[#0a0817] to-indigo-950/40',
    subcatBg: 'from-[#0a0817]/50 to-indigo-950/20',
    icon: 'text-indigo-500',
    secondary: 'text-indigo-200',
    button: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20'
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
  icon?: string;
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
  trainerMappings?: Record<string, string>;
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
  trainerMappings = {},
}: MCQTreeViewProps) {
  const [isCinemaMode, setIsCinemaMode] = useState(false);
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
  // Similar questions grouping state
  const [similarGroups, setSimilarGroups] = useState<any[]>([]);
  const [loadingSimilarGroups, setLoadingSimilarGroups] = useState(false);

  const [loadingDeptQuestions, setLoadingDeptQuestions] = useState(false);

  // Fetch all questions for a department when switching to questions view
  const fetchDeptQuestions = useCallback(async (deptName: string, filter: 'checked' | 'similar' | 'reviewed' | 'notChecked') => {
    // If filter is 'similar', we use a specialized fetch for grouped data
    if (filter === 'similar') {
      setLoadingSimilarGroups(true);
      try {
        const res = await fetch(`/api/similar-questions?department=${encodeURIComponent(deptName)}`, { cache: 'no-store' });
        const data = await res.json();
        if (data.success) {
          setSimilarGroups(data.similarQuestions || []);
        } else {
          setSimilarGroups([]);
        }
      } catch (err) {
        console.error('Error fetching similar groups:', err);
      } finally {
        setLoadingSimilarGroups(false);
      }
      return; // Skip normal fetch
    }

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
    setDeptSearchTerm('');
    setDeptQuestions([]);
    setSimilarGroups([]);
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
          <div key={dept.name} className={`rounded-3xl border border-white/5 ${theme.borderHover} bg-gradient-to-br ${theme.subcatBg} transition-all duration-300 transform hover:scale-[1.03] shadow-xl hover:shadow-2xl overflow-hidden cursor-pointer group`}>
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
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <p className="text-sm text-gray-400">
                        {dept.subcategories.length} Subcategor{dept.subcategories.length !== 1 ? 'ies' : 'y'}
                      </p>
                      {(() => {
                        const normalizedKey = normalizeDepartmentName(dept.name).toLowerCase();
                        const trainerName = trainerMappings[normalizedKey] || 
                                           trainerMappings[dept.name.toLowerCase()] || 
                                           trainerMappings[dept.name];
                        if (!trainerName) return null;
                        return (
                          <>
                            <span className="h-1 w-1 rounded-full bg-gray-600" />
                            <div className={`px-2 py-0.5 rounded-lg border ${theme.badge} text-[10px] font-black uppercase tracking-wider animate-in fade-in zoom-in duration-500`}>
                              <span className="opacity-60 mr-1">Trainer:</span>
                              {trainerName}
                            </div>
                          </>
                        );
                      })()}
                    </div>
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

    {/* Full-Screen Department Modal - Premium Overhaul */}
    {fullScreenDept && (() => {
      const theme = getDeptTheme(fullScreenDept.name);
      return (
        <div 
          className="fixed inset-0 z-[60] bg-[#0D1117] flex flex-col animate-in fade-in slide-in-from-bottom-8 duration-500"
          style={{ transform: `translate(${modalPosition.x}px, ${modalPosition.y}px)` }}
        >
          {/* Header Area with Rich Dynamic Gradients - Draggable Header */}
          {!isCinemaMode && (
            <div 
              onMouseDown={handleMouseDown}
              className={`relative px-10 pt-8 pb-12 bg-gradient-to-br ${theme.gradient} border-b border-white/5 overflow-hidden shrink-0 shadow-2xl cursor-grab active:cursor-grabbing animate-in slide-in-from-top duration-500`}
            >
            {/* Ambient Background Elements */}

            
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-10">
                <div className={`w-24 h-24 rounded-[32px] ${theme.badge} flex items-center justify-center text-5xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/10 group hover:scale-105 transition-transform duration-500`}>
                  <span className="drop-shadow-2xl">{fullScreenDept.icon || '📁'}</span>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    <h2 className="text-5xl font-black text-white tracking-tight">
                      {fullScreenDept.name}
                    </h2>
                    <div className="flex flex-col gap-2">
                       <span className="w-fit px-4 py-1.5 rounded-2xl bg-white/10 border border-white/10 text-white/40 text-xs font-bold uppercase tracking-[0.3em]">
                         Digital Repository
                       </span>
                       {trainerMappings[fullScreenDept.name.toLowerCase()] && (
                          <div className={`w-fit px-5 py-2.5 rounded-2xl border ${theme.badge} shadow-2xl animate-in slide-in-from-left-4 duration-700`}>
                             <div className="flex items-center gap-3">
                                <Users className="h-4 w-4 opacity-50" />
                                <div className="flex flex-col">
                                   <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-50 mb-0.5">Assigned Trainer</span>
                                   <span className="text-sm font-black tracking-tight">{trainerMappings[fullScreenDept.name.toLowerCase()]}</span>
                                </div>
                             </div>
                          </div>
                       )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_#6366f1]" />
                      <span className="text-sm font-bold text-white/50 uppercase tracking-widest leading-none">
                        <strong className="text-white mr-1.5">{fullScreenDept.totalQuestions}</strong> Question Units
                      </span>
                    </div>
                    <div className="w-px h-4 bg-white/10" />
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]" />
                      <span className="text-sm font-bold text-white/50 uppercase tracking-widest leading-none">
                        <strong className="text-white mr-1.5">{fullScreenDept.totalSOPs}</strong> Active SOPs
                      </span>
                    </div>
                  </div>

                  {/* High Quality Filter Pills */}
                  {(() => {
                    const stats = { checked: 0, similar: 0, reviewed: 0 };
                    fullScreenDept.subcategories.forEach(sub => {
                      sub.sops.forEach(sop => {
                        stats.checked += sop.checkedCount || 0;
                        stats.similar += sop.similarCount || 0;
                        stats.reviewed += sop.reviewedCount || 0;
                      });
                    });
                    
                    const filterPills = [
                      { id: 'checked' as const, label: 'Approved', count: stats.checked,
                        active: 'bg-gradient-to-r from-purple-600 to-indigo-600 border-white/20 text-white shadow-[0_0_30px_rgba(147,51,234,0.3)]',
                        inactive: 'bg-purple-500/5 border-purple-500/10 text-purple-400 hover:bg-purple-500/10',
                        dot: 'bg-purple-400' },
                      { id: 'notChecked' as const, label: 'Not Checked', count: (fullScreenDept.totalQuestions || 0) - stats.checked,
                        active: 'bg-rose-600 border-white/20 text-white shadow-[0_0_30px_rgba(225,29,72,0.3)]',
                        inactive: 'bg-rose-500/5 border-rose-500/10 text-rose-400 hover:bg-rose-500/10',
                        dot: 'bg-rose-400' },
                      { id: 'similar' as const, label: 'Similar', count: stats.similar,
                        active: 'bg-orange-600 border-white/20 text-white shadow-[0_0_30_rgba(234,88,12,0.3)]',
                        inactive: 'bg-orange-500/5 border-orange-500/10 text-orange-400 hover:bg-orange-500/10',
                        dot: 'bg-orange-400' },
                      { id: 'reviewed' as const, label: 'Reviewed', count: stats.reviewed,
                        active: 'bg-indigo-600 border-white/20 text-white shadow-[0_0_30px_rgba(79,70,229,0.3)]',
                        inactive: 'bg-indigo-500/5 border-indigo-500/10 text-indigo-400 hover:bg-indigo-500/10',
                        dot: 'bg-indigo-400' },
                    ];
                    
                    return (
                      <div className="flex flex-wrap gap-2.5 mt-8">
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
                            className={`inline-flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] px-6 py-3 rounded-2xl border transition-all duration-300 ${
                              deptFilterMode === pill.id ? pill.active : pill.inactive
                            }`}
                          >
                            <div className={`w-2 h-2 rounded-full ${pill.dot} shadow-[0_0_8px_currentColor]`} />
                            {pill.label}: {pill.count}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <Link href="/mcq-review">
                   <button className="flex items-center gap-3 px-8 py-4 bg-white/10 hover:bg-white/20 text-white rounded-[24px] border border-white/10 transition-all font-bold text-xs uppercase tracking-widest backdrop-blur-xl shadow-2xl group">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400 group-hover:scale-125 transition-transform" />
                    Review Center
                  </button>
                </Link>

                <button
                  onClick={() => setIsCinemaMode(true)}
                  className="p-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[24px] transition-all group shadow-xl"
                  title="Expand View (Cinema Mode)"
                >
                  <Maximize2 className="h-6 w-6 text-white/70 group-hover:text-white transition-all duration-300" />
                </button>

                <button
                  onClick={() => setFullScreenDept(null)}
                  className="p-5 bg-white/5 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/40 rounded-[24px] transition-all group shadow-xl"
                >
                  <X className="h-6 w-6 text-white/70 group-hover:text-white group-hover:rotate-90 transition-all duration-300" />
                </button>
              </div>
            </div>
            </div>
          )}

          {/* Action Toolbar: Search & View Controls */}
          <div className="px-10 py-5 bg-[#0D1117] border-b border-white/5 shrink-0 flex items-center justify-between shadow-lg">
            {isCinemaMode && (
              <div className="flex items-center gap-4 mr-6">
                <button
                  onClick={() => setIsCinemaMode(false)}
                  className="p-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/20 transition-all group"
                  title="Exit Expand View"
                >
                  <Minimize2 className="h-5 w-5" />
                </button>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-none mb-1">{fullScreenDept.name}</span>
                  <span className="text-[8px] font-bold text-gray-600 uppercase tracking-tighter">Expand View Active</span>
                </div>
              </div>
            )}
            <div className="flex items-center gap-6 flex-1 max-w-4xl">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                <input
                  type="text"
                  placeholder="Query department SOPs, codes, or specific questions..."
                  value={deptSearchTerm}
                  onChange={e => setDeptSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-10 py-3.5 bg-slate-800/40 border border-white/10 rounded-2xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all"
                />
                {deptSearchTerm && (
                  <button onClick={() => setDeptSearchTerm('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* View Strategy Toggle */}
              {deptFilterMode === 'sops' ? (
                <div className="flex items-center gap-2 bg-slate-800/30 p-1.5 rounded-2xl border border-white/5">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-3 mr-1">Sort by:</span>
                  {[
                    { value: 'name', label: 'Identity' },
                    { value: 'sops', label: 'Density' },
                    { value: 'questions', label: 'Volume' }
                  ].map((sort) => (
                    <button
                      key={sort.value}
                      onClick={() => toggleDeptSort(fullScreenDept.name, sort.value as 'name' | 'sops' | 'questions')}
                      className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${
                        deptSortBy[fullScreenDept.name] === sort.value
                          ? `${theme.button} text-white shadow-xl`
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {sort.label}
                      {deptSortBy[fullScreenDept.name] === sort.value && (
                        deptSortOrder[fullScreenDept.name] === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setDeptFilterMode('sops')}
                    className="flex items-center gap-2.5 px-6 py-3 bg-white/5 hover:bg-white/10 text-indigo-400 hover:text-indigo-300 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border border-white/10"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Return to Structural View
                  </button>
                  
                  {deptFilterMode !== 'similar' && (
                    <button
                      onClick={() => {
                        setDeptFilterMode('similar');
                        fetchDeptQuestions(fullScreenDept.name, 'similar');
                      }}
                       className="flex items-center gap-2.5 px-6 py-3 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 hover:text-orange-300 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border border-orange-500/20"
                    >
                      <AlertCircle className="h-4 w-4" />
                      Check Similar
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Main Scroll Content */}
          <div className="overflow-y-auto flex-1 p-10 space-y-8 custom-scrollbar bg-[#0D1117]">
            {deptFilterMode !== 'sops' ? (
              <div className="max-w-6xl mx-auto">
                {loadingDeptQuestions ? (
                  <div className="flex flex-col items-center justify-center py-32 space-y-6">
                    <div className="relative">
                      <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 text-indigo-400 animate-pulse" />
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-white font-bold tracking-widest uppercase text-xs">Cataloging Assets</p>
                      <p className="text-gray-500 text-sm mt-1">Indexing questions across all SOP identifiers...</p>
                    </div>
                  </div>
                ) : (() => {
                  let filtered = deptQuestions.filter(q => {
                    if (deptFilterMode === 'checked') return q.isChecked === true;
                    if (deptFilterMode === 'notChecked') return q.isChecked !== true;
                    if (deptFilterMode === 'similar') return false; // Handled by separate view
                    if (deptFilterMode === 'reviewed') return q.isReviewed === true;
                    return true;
                  });

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
                      <div className="flex flex-col items-center justify-center py-32 text-center">
                        <div className="w-20 h-20 bg-white/5 rounded-[40px] flex items-center justify-center mb-6 border border-white/5 shadow-inner">
                          <BookOpen className="h-10 w-10 text-gray-700" />
                        </div>
                        <h3 className="text-2xl font-bold text-gray-400">Inventory Empty</h3>
                        <p className="text-gray-600 text-sm mt-2">No question units currently match your specified filters.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 mb-8 px-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_10px_#6366f1]" />
                        <h3 className="text-lg font-bold text-white tracking-tight">
                          Displaying <span className="text-indigo-400">{filtered.length} matching units</span> across department records
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        {filtered.slice(0, 100).map((q) => (
                          <div
                            key={`${q._bankId}-${q._originalIndex}`}
                            className="group relative bg-[#131722] rounded-[32px] border border-white/5 p-8 hover:border-indigo-500/40 transition-all duration-500 hover:shadow-[0_20px_60px_rgba(0,0,0,0.5)] overflow-hidden"
                          >
                            {/* Hover Backdrop Decor */}
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                            
                            <div className="relative flex items-center justify-between mb-6">
                              <div className="flex items-center gap-3">
                                <div className="px-3 py-1 bg-black/40 rounded-xl border border-white/5 text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                                  {q._sopIdentifier}
                                </div>
                                <div className="px-3 py-1 bg-black/40 rounded-xl border border-white/5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                  Unit #{q._originalIndex + 1}
                                </div>
                                {q.difficulty && (
                                  <div className={`px-3 py-1 rounded-xl border text-[10px] font-bold uppercase tracking-widest ${
                                    q.difficulty === 'Easy' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                    q.difficulty === 'Medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                    'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                  }`}>
                                    {q.difficulty}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {q.isChecked && <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20"><CheckCircle2 className="h-4 w-4" /></div>}
                                {q.isSimilar && <div className="p-2 bg-orange-500/10 text-orange-400 rounded-xl border border-orange-500/20"><AlertCircle className="h-4 w-4" /></div>}
                                {q.isReviewed && <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20"><Star className="h-4 w-4" /></div>}
                              </div>
                            </div>

                            <h3 className="text-xl font-bold text-gray-100 leading-tight mb-8 tracking-tight group-hover:text-white transition-colors">
                              {q.question.replace(/^⭐\s*/, '')}
                            </h3>

                            {q.options && q.options.length > 0 && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {q.options.map((opt: any, optIdx: number) => {
                                  const optLabel = String.fromCharCode(65 + optIdx);
                                  const isCorrect = q.correctAnswer === optLabel || q.correctAnswer === opt || 
                                    (q.optionVariants && q.optionVariants.find((v:any) => v.text === opt)?.isCorrect);

                                  return (
                                    <div
                                      key={optIdx}
                                      className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                                        isCorrect 
                                          ? 'bg-emerald-500/10 border-emerald-500/30' 
                                          : 'bg-black/20 border-white/5'
                                      }`}
                                    >
                                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold border ${
                                        isCorrect ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg' : 'bg-white/5 text-gray-500 border-white/10'
                                      }`}>
                                        {optLabel}
                                      </div>
                                      <span className={`text-sm ${isCorrect ? 'text-emerald-400 font-bold' : 'text-gray-400'}`}>{opt}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Similar Questions Special View */}
                {deptFilterMode === 'similar' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                     {loadingSimilarGroups ? (
                        <div className="flex flex-col items-center justify-center py-20 space-y-6">
                            <div className="relative">
                                <div className="w-16 h-16 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <AlertCircle className="h-6 w-6 text-orange-400 animate-pulse" />
                                </div>
                            </div>
                            <div className="text-center">
                                <p className="text-white font-bold tracking-widest uppercase text-xs">Clusters Detected</p>
                                <p className="text-gray-500 text-sm mt-1 animate-pulse">Analyzing similarity vectors and grouping related questions...</p>
                            </div>
                        </div>
                     ) : similarGroups.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 bg-white/5 rounded-[40px] border border-white/5 text-center shadow-inner">
                            <div className="w-24 h-24 bg-orange-500/10 rounded-full flex items-center justify-center mb-6 text-orange-400 border border-orange-500/20 shadow-[0_0_30px_rgba(249,115,22,0.1)]">
                                <CheckCircle2 className="h-10 w-10" />
                            </div>
                            <h3 className="text-3xl font-black text-white tracking-tight mb-2">No Similarities Detected</h3>
                            <p className="text-gray-400 text-sm max-w-md mx-auto leading-relaxed">
                                Great news! No duplicate or similar questions were found in the <span className="text-indigo-400 font-bold">{fullScreenDept.name}</span> department. The repository is clean.
                            </p>
                        </div>
                     ) : (
                        <div className="space-y-8">
                            <div className="flex items-center justify-between px-2">
                                <div className="flex items-center gap-4">
                                    <div className="w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_15px_#f97316]" />
                                    <h3 className="text-2xl font-black text-white tracking-tight">
                                        Detected <span className="text-orange-400">{similarGroups.length} Similarity Clusters</span>
                                    </h3>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-white/5 px-4 py-2 rounded-xl border border-white/5">
                                        Grouped by Primary Question
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-8">
                                {similarGroups.map((group) => (
                                    <div key={group._id} className="bg-[#131722] rounded-[40px] border border-white/5 overflow-hidden shadow-2xl hover:shadow-[0_20px_60px_rgba(0,0,0,0.4)] transition-all duration-500 group">
                                        {/* Group Header */}
                                        <div className="bg-gradient-to-r from-white/[0.03] to-transparent border-b border-white/5 px-10 py-6 flex items-center justify-between">
                                            <div className="flex items-center gap-6">
                                                <div className="px-4 py-1.5 bg-black/40 rounded-xl border border-white/10 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] shadow-inner">
                                                    {group.sopIdentifier}
                                                </div>
                                                <div className="px-4 py-1.5 bg-orange-500/10 rounded-xl border border-orange-500/20 text-[11px] font-black text-orange-400 uppercase tracking-[0.2em] flex items-center gap-2 shadow-[0_0_15px_rgba(249,115,22,0.1)]">
                                                    <AlertCircle className="h-3 w-3" />
                                                    Pending Review
                                                </div>
                                            </div>
                                            <span className="text-[10px] text-gray-600 font-mono tracking-widest uppercase">ID: {group._id.slice(-6)}</span>
                                        </div>

                                        <div className="p-10 grid grid-cols-1 xl:grid-cols-2 gap-12 relative">
                                            {/* Vertical Divider */}
                                            <div className="hidden xl:block absolute top-10 bottom-10 left-1/2 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />

                                            {/* Primary Question Column */}
                                            <div className="space-y-6">
                                                <div className="flex items-center gap-4 border-b border-indigo-500/10 pb-4">
                                                    <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
                                                        <Star className="h-5 w-5 fill-indigo-400" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-indigo-100 uppercase tracking-widest leading-none mb-1">Primary Question</h4>
                                                        <p className="text-[10px] font-bold text-indigo-400/60 uppercase tracking-wider">The source of truth</p>
                                                    </div>
                                                </div>
                                                
                                                <div className="p-8 rounded-[24px] bg-gradient-to-b from-indigo-500/[0.03] to-transparent border border-indigo-500/10 group-hover:border-indigo-500/20 transition-all shadow-inner">
                                                    <p className="text-lg font-medium text-gray-100 leading-relaxed mb-8 tracking-tight">
                                                        {group.primaryQuestion.question?.question?.replace(/^⭐\s*/, '') || 'Question text missing'}
                                                    </p>
                                                    
                                                    <div className="space-y-3">
                                                        {group.primaryQuestion.question?.options?.map((opt: string, i: number) => {
                                                            const isCorrect = opt === group.primaryQuestion.question?.correctAnswer;
                                                            return (
                                                                <div key={i} className={`px-5 py-4 rounded-2xl border text-sm flex items-center gap-4 transition-all ${isCorrect ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-black/20 border-white/5 text-gray-400 hover:bg-white/5'}`}>
                                                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold border ${isCorrect ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg' : 'bg-white/5 border-white/10 text-gray-500'}`}>
                                                                        {String.fromCharCode(65 + i)}
                                                                    </span>
                                                                    <span className="leading-snug">{opt}</span>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Similar Question Column */}
                                            <div className="space-y-6">
                                                <div className="flex items-center gap-4 border-b border-orange-500/10 pb-4">
                                                    <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.15)]">
                                                        <AlertCircle className="h-5 w-5" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-orange-100 uppercase tracking-widest leading-none mb-1">Similar Variant ({group.similarQuestions.length})</h4>
                                                        <p className="text-[10px] font-bold text-orange-400/60 uppercase tracking-wider">Detected duplicate candidate</p>
                                                    </div>
                                                </div>

                                                {group.similarQuestions.map((sq: any, idx: number) => (
                                                    <div key={idx} className="p-8 rounded-[24px] bg-gradient-to-b from-orange-500/[0.03] to-transparent border border-orange-500/10 group-hover:border-orange-500/20 transition-all relative shadow-inner">
                                                        <div className="absolute top-0 right-0 p-6">
                                                            <div className="px-3 py-1.5 bg-orange-500/20 rounded-lg border border-orange-500/30 text-[10px] font-black text-orange-300 uppercase tracking-wider shadow-[0_0_15px_rgba(249,115,22,0.2)]">
                                                                {sq.similarityScore}% Match
                                                            </div>
                                                        </div>

                                                        <p className="text-lg font-medium text-gray-100 leading-relaxed mb-8 pr-20 tracking-tight">
                                                            {sq.question?.question?.replace(/^⭐\s*/, '') || 'Question text missing'}
                                                        </p>
                                                        
                                                        <div className="space-y-3">
                                                            {sq.question?.options?.map((opt: string, i: number) => {
                                                                const isCorrect = opt === sq.question?.correctAnswer;
                                                                return (
                                                                    <div key={i} className={`px-5 py-4 rounded-2xl border text-sm flex items-center gap-4 transition-all ${isCorrect ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-black/20 border-white/5 text-gray-400 hover:bg-white/5'}`}>
                                                                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold border ${isCorrect ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg' : 'bg-white/5 border-white/10 text-gray-500'}`}>
                                                                            {String.fromCharCode(65 + i)}
                                                                        </span>
                                                                        <span className="leading-snug">{opt}</span>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        
                                        {/* Action Footer */}
                                        <div className="bg-black/40 px-10 py-5 flex items-center justify-between border-t border-white/5 backdrop-blur-xl">
                                            <div className="flex items-center gap-4 text-[10px] text-gray-500 font-medium uppercase tracking-widest">
                                                <Info className="h-4 w-4" />
                                                <span>Review required to resolve conflict</span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <button className="px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/5 transition-all">
                                                    Ignore
                                                </button>
                                                <Link href={`/mcq-review?tab=similar&id=${group._id}`}>
                                                    <button className="px-8 py-3 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-black uppercase tracking-widest shadow-[0_10px_30px_rgba(249,115,22,0.3)] hover:shadow-[0_10px_40px_rgba(249,115,22,0.4)] transition-all flex items-center gap-3 transform hover:-translate-y-1">
                                                        Resolve Conflict
                                                        <ArrowRight className="h-4 w-4" />
                                                    </button>
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                     )}
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full space-y-8">
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
                    <div key={subcatKey} className={`rounded-[24px] border border-white/5 overflow-hidden bg-[#1a1625] focus-within:ring-2 focus-within:ring-indigo-500/30 transition-all shadow-xl shadow-black/20`}>

                      <div
                        onClick={() => toggleSubcategory(subcatKey)}
                        className={`w-full px-8 py-6 flex items-center justify-between transition-all group cursor-pointer ${isSubcatExpanded ? 'bg-white/[0.02] border-b border-white/5' : 'hover:bg-white/[0.02]'}`}
                      >
                        <div className="flex items-center gap-6">
                          <div className={`p-3.5 rounded-2xl bg-[#231f36] ${theme.text} shadow-lg ring-1 ring-white/5`}>
                            {isSubcatExpanded ? <FolderOpen className="h-7 w-7" /> : <Folder className="h-7 w-7" />}
                          </div>
                          <div className="text-left space-y-1">
                            <h4 className="text-xl font-bold text-gray-200 tracking-tight flex items-center gap-3 group-hover:text-white transition-colors">
                              {subcat.name}
                              <span className="text-[10px] px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 font-bold uppercase tracking-wider border border-indigo-500/20">{subcat.code}</span>
                            </h4>
                            <div className="flex items-center gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                               <span>{subcat.totalSOPs} Active SOPs</span>
                               <span className="w-1 h-1 rounded-full bg-gray-700" />
                               <span>{subcat.totalQuestions} Questions</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className={`p-2.5 rounded-xl ${isSubcatExpanded ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/5 text-gray-600'} transition-all group-hover:bg-indigo-500/10 group-hover:text-indigo-400`}>
                          <ChevronRight className={`h-5 w-5 transition-transform duration-300 ${isSubcatExpanded ? 'rotate-90' : ''}`} />
                        </div>
                      </div>

                      {isSubcatExpanded && (
                        <div className="bg-[#13111c]/30 animate-in slide-in-from-top-2 duration-300 border-t border-white/5 shadow-inner">
                           <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-white/5">
                            {sortSOPs(subcat.sops, subcatKey).map((sop) => {
                              const hasQuestions = sop.totalQuestions > 0;
                              return (
                                <div
                                  key={sop.sopId}
                                  onClick={() => sop.mcqBanks && sop.mcqBanks.length > 0 ? onViewMCQs(sop) : undefined}
                                  className={`group relative bg-[#1a1625] hover:bg-[#231f36] transition-all duration-200 cursor-pointer flex items-center justify-between px-8 py-6`}
                                >
                                  {/* Ambient Row Light */}
                                  <div className="absolute inset-y-0 left-0 w-1 bg-indigo-500/0 group-hover:bg-indigo-500 transition-all" />
                                  
                                  <div className="flex items-center gap-5">
                                    <div className={`p-3.5 rounded-2xl bg-white/5 text-gray-500 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-all border border-transparent group-hover:border-indigo-500/20`}>
                                      <FileText className="h-6 w-6" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                                      <div className="flex flex-col min-w-0">
                                        <div className="flex items-center gap-2">
                                          <h4 className="text-sm font-black text-white tracking-widest uppercase">
                                            {sop.sopCode}
                                          </h4>
                                          {(() => {
                                            const upCode = sop.sopCode.toUpperCase().trim();
                                            const baseCodeMatch = upCode.match(/^([A-Z]{2,4}\d+)/);
                                            const baseCode = baseCodeMatch ? baseCodeMatch[1] : '';
                                            
                                            const sopTrainer = trainerMappings[upCode] || (baseCode && trainerMappings[baseCode]);
                                            const deptName = fullScreenDept?.name || '';
                                            const nk = normalizeDepartmentName(deptName).toLowerCase();
                                            const deptTrainer = trainerMappings[nk] || trainerMappings[deptName.toLowerCase()];
                                            
                                            const trainerName = sopTrainer || deptTrainer;
                                            if (!trainerName) return null;
                                            
                                            return (
                                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20 tracking-wider flex items-center gap-1.5 ml-2">
                                                <Users className="h-3 w-3" />
                                                {trainerName}
                                              </span>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                         <span className={`text-[9px] font-black px-2.5 py-0.5 rounded-[8px] border uppercase tracking-widest ${
                                           hasQuestions ? 'bg-black/40 text-gray-400 border-white/10' : 'bg-gray-800 text-gray-600 border-transparent'
                                         }`}>
                                           {sop.totalQuestions} Qs
                                         </span>
                                         {(sop.similarCount || 0) > 0 && (
                                           <span className="text-[9px] font-black px-2 py-0.5 rounded-[8px] border bg-orange-500/10 text-orange-400 border-orange-500/20 uppercase tracking-widest flex items-center gap-1">
                                             <span className="w-1 h-1 rounded-full bg-orange-400 shadow-[0_0_5px_currentColor]" />
                                             {sop.similarCount} Similar
                                           </span>
                                         )}
                                         {(sop.checkedCount || 0) > 0 && (
                                           <span className="text-[9px] font-black px-2 py-0.5 rounded-[8px] border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 uppercase tracking-widest flex items-center gap-1">
                                             <span className="w-1 h-1 rounded-full bg-emerald-400 shadow-[0_0_5px_currentColor]" />
                                             {sop.checkedCount} Checked
                                           </span>
                                         )}
                                         {(sop.reviewedCount || 0) > 0 && (
                                           <span className="text-[9px] font-black px-2 py-0.5 rounded-[8px] border bg-indigo-500/10 text-indigo-400 border-indigo-500/20 uppercase tracking-widest flex items-center gap-1">
                                             <span className="w-1 h-1 rounded-full bg-indigo-400 shadow-[0_0_5px_currentColor]" />
                                             {sop.reviewedCount} Reviewed
                                           </span>
                                         )}

                                      </div>
                                      <p className="text-xs text-gray-500 font-medium group-hover:text-gray-300 transition-colors truncate">
                                        {cleanSOPName(sop.sopName, sop.sopCode)}
                                      </p>
                                    </div>
                                    <div className="p-2 rounded-lg bg-white/5 text-gray-600 group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-colors">
                                      <ChevronRight className="h-4 w-4" />
                                    </div>
                                  </div>
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
            )}
          </div>
        </div>
      );
    })()}
    </div>
  );
}
