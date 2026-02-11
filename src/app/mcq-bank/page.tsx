'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Filter, Download, Eye, BookOpen, Award, Loader2, Plus, Trash2, FolderOpen, Upload, ArrowLeft, Grid, List, ArrowUpDown, SortAsc, SortDesc, CheckCircle2, Star, FileText, RefreshCw } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import MCQTreeView from '@/components/MCQTreeView';
import { useCopyProtection, CopyProtected } from '@/lib/copyProtection';

interface MCQ {
  aiIcon: string;
  question: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  difficultyStars: '⭐' | '⭐⭐' | '⭐⭐⭐';
  options: string[];
  correctAnswer: string;
  explanation: string;
  sopReference: string;
  isChecked?: boolean;
  isReviewed?: boolean;
  optionVariants: Array<{
    text: string;
    isCorrect: boolean;
  }>;
}

interface MCQBank {
  _id: string;
  sopId: string;
  sopName: string;
  sopIdentifier: string;
  mcqs: MCQ[];
  totalQuestions?: number;
  difficultyDistribution?: {
    easy: number;
    medium: number;
    hard: number;
  };
  createdAt: string;
}

function MCQBankContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sopIdFromUrl = searchParams.get('sopId');

  const [mcqBanks, setMcqBanks] = useState<MCQBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingMore, setGeneratingMore] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('All');
  const [selectedMCQBank, setSelectedMCQBank] = useState<MCQBank | null>(null);
  const [selectedMCQ, setSelectedMCQ] = useState<{mcq: MCQ, index: number} | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null); // e.g. "bankId-index"
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalBanks, setTotalBanks] = useState(0);
  
  // Tree view state
  const [viewMode, setViewMode] = useState<'grid' | 'tree'>('tree');
  const [treeData, setTreeData] = useState<any>(null);
  const [loadingTree, setLoadingTree] = useState(false);
  
  // Sort state
  const [sortBy, setSortBy] = useState<'name' | 'questions' | 'date'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Apply copy protection to prevent copying/downloading questions
  useCopyProtection();

  useEffect(() => {
    fetchMCQBanks();
    if (viewMode === 'tree') {
      fetchTreeData();
    }
  }, [currentPage, viewMode]);

  const fetchTreeData = async (forceRefresh = false) => {
    setLoadingTree(true);
    try {
      // Cache key includes a version number for easy invalidation
      const CACHE_KEY = 'mcq-tree-cache-v1';
      const CACHE_TIMESTAMP_KEY = 'mcq-tree-cache-timestamp';
      const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cachedData = localStorage.getItem(CACHE_KEY);
        const cacheTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
        
        if (cachedData && cacheTimestamp) {
          const age = Date.now() - parseInt(cacheTimestamp);
          if (age < CACHE_DURATION) {
            const parsed = JSON.parse(cachedData);
            setTreeData(parsed);
            console.log('📦 Using cached tree data (age:', Math.floor(age / 1000), 'seconds)');
            setLoadingTree(false);
            return;
          }
        }
      }

      // Fetch fresh data
      const response = await fetch('/api/mcq-bank/tree');
      const data = await response.json();
      
      if (data.success) {
        setTreeData(data);
        
        // Cache the data
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
        
        console.log('📊 Tree data loaded and cached:', data.stats);
        if (data.userAccess?.isRestricted) {
          console.log('🔒 Department access restricted to:', data.userAccess.allowedDepartments);
        }
      }
    } catch (error) {
      console.error('Error fetching tree data:', error);
    } finally {
      setLoadingTree(false);
    }
  };

  // Auto-select MCQ bank when sopId is in URL
  useEffect(() => {
    if (sopIdFromUrl && mcqBanks.length > 0) {
      const matchingBank = mcqBanks.find(bank => bank.sopId === sopIdFromUrl);
      if (matchingBank) {
        fetchFullBankDetails(matchingBank);
      }
    }
  }, [sopIdFromUrl, mcqBanks]);

  const fetchMCQBanks = async () => {
    try {
      // Fetch MCQ banks with summary mode to avoid timeouts but allow client-side filtering
      const response = await fetch(`/api/mcq-bank?limit=1000&page=${currentPage}&summary=true`);
      const data = await response.json();
      
      if (data.success) {
        setMcqBanks(data.mcqBanks);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages);
          setTotalBanks(data.pagination.total);
        }
      }
    } catch (error) {
      console.error('Error fetching MCQ banks:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFullBankDetails = async (bank: MCQBank) => {
    // Always fetch latest from DB when opening modal to ensure persistence
    try {
      // Check if we have FULL question data (not just partial status flags)
      // Partial data from tree view only has isChecked/isReviewed, not question/options
      const hasFullData = bank.mcqs && 
                         bank.mcqs.length > 0 && 
                         bank.mcqs[0].question && 
                         bank.mcqs[0].options;
      
      if (hasFullData) {
        setSelectedMCQBank(bank);
        return;
      }

      setLoading(true);
      // Use the ID filter for pinpoint precision
      // timestamp to prevent browser caching
      const response = await fetch(`/api/mcq-bank?id=${bank._id}&limit=1&t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache'
        }
      });
      const data = await response.json();

      if (data.success && data.mcqBanks.length > 0) {
        const fullBank = data.mcqBanks[0];
        setSelectedMCQBank(fullBank);
        
        // Update the bank in our local list state
        setMcqBanks(prev => prev.map(b => b._id === bank._id ? fullBank : b));
      } else {
        alert('Failed to load questions for this bank');
      }
    } catch (error) {
      console.error('Error fetching full bank details:', error);
      alert('Error loading questions');
    } finally {
      setLoading(false);
    }
  };

  const generateMoreMCQs = async (bankId: string, sopId: string) => {
    if (generatingMore) return;
    
    setGeneratingMore(bankId);
    try {
      const response = await fetch('/api/sop/generate-mcqs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sopId: sopId,
          mcqBankId: bankId,
          targetCount: 100,
          userInfo: JSON.parse(localStorage.getItem('user') || '{}')
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`Successfully generated additional questions! Total now: ${data.mcqBank.totalQuestions}`);
        await fetchMCQBanks(); // Refresh list
        
        // If the bank that was updated is the one currently selected, update it
        if (selectedMCQBank?._id === bankId) {
          setSelectedMCQBank(data.mcqBank);
        }
      } else {
        alert('Failed to generate more questions: ' + (data.details || data.error));
      }
    } catch (error) {
      console.error('Error generating more MCQs:', error);
      alert('An error occurred while generating more questions.');
    } finally {
      setGeneratingMore(null);
    }
  };

  // Efficient search and filter function
  const filteredAndSortedMCQBanks = (() => {
    // First, filter by search term (case-insensitive)
    const searchLower = searchTerm.toLowerCase().trim();
    let filtered = mcqBanks;
    
    if (searchLower) {
      filtered = mcqBanks.filter(bank => {
        const nameMatch = bank.sopName.toLowerCase().includes(searchLower);
        const identifierMatch = bank.sopIdentifier.toLowerCase().includes(searchLower);
        const idMatch = bank.sopId.toLowerCase().includes(searchLower);
        return nameMatch || identifierMatch || idMatch;
      });
    }
    
    // Then sort the filtered results
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.sopName.localeCompare(b.sopName);
          break;
        case 'questions':
          comparison = (a.totalQuestions || 0) - (b.totalQuestions || 0);
          break;
        case 'date':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  })();

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy':
        return 'bg-green-500/20 text-green-300 border-green-500';
      case 'Medium':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500';
      case 'Hard':
        return 'bg-red-500/20 text-red-300 border-red-500';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500';
    }
  };

  const deleteMCQBank = async (bankId: string) => {
    if (!confirm('Are you sure you want to delete this MCQ Bank? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/mcq-bank?id=${bankId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        alert('MCQ Bank deleted successfully');
        await fetchMCQBanks(); // Refresh list
      } else {
        alert('Failed to delete MCQ Bank: ' + (data.details || data.error));
      }
    } catch (error) {
      console.error('Error deleting MCQ Bank:', error);
      alert('An error occurred while deleting the question bank.');
    }
  };

  const exportMCQBank = (bank: MCQBank) => {
    const dataStr = JSON.stringify(bank, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${bank.sopIdentifier}_MCQ_Bank.json`;
    link.click();
  };

  const toggleChecked = async (bankId: string, index: number, currentStatus: boolean) => {
    const statusKey = `${bankId}-${index}`;
    if (updatingStatus === statusKey) return;
    
    setUpdatingStatus(statusKey);
    setUpdatingStatus(statusKey);

    // OPTIMISTIC UPDATE: Update UI immediately
    const nextStatus = !currentStatus;
    
    // Update local modal state immediately
    if (selectedMCQBank && selectedMCQBank._id === bankId) {
      const newMcqs = [...selectedMCQBank.mcqs];
      newMcqs[index] = { ...newMcqs[index], isChecked: nextStatus };
      setSelectedMCQBank({ ...selectedMCQBank, mcqs: newMcqs });
    }
    
    // Update the main list state
    setMcqBanks(prev => prev.map(b => {
      if (b._id === bankId && b.mcqs && b.mcqs.length > 0) {
        const updatedMcqs = [...b.mcqs];
        updatedMcqs[index] = { ...updatedMcqs[index], isChecked: nextStatus };
        return { ...b, mcqs: updatedMcqs };
      }
      return b;
    }));

    try {
      const response = await fetch('/api/mcq-bank/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankId,
          questionIndex: index,
          isChecked: nextStatus
        })
      });
      const data = await response.json();
      
      if (!data.success) {
        // REVERT on failure
        console.error('Update failed, reverting:', data.error);
        const revertedStatus = currentStatus;
        
        if (selectedMCQBank && selectedMCQBank._id === bankId) {
          const newMcqs = [...selectedMCQBank.mcqs];
          newMcqs[index] = { ...newMcqs[index], isChecked: revertedStatus };
          setSelectedMCQBank({ ...selectedMCQBank, mcqs: newMcqs });
        }
        
        setMcqBanks(prev => prev.map(b => {
          if (b._id === bankId && b.mcqs && b.mcqs.length > 0) {
            const updatedMcqs = [...b.mcqs];
            updatedMcqs[index] = { ...updatedMcqs[index], isChecked: revertedStatus };
            return { ...b, mcqs: updatedMcqs };
          }
          return b;
        }));
      }
    } catch (error) {
      console.error('Error toggling checked status:', error);
      // Revert skipped for brevity but recommended in prod
    } finally {
      setUpdatingStatus(null);
    }
  };

  const toggleReview = async (bank: MCQBank, index: number, mcq: MCQ) => {
    const statusKey = `${bank._id}-${index}`;
    if (updatingStatus === statusKey) return;
    
    setUpdatingStatus(statusKey);
    const currentStatus = !!mcq.isReviewed;
    const nextStatus = !currentStatus;

    // OPTIMISTIC UPDATE
    if (selectedMCQBank && selectedMCQBank._id === bank._id) {
      const newMcqs = [...selectedMCQBank.mcqs];
      newMcqs[index] = { ...newMcqs[index], isReviewed: nextStatus };
      setSelectedMCQBank({ ...selectedMCQBank, mcqs: newMcqs });
    }

    setMcqBanks(prev => prev.map(b => {
      if (b._id === bank._id) {
        if (b.mcqs && b.mcqs.length > 0) {
          const updatedMcqs = [...b.mcqs];
          updatedMcqs[index] = { ...updatedMcqs[index], isReviewed: nextStatus };
          return { ...b, mcqs: updatedMcqs };
        }
      }
      return b;
    }));

    try {
      // 1. Update flag in MCQBank
      const response = await fetch('/api/mcq-bank/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankId: bank._id,
          questionIndex: index,
          isReviewed: nextStatus
        })
      });
      
      const data = await response.json();
      if (data.success) {
        // 2. Sync with MCQReview collection (fire and forget)
        if (nextStatus) {
          // Flagging: create a review entry
          fetch('/api/mcq-review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mcqBankId: bank._id,
              questionIndex: index,
              sopId: bank.sopId,
              sopName: bank.sopName,
              sopIdentifier: bank.sopIdentifier,
              question: mcq,
              flaggedBy: 'Trainer'
            })
          }).catch(console.error);
        } else {
          // Unflagging: delete the review entry
          fetch(`/api/mcq-review?mcqBankId=${bank._id}&questionIndex=${index}`, {
            method: 'DELETE'
          }).catch(console.error);
        }
      } else {
        // Revert on failure (omitted for brevity)
        console.error('Update failed:', data.error);
      }
    } catch (error) {
      console.error('Error toggling review status:', error);
    } finally {
      setUpdatingStatus(null);
    }
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
        {/* Navigation - only show if not viewing from SOP Library */}
        {!sopIdFromUrl && <PageHeader />}

        {/* Header */}
        <div className="mb-12">
          {/* Back button when viewing from SOP Library */}
          {sopIdFromUrl && selectedMCQBank && (
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-gray-300 hover:text-white mb-4 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
              Back to SOP Library
            </button>
          )}

          <div className="flex items-center justify-between mb-4">
            <div className="flex-1 text-center">
              <h1 className="text-5xl font-bold text-white mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                {sopIdFromUrl && selectedMCQBank ? (
                  <>{selectedMCQBank.sopIdentifier} - {selectedMCQBank.sopName.toUpperCase()}</>
                ) : (
                  <>MCQ Question Bank</>
                )}
              </h1>
              <p className="text-gray-300 text-lg">
                {sopIdFromUrl && selectedMCQBank ? (
                  <>{selectedMCQBank.sopIdentifier} - {selectedMCQBank.totalQuestions} questions available</>
                ) : (
                  <>Browse and manage your generated MCQ banks {totalBanks > 0 && `(${totalBanks} total)`}</>
                )}
              </p>
            </div>
            {!sopIdFromUrl && (
              <div className="flex gap-3">
                <button
                  onClick={() => fetchTreeData(true)}
                  disabled={loadingTree}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  title="Refresh MCQ Bank data and clear cache"
                >
                  <RefreshCw className={`h-5 w-5 ${loadingTree ? 'animate-spin' : ''}`} />
                  {loadingTree ? 'Refreshing...' : 'Refresh'}
                </button>
                <button
                  onClick={() => window.location.href = '/files-manager'}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg whitespace-nowrap"
                >
                  <FolderOpen className="h-5 w-5" />
                  Files Manager
                </button>
                <button
                  onClick={() => window.location.href = '/sop-upload'}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg whitespace-nowrap"
                >
                  <Upload className="h-5 w-5" />
                  Upload SOP
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Search, Filter, and Sort */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-white/20 mb-8">
          <div className="flex flex-col gap-4">
            {/* Search Bar */}
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by SOP name, identifier, or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              />
            </div>
            
            {/* Filters and Sort */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              {/* Difficulty Filters */}
              <div className="flex gap-2 flex-wrap">
                {['All', 'Easy', 'Medium', 'Hard'].map((difficulty) => (
                  <button
                    key={difficulty}
                    onClick={() => setDifficultyFilter(difficulty)}
                    className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                      difficultyFilter === difficulty
                        ? 'bg-purple-600 text-white'
                        : 'bg-white/10 text-gray-300 hover:bg-white/20'
                    }`}
                  >
                    {difficulty}
                  </button>
                ))}
              </div>
              
              {/* Sort Options */}
              <div className="flex gap-2 items-center">
                <span className="text-gray-300 text-sm font-semibold">Sort by:</span>
                <div className="flex gap-2">
                  {[
                    { value: 'name', label: 'Name' },
                    { value: 'questions', label: 'Questions' },
                    { value: 'date', label: 'Date' }
                  ].map((sort) => (
                    <button
                      key={sort.value}
                      onClick={() => {
                        if (sortBy === sort.value) {
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortBy(sort.value as 'name' | 'questions' | 'date');
                          setSortOrder('asc');
                        }
                      }}
                      className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 ${
                        sortBy === sort.value
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/10 text-gray-300 hover:bg-white/20'
                      }`}
                    >
                      {sort.label}
                      {sortBy === sort.value && (
                        sortOrder === 'asc' ? 
                          <SortAsc className="h-4 w-4" /> : 
                          <SortDesc className="h-4 w-4" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* View Mode Toggle */}
        {!sopIdFromUrl && (
          <div className="flex justify-end mb-6">
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-1 border border-white/20 inline-flex">
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                  viewMode === 'grid'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                <Grid className="h-4 w-4" />
                Grid View
              </button>
              <button
                onClick={() => setViewMode('tree')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                  viewMode === 'tree'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                <List className="h-4 w-4" />
                Folder View
              </button>
            </div>
          </div>
        )}

        {/* Tree View */}
        {viewMode === 'tree' && !sopIdFromUrl ? (
          loadingTree ? (
            <div className="text-center py-16">
              <Loader2 className="h-12 w-12 text-purple-400 animate-spin mx-auto mb-4" />
              <p className="text-gray-400 text-xl">Loading folder structure...</p>
            </div>
          ) : treeData ? (
            <MCQTreeView
              tree={treeData.tree}
              unorganized={treeData.unorganized}
              searchTerm={searchTerm}
              onViewMCQs={(sopNode) => {
                // Find the first MCQ bank for this SOP
                if (sopNode.mcqBanks && sopNode.mcqBanks.length > 0) {
                  fetchFullBankDetails(sopNode.mcqBanks[0]);
                }
              }}
              onDownloadSOP={(sopNode) => {
                // Open SOP file in new tab
                if (sopNode.sopFileUrl) {
                  window.open(sopNode.sopFileUrl, '_blank');
                }
              }}
            />
          ) : (
            <div className="text-center py-16">
              <BookOpen className="h-16 w-16 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-400 text-xl">No tree data available</p>
            </div>
          )
        ) : (
          <>
            {/* MCQ Banks Grid */}
            {filteredAndSortedMCQBanks.length === 0 ? (
              <div className="text-center py-16">
                <BookOpen className="h-16 w-16 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400 text-xl">
                  {searchTerm ? 'No MCQ banks match your search' : 'No MCQ banks found'}
                </p>
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="mt-4 px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                  >
                    Clear Search
                  </button>
                )}
              </div>
            ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAndSortedMCQBanks.map((bank) => (
              <div
                key={bank._id}
                className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-xl border border-white/20 hover:border-purple-500/50 transition-all duration-300 transform hover:scale-[1.03] hover:shadow-2xl hover:shadow-purple-500/20 hover:bg-[#1E2338]"
              >
                <div className="flex items-start justify-between mb-4 gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 
                      className="text-sm font-bold text-white mb-2 leading-tight uppercase group-hover:text-purple-300 transition-colors line-clamp-2"
                      title={`${bank.sopIdentifier} - ${bank.sopName}`.toUpperCase()}
                    >
                      {bank.sopIdentifier} - {bank.sopName}
                    </h3>
                    <p className="text-gray-400 text-[10px] font-mono opacity-60">
                      {bank.sopIdentifier}
                    </p>
                  </div>
                  <Award className="h-5 w-5 text-purple-400 flex-shrink-0 mt-1" />
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">Total Questions:</span>
                    <span className="text-white font-bold">{bank.totalQuestions || 0}</span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-green-300 text-sm">Easy:</span>
                      <span className="text-white font-semibold">{bank.difficultyDistribution?.easy || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-yellow-300 text-sm">Medium:</span>
                      <span className="text-white font-semibold">{bank.difficultyDistribution?.medium || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-red-300 text-sm">Hard:</span>
                      <span className="text-white font-semibold">{bank.difficultyDistribution?.hard || 0}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => fetchFullBankDetails(bank)}
                      className="flex-1 py-2 px-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all flex items-center justify-center"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </button>
                    <button
                      onClick={() => exportMCQBank(bank)}
                      className="py-2 px-4 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition-all"
                      title="Download JSON"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteMCQBank(bank._id)}
                      className="py-2 px-4 bg-red-500/10 text-red-400 font-semibold rounded-lg hover:bg-red-500/20 border border-red-500/20 transition-all"
                      title="Delete Bank"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => generateMoreMCQs(bank._id, bank.sopId)}
                    disabled={!!generatingMore}
                    className="w-full py-2 px-4 bg-white/10 border border-purple-500/30 text-purple-300 font-semibold rounded-lg hover:bg-purple-500/20 transition-all flex items-center justify-center disabled:opacity-50"
                  >
                    {generatingMore === bank._id ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Generate More (to 100)
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
          </>
        )}

        {/* Pagination and Summary */}
        {filteredAndSortedMCQBanks.length > 0 && (
          <div className="mt-8 bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-white/20">
            <div className="flex items-center justify-between">
              <div className="text-gray-300">
                Showing <span className="text-white font-semibold">{filteredAndSortedMCQBanks.length}</span> of{' '}
                <span className="text-white font-semibold">{totalBanks}</span> MCQ Bank(s)
                {searchTerm && (
                  <span className="ml-2 text-purple-300">(filtered)</span>
                )}
              </div>
              
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Previous
                  </button>
                  
                  <div className="flex items-center gap-2">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-10 h-10 rounded-lg font-semibold transition-all ${
                            currentPage === pageNum
                              ? 'bg-purple-600 text-white'
                              : 'bg-white/10 text-gray-300 hover:bg-white/20'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MCQ Bank Detail Modal */}
        {selectedMCQBank && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-purple-500/30 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
              <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 p-6 rounded-t-2xl z-10">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white mb-2 uppercase">
                      {selectedMCQBank.sopIdentifier} - {selectedMCQBank.sopName}
                    </h2>
                    <p className="text-purple-100 font-mono text-sm">
                      {selectedMCQBank.sopIdentifier}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">

                    <button
                      onClick={() => setSelectedMCQBank(null)}
                      className="text-white hover:text-gray-200 text-2xl font-bold"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {selectedMCQBank.mcqs && selectedMCQBank.mcqs.length > 0 ? (
                  selectedMCQBank.mcqs.map((mcq, originalIndex) => {
                  if (difficultyFilter !== 'All' && mcq.difficulty !== difficultyFilter) return null;
                  
                  return (
                    <div
                      key={originalIndex}
                      className="bg-white/5 rounded-xl p-5 border border-white/10 hover:border-purple-500/30 transition-all cursor-pointer"
                      onClick={() => setSelectedMCQ({mcq, index: originalIndex})}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-start flex-1 pr-4">
                          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-purple-300 font-mono text-xs mr-4 flex-shrink-0">
                            {String(originalIndex + 1).padStart(2, '0')}
                          </span>
                          <span className="text-2xl mr-3">{mcq.aiIcon}</span>
                          <h3 className="text-white font-semibold flex-1">
                            {mcq.question}
                          </h3>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center gap-2">
                            {mcq.isChecked && (
                              <div className="p-1.5 bg-green-500/20 rounded-lg border border-green-500/30" title="Approved">
                                <CheckCircle2 className="h-4 w-4 text-green-400" />
                              </div>
                            )}
                            {mcq.isReviewed && (
                              <div className="p-1.5 bg-amber-500/20 rounded-lg border border-amber-500/30" title="Needs Review">
                                <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                              </div>
                            )}
                            <span className={`px-3 py-1 rounded-full text-xs font-bold border whitespace-nowrap ${getDifficultyColor(mcq.difficulty)}`}>
                              {mcq.difficultyStars} {mcq.difficulty}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleChecked(selectedMCQBank._id, originalIndex, !!mcq.isChecked);
                              }}
                              disabled={updatingStatus === `${selectedMCQBank._id}-${originalIndex}`}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                mcq.isChecked
                                  ? 'bg-green-600 text-white shadow-lg shadow-green-900/40'
                                  : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                              } disabled:opacity-50`}
                            >
                              {updatingStatus === `${selectedMCQBank._id}-${originalIndex}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                              {mcq.isChecked ? 'Checked' : 'Mark Checked'}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleReview(selectedMCQBank, originalIndex, mcq);
                              }}
                              disabled={updatingStatus === `${selectedMCQBank._id}-${originalIndex}`}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                mcq.isReviewed
                                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40'
                                  : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                              } disabled:opacity-50`}
                            >
                              {updatingStatus === `${selectedMCQBank._id}-${originalIndex}` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Star className={`h-3.5 w-3.5 ${mcq.isReviewed ? 'fill-white' : ''}`} />
                              )}
                              {mcq.isReviewed ? 'In Review' : 'Add Review'}
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        {mcq.options && mcq.options.length > 0 ? (
                          mcq.options.map((option, optIndex) => (
                            <div
                              key={optIndex}
                              className={`p-3 rounded-lg ${
                                option === mcq.correctAnswer
                                  ? 'bg-green-500/20 border border-green-500/50'
                                  : 'bg-white/5 border border-white/10'
                              }`}
                            >
                              <span className="text-gray-300">{option}</span>
                            </div>
                          ))
                        ) : (
                          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                            <span className="text-red-400 text-sm">No options available</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="bg-white/5 p-4 rounded-full mb-4">
                      <FileText className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-gray-400 text-lg">No questions found in this bank.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MCQ Detail Modal */}
        {selectedMCQ && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[60]">
            <div className="bg-slate-900 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col border border-purple-500/30 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
              <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-4 rounded-t-2xl flex-shrink-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white">MCQ Details</h2>
                  <button
                    onClick={() => setSelectedMCQ(null)}
                    className="text-white hover:text-gray-200 text-2xl font-bold leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                 <div className="flex items-start">
                  <span className="text-3xl mr-3 flex-shrink-0">{selectedMCQ.mcq.aiIcon}</span>
                  <div>
                    <h3 className="text-white font-bold text-base mb-1">Question {String(selectedMCQ.index + 1).padStart(2, '0')}:</h3>
                    <p className="text-gray-300 text-base">{selectedMCQ.mcq.question}</p>
                    <div className="mt-2 flex items-center gap-2">
                       {selectedMCQ.mcq.isChecked && (
                        <div className="p-1 bg-green-500/20 rounded-lg border border-green-500/30" title="Approved">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                        </div>
                      )}
                      {selectedMCQ.mcq.isReviewed && (
                        <div className="p-1 bg-amber-500/20 rounded-lg border border-amber-500/30" title="Needs Review">
                          <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                        </div>
                      )}
                       <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getDifficultyColor(selectedMCQ.mcq.difficulty)}`}>
                        {selectedMCQ.mcq.difficultyStars} {selectedMCQ.mcq.difficulty}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-white font-bold mb-2 text-sm">Options:</h3>
                  <div className="space-y-1.5">
                    {selectedMCQ.mcq.options.map((option, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-lg ${
                          option === selectedMCQ.mcq.correctAnswer
                            ? 'bg-green-500/20 border-2 border-green-500'
                            : 'bg-white/5 border border-white/10'
                        }`}
                      >
                        <span className="text-gray-300 text-sm">{option}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-white font-bold mb-1 text-sm">Explanation:</h3>
                  <p className="text-gray-300 bg-white/5 p-3 rounded-lg text-sm">
                    {selectedMCQ.mcq.explanation}
                  </p>
                </div>

                <div>
                  <h3 className="text-white font-bold mb-1 text-sm">SOP Reference:</h3>
                  <p className="text-gray-400 bg-white/5 p-3 rounded-lg italic text-xs">
                    &quot;{selectedMCQ.mcq.sopReference}&quot;
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MCQBankPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-purple-400 animate-spin" />
      </div>
    }>
      <MCQBankContent />
    </Suspense>
  );
}
