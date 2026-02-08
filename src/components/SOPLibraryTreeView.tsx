'use client';

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Video, Brain, Eye, BookOpen } from 'lucide-react';

interface SOPLibraryItem {
  _id: string;
  sopId: any;
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
  
  // Sorting state
  const [sortBy, setSortBy] = useState<'identifier' | 'name' | 'status'>('identifier');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
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

  // Department theme colors (matching MCQ Bank)
  const getDeptTheme = (deptName: string) => {
    const name = deptName.toLowerCase();
    
    if (name.includes('qa')) return {
      text: 'text-purple-400',
      textHover: 'group-hover:text-purple-300',
      bg: 'bg-purple-500',
      border: 'border-purple-500/30',
      borderHover: 'hover:border-purple-500',
      gradient: 'from-purple-900/40 to-indigo-900/40',
      icon: 'text-purple-400'
    };
    
    if (name.includes('qc')) return {
      text: 'text-blue-400',
      textHover: 'group-hover:text-blue-300',
      bg: 'bg-blue-500',
      border: 'border-blue-500/30',
      borderHover: 'hover:border-blue-500',
      gradient: 'from-blue-900/40 to-cyan-900/40',
      icon: 'text-blue-400'
    };

    if (name.includes('microbiology')) return {
      text: 'text-orange-400',
      textHover: 'group-hover:text-orange-300',
      bg: 'bg-orange-500',
      border: 'border-orange-500/30',
      borderHover: 'hover:border-orange-500',
      gradient: 'from-orange-900/40 to-amber-900/40',
      icon: 'text-orange-400'
    };

    if (name.includes('production')) return {
      text: 'text-emerald-400',
      textHover: 'group-hover:text-emerald-300',
      bg: 'bg-emerald-500',
      border: 'border-emerald-500/30',
      borderHover: 'hover:border-emerald-500',
      gradient: 'from-emerald-900/40 to-green-900/40',
      icon: 'text-emerald-400'
    };
    
    if (name.includes('store')) return {
      text: 'text-yellow-400',
      textHover: 'group-hover:text-yellow-300',
      bg: 'bg-yellow-500',
      border: 'border-yellow-500/30',
      borderHover: 'hover:border-yellow-500',
      gradient: 'from-yellow-900/40 to-amber-900/40',
      icon: 'text-yellow-400'
    };

    if (name.includes('engineering')) return {
      text: 'text-cyan-400',
      textHover: 'group-hover:text-cyan-300',
      bg: 'bg-cyan-500',
      border: 'border-cyan-500/30',
      borderHover: 'hover:border-cyan-500',
      gradient: 'from-cyan-900/40 to-blue-900/40',
      icon: 'text-cyan-400'
    };

    if (name.includes('personnel') || name.includes('hr')) return {
      text: 'text-pink-400',
      textHover: 'group-hover:text-pink-300',
      bg: 'bg-pink-500',
      border: 'border-pink-500/30',
      borderHover: 'hover:border-pink-500',
      gradient: 'from-pink-900/40 to-rose-900/40',
      icon: 'text-pink-400'
    };

    return {
      text: 'text-gray-300',
      textHover: 'group-hover:text-white',
      bg: 'bg-gray-500',
      border: 'border-white/20',
      borderHover: 'hover:border-purple-500/50',
      gradient: 'from-slate-800 to-slate-900',
      icon: 'text-gray-400'
    };
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
        <p className="text-gray-500 text-sm">Loading SOP Library...</p>
      </div>
    );
  }

  // Status colors matching SOP Monitoring exactly
  const getSOPStatus = (sop: SOPLibraryItem) => {
    // Prefer masterRepoData dates (from Master SOP Repository - source of truth for monitoring)
    const masterData = (sop as any).masterRepoData;
    const sopDetails = typeof sop.sopId === 'object' ? sop.sopId : null;
    
    // Use masterRepoData.reviewDate first, then fallback to sopId.reviewDate
    const reviewDateValue = masterData?.reviewDate || sopDetails?.reviewDate;
    
    if (!reviewDateValue) return null;

    const reviewDate = new Date(reviewDateValue);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = reviewDate.getTime() - today.getTime();
    const daysToReview = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Matching SOP Monitoring colors exactly
    if (daysToReview < 0) {
      // Expired - Yellow (matching SOP Monitoring)
      return { label: 'Expired', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: '⚠️', priority: 4 };
    }
    if (daysToReview <= 7) {
      // Review This Week - Red (highest priority)
      return { label: 'Review Due', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: '🔴', priority: 3 };
    }
    if (daysToReview <= 30) {
      // Expiring Soon - Orange
      return { label: 'Expiring Soon', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: '⏳', priority: 2 };
    }
    // Compliant - Green
    return { label: 'Compliant', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: '✅', priority: 1 };
  };

  // Sort function for SOPs
  const sortSOPs = (sops: SOPLibraryItem[]) => {
    return [...sops].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'identifier':
          comparison = a.sopIdentifier.localeCompare(b.sopIdentifier);
          break;
        case 'name':
          comparison = (a.sopName || '').localeCompare(b.sopName || '');
          break;
        case 'status':
          const statusA = getSOPStatus(a);
          const statusB = getSOPStatus(b);
          // Sort by priority: Expired (4) > Review Due (3) > Expiring Soon (2) > Compliant (1) > null (0)
          const priorityA = statusA?.priority || 0;
          const priorityB = statusB?.priority || 0;
          comparison = priorityB - priorityA;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };

  return (
    <div className="space-y-6">
      {/* Departments Grid - 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTree.map((dept) => {
          const theme = getDeptTheme(dept.name);
          return (
          <div key={dept.name} className={`bg-gradient-to-br ${theme.gradient} backdrop-blur-lg rounded-2xl border ${theme.border} ${theme.borderHover} transition-all duration-300 transform hover:scale-[1.03] shadow-xl hover:shadow-2xl hover:shadow-purple-500/20 overflow-hidden cursor-pointer`}>
            {/* Department Header - Click to open full screen */}
            <button
              onClick={() => setFullScreenDept(dept)}
              className="w-full px-5 py-4 flex flex-col gap-3 hover:bg-white/5 transition-all group"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <Folder className={`h-6 w-6 ${theme.icon}`} />
                  <h3 className={`text-lg font-bold ${theme.text} ${theme.textHover} transition-colors`}>
                    {dept.name}
                  </h3>
                </div>
                <ChevronRight className={`h-5 w-5 ${theme.icon} flex-shrink-0`} />
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
                  <span className={`text-2xl font-bold ${theme.text}`}>{dept.subcategories?.length || 0}</span>
                  <p className="text-xs text-gray-400">Categories</p>
                </div>
              </div>
            </button>
          </div>
        );})}
      </div>

      {/* Full-Screen Department Modal - Draggable, No Background */}
      {fullScreenDept && (
        <div 
          className="fixed rounded-2xl border border-purple-500/30 w-full max-w-7xl max-h-[90vh] overflow-hidden shadow-2xl bg-[#0f111a]"
          style={{
            top: '50%',
            left: '50%',
            transform: `translate(calc(-50% + ${modalPosition.x}px), calc(-50% + ${modalPosition.y}px))`,
            zIndex: 9999,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}
        >
          {/* Modal Header - Draggable */}
          <div 
            onMouseDown={handleMouseDown}
            className="modal-header bg-gradient-to-r from-purple-900/40 to-slate-900/40 px-6 py-4 border-b border-white/5 flex items-center justify-between cursor-grab active:cursor-grabbing select-none backdrop-blur-md"
          >
            <div className="flex items-center gap-4">
              <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/20">
                <FolderOpen className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{fullScreenDept.name}</h2>
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                  <span className="bg-white/5 px-2 py-0.5 rounded border border-white/5">{fullScreenDept.totalSOPs} SOPs</span>
                  <span className="bg-white/5 px-2 py-0.5 rounded border border-white/5">{fullScreenDept.subcategories?.length || 0} Categories</span>
                </div>
              </div>
            </div>
            
            {/* Sorting Controls */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-800/30 border border-purple-500/30 rounded-lg">
                <span className="text-xs text-purple-300">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'identifier' | 'name' | 'status')}
                  className="bg-transparent text-white text-xs focus:outline-none cursor-pointer"
                  style={{ colorScheme: 'dark' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="identifier" className="bg-[#1a1f3a]">Code</option>
                  <option value="name" className="bg-[#1a1f3a]">Name</option>
                  <option value="status" className="bg-[#1a1f3a]">Status</option>
                </select>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}
                className="flex items-center gap-1 px-3 py-1.5 bg-purple-800/30 border border-purple-500/30 rounded-lg hover:bg-purple-700/30 transition-all text-xs"
                title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              >
                <span className="text-purple-200">{sortOrder === 'asc' ? 'A→Z' : 'Z→A'}</span>
                <span className="text-purple-300">{sortOrder === 'asc' ? '↑' : '↓'}</span>
              </button>
              
              <button
                onClick={() => {
                  setFullScreenDept(null);
                  setModalPosition({ x: 0, y: 0 });
                }}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors group ml-2"
              >
                <ChevronDown className="h-5 w-5 text-gray-400 group-hover:text-white transition-colors" />
              </button>
            </div>
          </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto max-h-[calc(90vh-80px)] p-6 bg-[#0f111a]">
              <div className="space-y-4">
                {(fullScreenDept.subcategories || []).map((subcat) => {
                  const subcatKey = `${fullScreenDept.name}-${subcat.code}`;
                  const isSubcatExpanded = expandedSubcats.has(subcatKey);

                  return (
                    <div key={subcatKey} className="bg-[#131620] rounded-xl border border-white/5 overflow-hidden">
                      {/* Subcategory Header */}
                      <button
                        onClick={() => toggleSubcategory(subcatKey)}
                        className="w-full px-5 py-3 flex items-center justify-between hover:bg-white/5 transition-all group border-l-4 border-transparent hover:border-purple-500"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`transition-transform duration-200 ${isSubcatExpanded ? 'rotate-90' : ''}`}>
                             <ChevronRight className="h-4 w-4 text-gray-500 group-hover:text-purple-400" />
                          </div>
                          <Folder className={`h-4 w-4 ${isSubcatExpanded ? 'text-purple-400' : 'text-gray-500 group-hover:text-purple-400'}`} />
                          
                          <div className="text-left">
                            <h4 className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">
                              {subcat.name}
                            </h4>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                           <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono">
                             <span title="Videos" className="flex items-center gap-1"><Video className="h-3 w-3" /> {subcat.totalVideos}</span>
                             <span className="w-px h-3 bg-white/10"></span>
                             <span title="Slides" className="flex items-center gap-1"><FileText className="h-3 w-3" /> {subcat.totalSlides}</span>
                           </div>
                           <span className="bg-white/5 text-gray-400 text-xs px-2 py-0.5 rounded-md min-w-[3rem] text-center group-hover:bg-purple-500/10 group-hover:text-purple-300 transition-colors">
                              {subcat.totalSOPs} SOPs
                           </span>
                        </div>
                      </button>

                      {/* SOPs Grid */}
                      {isSubcatExpanded && (
                        <div className="px-5 pb-5 pt-2 border-t border-white/5">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {sortSOPs(subcat.sops || []).map((sop) => {
                               const status = getSOPStatus(sop);
                               // Clean the name - remove identifier prefix if present, but never leave empty
                               let cleanName = sop.sopName || sop.sopIdentifier;
                               if (cleanName.toUpperCase().startsWith(sop.sopIdentifier.toUpperCase())) {
                                 // Remove the identifier and any separator
                                 cleanName = cleanName.substring(sop.sopIdentifier.length).replace(/^[\s\-:\.]+/, '').trim();
                               }
                               // If empty after cleaning, use the identifier
                               if (!cleanName) {
                                 cleanName = sop.sopIdentifier;
                               }
                               
                               return (
                              <div 
                                key={sop._id} 
                                className="group relative bg-gradient-to-br from-[#1e293b] to-[#0f172a] rounded-xl border border-white/5 hover:border-purple-500/50 p-5 transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl hover:shadow-purple-500/20 cursor-pointer flex flex-col h-full overflow-hidden"
                                onClick={() => onViewSOP(sop)}
                              >
                                {/* Top Row: ID + Status Badge */}
                                <div className="flex items-center justify-between mb-3">
                                   <span className="font-mono text-xs font-bold text-purple-300 bg-purple-500/10 px-2 py-1 rounded-md border border-purple-500/20 shadow-sm">
                                      {sop.sopIdentifier}
                                   </span>
                                   {status && (
                                     <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full border shadow-sm flex items-center gap-1.5 ${status.color}`}>
                                        {status.icon} {status.label}
                                     </span>
                                   )}
                                </div>

                                {/* SOP Name */}
                                <h5 className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors line-clamp-2 leading-relaxed mb-auto tracking-wide" title={sop.sopName || sop.sopIdentifier}>
                                  {cleanName}
                                </h5>

                                {/* Resource Footer */}
                                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                                   <div className="flex gap-2">
                                      {/* Resource Indicators (Dots) */}
                                      <div title={`${sop.videos.length} Videos`} className={`h-2 w-2 rounded-full transition-all duration-300 ${sop.completionStatus.hasVideos ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] scale-110' : 'bg-gray-700/50'}`} />
                                      <div title={`${sop.slides.length} Slides`} className={`h-2 w-2 rounded-full transition-all duration-300 ${sop.completionStatus.hasSlides ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)] scale-110' : 'bg-gray-700/50'}`} />
                                      <div title={`${sop.metadata.totalMCQs || 0} MCQs`} className={`h-2 w-2 rounded-full transition-all duration-300 ${sop.completionStatus.hasMCQs ? 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)] scale-110' : 'bg-gray-700/50'}`} />
                                   </div>
                                   
                                   <div className={`text-xs font-bold ${getCompletionColor(sop.completionStatus.percentage)} px-2 py-0.5 rounded bg-black/20`}>
                                      {sop.completionStatus.percentage}%
                                   </div>
                                </div>
                              </div>
                            )})} 
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
