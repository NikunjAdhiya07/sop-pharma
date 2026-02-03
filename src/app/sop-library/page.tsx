'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import SOPTreeView from '@/components/SOPTreeView';
import { 
  Search, 
  Filter, 
  Video, 
  FileText, 
  Brain, 
  BookOpen, 
  Loader2, 
  ChevronDown, 
  ChevronRight,
  Upload,
  RefreshCw,
  Eye,
  FolderTree,
  List
} from 'lucide-react';

interface VideoFile {
  fileName: string;
  filePath: string;
  title?: string;
  uploadedAt: string;
}

interface SlideFile {
  fileName: string;
  filePath: string;
  title?: string;
  fileType: 'pdf' | 'ppt' | 'pptx';
  uploadedAt: string;
}

interface SOPDocument {
  fileName: string;
  filePath: string;
  fileType: 'pdf' | 'docx';
  uploadedAt: string;
}

interface MCQBank {
  totalQuestions: number;
  difficultyDistribution: {
    easy: number;
    medium: number;
    hard: number;
  };
}

interface SOPLibrary {
  _id: string;
  sopId: string;
  sopName: string;
  sopIdentifier: string;
  department: string;
  departmentCode: string;
  mcqBankId?: MCQBank;
  videos: VideoFile[];
  slides: SlideFile[];
  sopDocuments: SOPDocument[];
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

export default function SOPLibraryPage() {
  const router = useRouter();
  const [sopLibraries, setSopLibraries] = useState<SOPLibrary[]>([]);
  const [organized, setOrganized] = useState<Record<string, SOPLibrary[]>>({});
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'identifier' | 'completion' | 'recent'>('name');
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());
  
  // View mode: 'folder' or 'list' - default to folder
  const [viewMode, setViewMode] = useState<'folder' | 'list'>('folder');
  const [treeData, setTreeData] = useState<any[]>([]);

  useEffect(() => {
    fetchSOPLibrary();
    fetchTreeData();
  }, [selectedDepartment]);

  // Collapse all departments by default when data is loaded
  useEffect(() => {
    if (departments.length > 0 && collapsedDepts.size === 0) {
      setCollapsedDepts(new Set(departments));
    }
  }, [departments]);

  const fetchSOPLibrary = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedDepartment !== 'all') {
        params.append('department', selectedDepartment);
      }

      const response = await fetch(`/api/sop-library?${params}`);
      const data = await response.json();

      if (data.success) {
        setSopLibraries(data.sopLibraries);
        setOrganized(data.organized);
        setDepartments(data.departments);
      }
    } catch (error) {
      console.error('Error fetching SOP library:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTreeData = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedDepartment !== 'all') {
        params.append('department', selectedDepartment);
      }

      const response = await fetch(`/api/sop-library/tree?${params}`);
      const data = await response.json();

      if (data.success) {
        setTreeData(data.tree);
      }
    } catch (error) {
      console.error('Error fetching tree data:', error);
    }
  };

  const syncSOPLibrary = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/sop-library/sync', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        alert(`Sync completed!\nProcessed: ${data.stats.sopProcessed}\nCreated: ${data.stats.sopLibraryCreated}\nUpdated: ${data.stats.sopLibraryUpdated}`);
        await fetchSOPLibrary();
      } else {
        alert('Sync failed: ' + data.error);
      }
    } catch (error) {
      console.error('Error syncing SOP library:', error);
      alert('An error occurred during sync');
    } finally {
      setSyncing(false);
    }
  };

  const toggleDepartment = (dept: string) => {
    const newCollapsed = new Set(collapsedDepts);
    if (newCollapsed.has(dept)) {
      newCollapsed.delete(dept);
    } else {
      newCollapsed.add(dept);
    }
    setCollapsedDepts(newCollapsed);
  };

  const filteredOrganized = Object.entries(organized).reduce((acc, [dept, sops]) => {
    let filtered = sops.filter(sop =>
      sop.sopName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sop.sopIdentifier.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Apply sorting
    filtered = filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.sopName.localeCompare(b.sopName);
        case 'identifier':
          return a.sopIdentifier.localeCompare(b.sopIdentifier);
        case 'completion':
          return b.completionStatus.percentage - a.completionStatus.percentage;
        case 'recent':
          // Sort by most recent upload (videos or slides)
          const aDate = Math.max(
            ...a.videos.map(v => new Date(v.uploadedAt).getTime()),
            ...a.slides.map(s => new Date(s.uploadedAt).getTime()),
            0
          );
          const bDate = Math.max(
            ...b.videos.map(v => new Date(v.uploadedAt).getTime()),
            ...b.slides.map(s => new Date(s.uploadedAt).getTime()),
            0
          );
          return bDate - aDate;
        default:
          return 0;
      }
    });

    if (filtered.length > 0) {
      acc[dept] = filtered;
    }
    return acc;
  }, {} as Record<string, SOPLibrary[]>);

  const getCompletionColor = (percentage: number) => {
    if (percentage >= 100) return 'text-green-400';
    if (percentage >= 66) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Navigation */}
        <PageHeader />

        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-5xl font-bold text-white mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                📚 SOP Library
              </h1>
              <p className="text-gray-300 text-lg">
                Comprehensive training resources for all SOPs - Videos, Slides, MCQs & Documents
              </p>
            </div>
            <div className="flex gap-3">
              {/* View Toggle */}
              <div className="flex gap-2 bg-white/10 rounded-xl p-1">
                <button
                  onClick={() => setViewMode('folder')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
                    viewMode === 'folder'
                      ? 'bg-purple-600 text-white shadow-lg'
                      : 'text-gray-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <FolderTree className="h-4 w-4" />
                  Folder View
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
                    viewMode === 'list'
                      ? 'bg-purple-600 text-white shadow-lg'
                      : 'text-gray-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <List className="h-4 w-4" />
                  List View
                </button>
              </div>

              <button
                onClick={() => router.push('/sop-monitoring')}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg"
              >
                <Eye className="h-5 w-5" />
                Go to SOP Monitoring
              </button>
              <button
                onClick={syncSOPLibrary}
                disabled={syncing}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg disabled:opacity-50"
              >
                {syncing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-5 w-5" />
                    Sync Library
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-white/20 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search Bar */}
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by SOP name or identifier..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Department Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full md:w-64 pl-10 pr-10 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all appearance-none cursor-pointer"
                style={{ colorScheme: 'dark' }}
              >
                <option value="all" className="bg-slate-800 text-white">All Departments</option>
                {departments.map(dept => (
                  <option key={dept} value={dept} className="bg-slate-800 text-white">{dept}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
            </div>

            {/* Sort Dropdown */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'identifier' | 'completion' | 'recent')}
                className="w-full md:w-48 pl-4 pr-10 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all appearance-none cursor-pointer font-semibold"
                style={{ colorScheme: 'dark' }}
              >
                <option value="name" className="bg-slate-800 text-white">Sort: Name</option>
                <option value="identifier" className="bg-slate-800 text-white">Sort: Code</option>
                <option value="completion" className="bg-slate-800 text-white">Sort: Progress</option>
                <option value="recent" className="bg-slate-800 text-white">Sort: Recent</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Active Filters Display */}
          {(searchTerm || selectedDepartment !== 'all') && (
            <div className="flex items-center gap-2 flex-wrap mt-4 pt-4 border-t border-white/10">
              <span className="text-xs text-gray-400 font-semibold">Active filters:</span>
              {searchTerm && (
                <span className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-xs font-semibold flex items-center gap-2">
                  Search: "{searchTerm}"
                  <button onClick={() => setSearchTerm('')} className="hover:text-white">×</button>
                </span>
              )}
              {selectedDepartment !== 'all' && (
                <span className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-xs font-semibold flex items-center gap-2">
                  Dept: {selectedDepartment}
                  <button onClick={() => setSelectedDepartment('all')} className="hover:text-white">×</button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Content Area - Conditional Rendering */}
        {viewMode === 'folder' ? (
          /* Folder View */
          <SOPTreeView
            tree={treeData}
            searchTerm={searchTerm}
            onViewSOP={(sop) => router.push(`/sop-library/${sop._id}`)}
          />
        ) : (
          /* List View */
          <>
            {/* SOP Library by Department */}
            {Object.keys(filteredOrganized).length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="h-16 w-16 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-400 text-xl mb-4">No SOPs found</p>
            <button
              onClick={syncSOPLibrary}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all"
            >
              Sync Library to Get Started
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(filteredOrganized).map(([department, sops]) => (
              <div key={department} className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/20 overflow-hidden">
                {/* Department Header */}
                <button
                  onClick={() => toggleDepartment(department)}
                  className="w-full flex items-center justify-between p-6 hover:bg-white/5 transition-all"
                >
                  <div className="flex items-center gap-4">
                    {collapsedDepts.has(department) ? (
                      <ChevronRight className="h-6 w-6 text-purple-400" />
                    ) : (
                      <ChevronDown className="h-6 w-6 text-purple-400" />
                    )}
                    <h2 className="text-2xl font-bold text-white">{department}</h2>
                    <span className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm font-semibold">
                      {sops.length} SOP{sops.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </button>

                {/* SOP Cards */}
                {!collapsedDepts.has(department) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6 pt-0">
                    {sops.map((sop) => (
                      <div
                        key={sop._id}
                        className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-lg rounded-xl p-6 shadow-xl border border-white/10 hover:border-purple-500/50 transition-all duration-300 transform hover:scale-[1.02] cursor-pointer"
                        onClick={() => router.push(`/sop-library/${sop._id}`)}
                      >
                        {/* SOP Header */}
                        <div className="mb-4">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="text-lg font-bold text-white flex-1 pr-2">
                              {sop.sopName}
                            </h3>
                            <span className={`text-2xl font-bold ${getCompletionColor(sop.completionStatus.percentage)}`}>
                              {sop.completionStatus.percentage}%
                            </span>
                          </div>
                          <p className="text-gray-400 text-sm font-mono">{sop.sopIdentifier}</p>
                        </div>

                        {/* Resource Icons */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          {/* Videos */}
                          <div className={`flex items-center gap-2 p-3 rounded-lg ${sop.completionStatus.hasVideos ? 'bg-green-500/20 border border-green-500/30' : 'bg-red-500/10 border border-red-500/20'}`}>
                            <Video className={`h-5 w-5 ${sop.completionStatus.hasVideos ? 'text-green-400' : 'text-red-400'}`} />
                            <div>
                              <p className="text-xs text-gray-400">Videos</p>
                              <p className="text-sm font-bold text-white">{sop.videos.length}</p>
                            </div>
                          </div>

                          {/* Slides */}
                          <div className={`flex items-center gap-2 p-3 rounded-lg ${sop.completionStatus.hasSlides ? 'bg-green-500/20 border border-green-500/30' : 'bg-red-500/10 border border-red-500/20'}`}>
                            <FileText className={`h-5 w-5 ${sop.completionStatus.hasSlides ? 'text-green-400' : 'text-red-400'}`} />
                            <div>
                              <p className="text-xs text-gray-400">Slides</p>
                              <p className="text-sm font-bold text-white">{sop.slides.length}</p>
                            </div>
                          </div>

                          {/* MCQs */}
                          <div className={`flex items-center gap-2 p-3 rounded-lg ${sop.completionStatus.hasMCQs ? 'bg-green-500/20 border border-green-500/30' : 'bg-red-500/10 border border-red-500/20'}`}>
                            <Brain className={`h-5 w-5 ${sop.completionStatus.hasMCQs ? 'text-green-400' : 'text-red-400'}`} />
                            <div>
                              <p className="text-xs text-gray-400">MCQs</p>
                              <p className="text-sm font-bold text-white">{sop.metadata.totalMCQs || 0}</p>
                            </div>
                          </div>

                          {/* SOP Doc */}
                          <div className={`flex items-center gap-2 p-3 rounded-lg ${sop.completionStatus.hasSOPDoc ? 'bg-green-500/20 border border-green-500/30' : 'bg-gray-500/10 border border-gray-500/20'}`}>
                            <BookOpen className={`h-5 w-5 ${sop.completionStatus.hasSOPDoc ? 'text-green-400' : 'text-gray-400'}`} />
                            <div>
                              <p className="text-xs text-gray-400">SOP Doc</p>
                              <p className="text-sm font-bold text-white">{sop.sopDocuments.length}</p>
                            </div>
                          </div>
                        </div>

                        {/* Smart States */}
                        <div className="space-y-2 mb-4">
                          {!sop.completionStatus.hasVideos && (
                            <p className="text-xs text-yellow-400 italic">📌 Training video will be uploaded soon</p>
                          )}
                          {!sop.completionStatus.hasSlides && (
                            <p className="text-xs text-yellow-400 italic">📌 Slides coming soon</p>
                          )}
                          {!sop.completionStatus.hasMCQs && (
                            <p className="text-xs text-yellow-400 italic">📌 MCQs not available yet</p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/sop-library/${sop._id}`);
                            }}
                            className="flex-1 py-2 px-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all flex items-center justify-center gap-2"
                          >
                            <Eye className="h-4 w-4" />
                            View
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (sop.completionStatus.hasMCQs) {
                                router.push(`/mcq-tests?sopId=${sop.sopId}`);
                              }
                            }}
                            disabled={!sop.completionStatus.hasMCQs}
                            className="flex-1 py-2 px-4 bg-white/10 border border-purple-500/30 text-purple-300 font-semibold rounded-lg hover:bg-purple-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            title={!sop.completionStatus.hasMCQs ? 'MCQs not available' : 'Take test'}
                          >
                            <Brain className="h-4 w-4" />
                            Test
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
