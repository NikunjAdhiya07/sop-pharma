'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Filter, ArrowLeft, Loader2, CheckCircle2, XCircle,
  GitMerge, Trash2, Eye, FileText, AlertTriangle, FolderOpen,
  ChevronDown, ChevronRight, Percent, Edit3, Save, X, RefreshCw, Zap
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { formatSOPDisplayName } from '@/lib/sopLibraryHelper';
import SimilarityResolutionCenter from './SimilarityResolutionCenter';

interface MCQ {
  aiIcon: string;
  question: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  difficultyStars: '⭐' | '⭐⭐' | '⭐⭐⭐';
  options: string[];
  correctAnswer: string;
  explanation: string;
  sopReference: string;
}

interface SimilarQuestionItem {
  mcqBankId: string;
  questionIndex: number;
  question: MCQ;
  similarityScore: number;
  matchingText?: string;
}

interface SimilarQuestion {
  _id: string;
  sopId: string;
  sopName: string;
  sopIdentifier: string;
  department: string;
  pageNumber?: number;
  primaryQuestion: {
    mcqBankId: string;
    questionIndex: number;
    question: MCQ;
  };
  similarQuestions: SimilarQuestionItem[];
  reviewStatus: 'pending' | 'reviewed';
  actionTaken?: 'keep_primary' | 'keep_similar' | 'merge' | 'eliminate_all';
  flaggedAt: string;
  flaggedBy?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
}

interface GroupedBySOP {
  sopId: string;
  sopName: string;
  sopIdentifier: string;
  department: string;
  questions: SimilarQuestion[];
}

export default function SimilarQuestionsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [similarQuestions, setSimilarQuestions] = useState<SimilarQuestion[]>([]);
  const [groupedBySOP, setGroupedBySOP] = useState<GroupedBySOP[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, reviewed: 0 });
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'reviewed'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSOPs, setExpandedSOPs] = useState<Set<string>>(new Set());
  const [selectedQuestion, setSelectedQuestion] = useState<SimilarQuestion | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<number>(-1);
  const [reviewNotes, setReviewNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [mostSimilarQuestion, setMostSimilarQuestion] = useState<SimilarQuestionItem | null>(null);
  const [checkingSimilar, setCheckingSimilar] = useState(false);
  const [replacingQuestion, setReplacingQuestion] = useState<string | null>(null); // Format: "bankId-index"
  const [resolverOpen, setResolverOpen] = useState(false);
  const [resolverTarget, setResolverTarget] = useState<{
    mcqBankId: string;
    sopId: string;
    sopName: string;
    sopIdentifier: string;
  } | null>(null);

  useEffect(() => {
    fetchSimilarQuestions();
  }, [filterStatus]);

  const fetchSimilarQuestions = async () => {
    try {
      setLoading(true);
      const statusParam = filterStatus === 'all' ? '' : `?status=${filterStatus}`;
      const response = await fetch(`/api/similar-questions${statusParam}`);
      const data = await response.json();

      if (data.success) {
        setSimilarQuestions(data.similarQuestions);
        setGroupedBySOP(data.groupedBySOP);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching similar questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckSimilar = async (sq: SimilarQuestion) => {
    try {
      setCheckingSimilar(true);
      
      // If no similar questions found yet, trigger detection
      if (sq.similarQuestions.length === 0) {
        console.log('No similar questions found, triggering detection...');
        
        // Trigger detection API
        const detectResponse = await fetch('/api/similar-questions/detect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mcqBankId: sq.primaryQuestion.mcqBankId,
            sopId: sq.sopId,
            threshold: 30, // Lowered to 30 for better detection
            targetQuestionIndex: sq.primaryQuestion.questionIndex,
          }),
        });

        const detectData = await detectResponse.json();
        console.log('Detection result:', detectData);

        if (detectData.success) {
          // Refresh the similar questions list to get updated data
          await fetchSimilarQuestions();
          
          // Show message if no similar questions found
          if (detectData.flaggedCount === 0) {
            alert('No similar questions found for this question.');
            return;
          }
        }
      }
      
      // Find the most similar question (highest similarity score)
      const mostSimilar = sq.similarQuestions.length > 0
        ? sq.similarQuestions.reduce((prev, current) => 
            (prev.similarityScore > current.similarityScore) ? prev : current
          )
        : null;
      
      if (mostSimilar) {
        setMostSimilarQuestion(mostSimilar);
        setSelectedQuestion(sq);
        setComparisonMode(true);
      } else {
        alert('No similar questions found. Try adjusting the similarity threshold.');
      }
    } catch (error) {
      console.error('Error checking similar question:', error);
      alert('Error checking similar questions. Please try again.');
    } finally {
      setCheckingSimilar(false);
    }
  };

  const toggleSOPExpansion = (sopIdentifier: string) => {
    const newExpanded = new Set(expandedSOPs);
    if (newExpanded.has(sopIdentifier)) {
      newExpanded.delete(sopIdentifier);
    } else {
      newExpanded.add(sopIdentifier);
    }
    setExpandedSOPs(newExpanded);
  };

  const handleReview = async () => {
    if (!selectedQuestion || !selectedAction) {
      alert('Please select an action');
      return;
    }

    setProcessing(true);
    try {
      const response = await fetch('/api/similar-questions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedQuestion._id,
          actionTaken: selectedAction,
          keptQuestionIndex: selectedQuestionIndex,
          reviewedBy: 'Admin', // TODO: Get from user session
          reviewNotes,
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert('Review completed successfully!');
        setSelectedQuestion(null);
        setReviewMode(false);
        setSelectedAction('');
        setSelectedQuestionIndex(-1);
        setReviewNotes('');
        fetchSimilarQuestions();
      } else {
        alert(`Failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Error reviewing question:', error);
      alert('Failed to complete review');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this similarity record? The questions will remain in the banks.')) {
      return;
    }

    try {
      const response = await fetch(`/api/similar-questions?id=${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        alert('Similarity record deleted');
        fetchSimilarQuestions();
      } else {
        alert(`Failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Error deleting:', error);
      alert('Failed to delete');
    }
  };

  const handleReplaceQuestion = async (bankId: string, questionIndex: number, sopId: string) => {
    if (!confirm('Replace this question? The current question will be moved to the Recycled section and a new one will be generated.')) {
      return;
    }

    try {
      setReplacingQuestion(`${bankId}-${questionIndex}`);

      // Get user info from localStorage
      const userInfo = localStorage.getItem('user');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (userInfo) {
        headers['x-user-info'] = userInfo;
      }

      // CRITICAL: Generate FIRST before deleting
      // This way if generation fails, the original question stays safe
      console.log('🔄 Starting MCQ generation for replacement...');
      console.log('⚠️ Generating BEFORE delete to protect the original question...');

      const genResponse = await fetch('/api/mcq-bank/generate-replacement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcqBankId: bankId,
          sopId: sopId,
          questionIndex: questionIndex,
          dryRun: true, // Don't actually insert yet - just generate
        }),
      });

      console.log(`📊 Generation response status: ${genResponse.status}`);
      const genData = await genResponse.json();
      console.log('📥 Generation response:', genData);

      if (!genData.success) {
        const errorMsg = genData.details || genData.error || 'Unknown error';
        console.error('❌ Generation failed:', errorMsg);
        alert(`Failed to generate replacement question.\n\nError: ${errorMsg}\n\nOriginal question is safe.`);
        setReplacingQuestion(null);
        return; // STOP - don't delete the original
      }

      // Generation succeeded! Now we can safely delete the old question
      console.log('✅ Generation successful! Now deleting old question...');

      // 2. Delete the question (archives it to EliminatedQuestions with reason 'duplicate')
      const deleteResponse = await fetch(
        `/api/mcq-bank/delete-question?bankId=${bankId}&index=${questionIndex}&source=similarity&duplicateOf=Similar question - deleted and regenerated&replaceWithGenerated=true`,
        {
          method: 'DELETE',
          headers,
        }
      );

      const deleteData = await deleteResponse.json();

      if (!deleteData.success) {
        alert(`Failed to delete old question: ${deleteData.error}\n\nNew question should have been added.`);
        setReplacingQuestion(null);
        fetchSimilarQuestions();
        return;
      }

      // Success!
      alert('Question replaced successfully!');
      // Refresh the similar questions list
      fetchSimilarQuestions();
      // Close the modal
      setSelectedQuestion(null);

    } catch (error) {
      console.error('Error replacing question:', error);
      alert('Failed to replace question. Please check console for details.');
    } finally {
      setReplacingQuestion(null);
    }
  };




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

  const filteredGroups = groupedBySOP.filter((group) =>
    group.sopName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.sopIdentifier.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        <PageHeader showMCQBank={true} />

        {/* Header */}
        <div className="mb-12">
          <h1 className="text-5xl font-bold text-white mb-4 bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-red-600">
            📂 Similar Questions
          </h1>
          <p className="text-gray-300 text-lg">
            Review and manage questions flagged as similar or duplicate
          </p>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <button
            onClick={() => setFilterStatus('all')}
            className={`bg-white/10 backdrop-blur-lg rounded-2xl p-6 border transition-all hover:scale-105 ${
              filterStatus === 'all' 
                ? 'border-orange-500 shadow-lg shadow-orange-500/20' 
                : 'border-white/20 hover:border-white/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <p className="text-gray-400 text-sm">Total Flagged</p>
                <p className="text-3xl font-bold text-white">{stats.total}</p>
              </div>
              <AlertTriangle className="h-12 w-12 text-orange-400" />
            </div>
          </button>

          <button
            onClick={() => setFilterStatus('pending')}
            className={`bg-white/10 backdrop-blur-lg rounded-2xl p-6 border transition-all hover:scale-105 ${
              filterStatus === 'pending' 
                ? 'border-yellow-500 shadow-lg shadow-yellow-500/20' 
                : 'border-white/20 hover:border-white/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <p className="text-gray-400 text-sm">Pending Review</p>
                <p className="text-3xl font-bold text-yellow-400">{stats.pending}</p>
              </div>
              <FileText className="h-12 w-12 text-yellow-400" />
            </div>
          </button>

          <button
            onClick={() => setFilterStatus('reviewed')}
            className={`bg-white/10 backdrop-blur-lg rounded-2xl p-6 border transition-all hover:scale-105 ${
              filterStatus === 'reviewed' 
                ? 'border-green-500 shadow-lg shadow-green-500/20' 
                : 'border-white/20 hover:border-white/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <p className="text-gray-400 text-sm">Reviewed</p>
                <p className="text-3xl font-bold text-green-400">{stats.reviewed}</p>
              </div>
              <CheckCircle2 className="h-12 w-12 text-green-400" />
            </div>
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-white/20 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by SOP name, identifier, or department..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Status Filter */}
            <div className="flex gap-2">
              {['all', 'pending', 'reviewed'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status as any)}
                  className={`px-6 py-3 rounded-xl font-semibold transition-all capitalize ${
                    filterStatus === status
                      ? 'bg-orange-600 text-white'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grouped by SOP */}
        {filteredGroups.length === 0 ? (
          <div className="text-center py-16">
            <FolderOpen className="h-16 w-16 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-400 text-xl">
              {searchTerm ? 'No matching similar questions found' : 'No similar questions flagged yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredGroups.map((group) => (
              <div
                key={group.sopIdentifier}
                className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 overflow-hidden"
              >
                {/* SOP Header */}
                <div className="p-6 flex items-center justify-between hover:bg-white/5 transition-all">
                  <button
                    onClick={() => toggleSOPExpansion(group.sopIdentifier)}
                    className="flex-1 flex items-center gap-4 text-left"
                  >
                    <div className="flex items-center gap-4">
                      {expandedSOPs.has(group.sopIdentifier) ? (
                        <ChevronDown className="h-6 w-6 text-orange-400" />
                      ) : (
                        <ChevronRight className="h-6 w-6 text-orange-400" />
                      )}
                      <FolderOpen className="h-6 w-6 text-orange-400" />
                      <div>
                        <h3 className="text-lg font-bold text-white">
                          {formatSOPDisplayName(group.sopName, group.sopIdentifier)}
                        </h3>
                        <p className="text-sm text-gray-400">
                          {group.department} • {group.questions.length} similar question{group.questions.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        // Find the first question's bank ID to get mcqBankId
                        const firstQuestion = group.questions[0];
                        if (firstQuestion) {
                          setResolverTarget({
                            mcqBankId: firstQuestion.primaryQuestion.mcqBankId,
                            sopId: group.sopId,
                            sopName: group.sopName,
                            sopIdentifier: group.sopIdentifier,
                          });
                          setResolverOpen(true);
                        }
                      }}
                      className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Zap className="w-3 h-3" />
                      Fetch & Replace
                    </button>
                    <span className="px-4 py-2 bg-orange-500/20 text-orange-300 rounded-lg font-semibold">
                      {group.questions.length}
                    </span>
                  </div>
                </div>

                {/* Questions List */}
                {expandedSOPs.has(group.sopIdentifier) && (
                  <div className="border-t border-white/10 p-4 space-y-3">
                    {group.questions.map((sq) => (
                      <div
                        key={sq._id}
                        className="bg-white/5 rounded-xl p-5 border border-white/10 hover:border-orange-500/30 transition-all"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-2xl">{sq.primaryQuestion.question.aiIcon}</span>
                              <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-lg font-bold text-sm border border-blue-500/30">
                                Question #{sq.primaryQuestion.questionIndex + 1}
                              </span>
                              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                                sq.reviewStatus === 'pending'
                                  ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500'
                                  : 'bg-green-500/20 text-green-300 border-green-500'
                              }`}>
                                {sq.reviewStatus === 'pending' ? 'Pending Review' : 'Reviewed'}
                              </span>
                              <span className="text-gray-400 text-sm">
                                Flagged by {sq.flaggedBy || 'System'} • {new Date(sq.flaggedAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-white font-semibold mb-2">
                              {sq.primaryQuestion.question.question}
                            </p>
                            <p className="text-sm text-gray-400">
                              {sq.similarQuestions.length > 0 
                                ? `${sq.similarQuestions.length} similar question${sq.similarQuestions.length !== 1 ? 's' : ''} found`
                                : 'Click "Check Similar" to find similar questions'
                              }
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleCheckSimilar(sq)}
                              disabled={checkingSimilar}
                              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {checkingSimilar ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Percent className="w-4 h-4" />
                              )}
                              Check Similar
                            </button>
                            <button
                              onClick={() => {
                                setSelectedQuestion(sq);
                                setReviewMode(false);
                                setComparisonMode(false);
                              }}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                            >
                              <Eye className="w-4 h-4" />
                              View
                            </button>
                            {sq.reviewStatus === 'pending' && (
                              <>
                                <button
                                  onClick={() => {
                                    setSelectedQuestion(sq);
                                    setReviewMode(true);
                                  }}
                                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                                >
                                  <Edit3 className="w-4 h-4" />
                                  Review
                                </button>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!confirm('Mark this question group as done/reviewed?')) return;
                                    
                                    try {
                                      const response = await fetch('/api/similar-questions/review', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          id: sq._id,
                                          action: 'keep_primary',
                                          reviewNotes: 'Marked as reviewed from list view'
                                        })
                                      });
                                      
                                      const data = await response.json();
                                      
                                      if (data.success) {
                                        // alert('Marked as reviewed!'); // Optional feedback
                                        fetchSimilarQuestions();
                                      } else {
                                        alert(`Failed: ${data.error}`);
                                      }
                                    } catch (error) {
                                      console.error('Error marking as done:', error);
                                      alert('Failed to mark as done');
                                    }
                                  }}
                                  className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  Done
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleDelete(sq._id)}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Similar Questions Preview */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {sq.similarQuestions.slice(0, 2).map((similar, idx) => (
                            <div
                              key={idx}
                              className="bg-white/5 rounded-lg p-3 border border-white/10"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <span className="px-2 py-1 bg-blue-500/30 text-blue-300 rounded font-bold text-xs border border-blue-500/50">
                                  Q{similar.questionIndex + 1}
                                </span>
                                <Percent className="h-4 w-4 text-orange-400" />
                                <span className="text-orange-300 font-bold text-sm">
                                  {similar.similarityScore}% similar
                                </span>
                              </div>
                              <p className="text-gray-300 text-sm line-clamp-2">
                                {similar.question.question}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Review Modal */}
        {selectedQuestion && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto border border-orange-500/30 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
              <div className="sticky top-0 bg-gradient-to-r from-orange-600 to-red-600 p-6 rounded-t-2xl z-10">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white mb-2">
                      {reviewMode ? 'Review Similar Questions' : 'View Similar Questions'}
                    </h2>
                    <p className="text-orange-100 text-sm">
                      {formatSOPDisplayName(selectedQuestion.sopName, selectedQuestion.sopIdentifier)}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedQuestion(null);
                      setReviewMode(false);
                      setSelectedAction('');
                      setSelectedQuestionIndex(-1);
                      setReviewNotes('');
                    }}
                    className="text-white hover:text-gray-200 text-2xl font-bold"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Primary Question */}
                <div className="bg-blue-500/10 rounded-xl p-5 border-2 border-blue-500/50">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-3 py-1 bg-blue-600 text-white rounded-lg font-bold text-sm">
                      Primary Question
                    </span>
                    {reviewMode && (
                      <button
                        onClick={() => {
                          setSelectedAction('keep_primary');
                          setSelectedQuestionIndex(-1);
                        }}
                        className={`px-3 py-1 rounded-lg font-bold text-sm transition-all ${
                          selectedAction === 'keep_primary'
                            ? 'bg-green-600 text-white'
                            : 'bg-white/10 text-gray-300 hover:bg-white/20'
                        }`}
                      >
                        ✅ Keep This Version
                      </button>
                    )}
                    <button
                      onClick={() => handleReplaceQuestion(
                        selectedQuestion.primaryQuestion.mcqBankId,
                        selectedQuestion.primaryQuestion.questionIndex,
                        selectedQuestion.sopId
                      )}
                      disabled={replacingQuestion === `${selectedQuestion.primaryQuestion.mcqBankId}-${selectedQuestion.primaryQuestion.questionIndex}`}
                      className="px-3 py-1 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white rounded-lg font-bold text-sm transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {replacingQuestion === `${selectedQuestion.primaryQuestion.mcqBankId}-${selectedQuestion.primaryQuestion.questionIndex}` ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Replacing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-3.5 w-3.5" />
                          Delete & Regenerate
                        </>
                      )}
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm('Mark this question group as reviewed?')) return;
                        try {
                          const response = await fetch('/api/similar-questions/review', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              id: selectedQuestion._id,
                              action: 'keep_primary',
                              reviewNotes: 'Marked as reviewed from quick action'
                            })
                          });
                          const data = await response.json();
                          if (data.success) {
                            alert('Marked as reviewed!');
                            fetchSimilarQuestions();
                            setSelectedQuestion(null);
                          }
                        } catch (error) {
                          console.error(error);
                          alert('Failed to mark as reviewed');
                        }
                      }}
                      className="px-3 py-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg font-bold text-sm transition-all flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Mark as Reviewed
                    </button>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">{selectedQuestion.primaryQuestion.question.aiIcon}</span>
                    <div className="flex-1">
                      <p className="text-white font-semibold mb-2">
                        {selectedQuestion.primaryQuestion.question.question}
                      </p>
                      <div className="space-y-1">
                        {selectedQuestion.primaryQuestion.question.options.map((opt, idx) => (
                          <div
                            key={idx}
                            className={`p-2 rounded-lg text-sm ${
                              opt === selectedQuestion.primaryQuestion.question.correctAnswer
                                ? 'bg-green-500/20 border border-green-500/50 text-green-300'
                                : 'bg-white/5 text-gray-300'
                            }`}
                          >
                            {opt}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Similar Questions */}
                <div className="space-y-4">
                  <h3 className="text-white font-bold text-lg">Similar Questions Found:</h3>
                  {selectedQuestion.similarQuestions.map((similar, idx) => (
                    <div
                      key={idx}
                      className="bg-orange-500/10 rounded-xl p-5 border-2 border-orange-500/50"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span className="px-3 py-1 bg-blue-500/30 text-blue-300 rounded-lg font-bold text-sm border border-blue-500/50">
                          Question #{similar.questionIndex + 1}
                        </span>
                        <span className="px-3 py-1 bg-orange-600 text-white rounded-lg font-bold text-sm flex items-center gap-2">
                          <Percent className="h-4 w-4" />
                          {similar.similarityScore}% Similar
                        </span>
                        {similar.matchingText && (
                          <span className="text-xs text-gray-400">
                            Matching: {similar.matchingText}
                          </span>
                        )}
                        {reviewMode && (
                          <button
                            onClick={() => {
                              setSelectedAction('keep_similar');
                              setSelectedQuestionIndex(idx);
                            }}
                            className={`ml-auto px-3 py-1 rounded-lg font-bold text-sm transition-all ${
                              selectedAction === 'keep_similar' && selectedQuestionIndex === idx
                                ? 'bg-green-600 text-white'
                                : 'bg-white/10 text-gray-300 hover:bg-white/20'
                            }`}
                          >
                            ✅ Keep This Version
                          </button>
                        )}
                        <button
                          onClick={() => handleReplaceQuestion(
                            similar.mcqBankId,
                            similar.questionIndex,
                            selectedQuestion.sopId
                          )}
                          disabled={replacingQuestion === `${similar.mcqBankId}-${similar.questionIndex}`}
                          className="px-3 py-1 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white rounded-lg font-bold text-sm transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {replacingQuestion === `${similar.mcqBankId}-${similar.questionIndex}` ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Replacing...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-3.5 w-3.5" />
                              Delete & Regenerate
                            </>
                          )}
                        </button>

                      </div>
                      <div className="flex items-start gap-3">
                        <span className="text-3xl">{similar.question.aiIcon}</span>
                        <div className="flex-1">
                          <p className="text-white font-semibold mb-2">
                            {similar.question.question}
                          </p>
                          <div className="space-y-1">
                            {similar.question.options.map((opt, optIdx) => (
                              <div
                                key={optIdx}
                                className={`p-2 rounded-lg text-sm ${
                                  opt === similar.question.correctAnswer
                                    ? 'bg-green-500/20 border border-green-500/50 text-green-300'
                                    : 'bg-white/5 text-gray-300'
                                }`}
                              >
                                {opt}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>



                {/* Review Actions */}
                {reviewMode && (
                  <div className="bg-white/5 rounded-xl p-5 border border-white/10">
                    <h3 className="text-white font-bold mb-4">Review Actions:</h3>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <button
                        onClick={() => setSelectedAction('eliminate_all')}
                        className={`p-4 rounded-lg font-bold transition-all flex items-center gap-3 ${
                          selectedAction === 'eliminate_all'
                            ? 'bg-red-600 text-white'
                            : 'bg-white/10 text-gray-300 hover:bg-white/20'
                        }`}
                      >
                        <XCircle className="h-5 w-5" />
                        Eliminate All Questions
                      </button>
                      <button
                        onClick={() => setSelectedAction('merge')}
                        className={`p-4 rounded-lg font-bold transition-all flex items-center gap-3 ${
                          selectedAction === 'merge'
                            ? 'bg-purple-600 text-white'
                            : 'bg-white/10 text-gray-300 hover:bg-white/20'
                        }`}
                      >
                        <GitMerge className="h-5 w-5" />
                        Merge & Edit (Coming Soon)
                      </button>
                    </div>

                    <textarea
                      placeholder="Add review notes (optional)..."
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 mb-4"
                      rows={3}
                    />

                    <div className="flex gap-3">
                      <button
                        onClick={handleReview}
                        disabled={!selectedAction || processing}
                        className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {processing ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Save className="h-5 w-5" />
                            Complete Review
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setReviewMode(false);
                          setSelectedAction('');
                          setSelectedQuestionIndex(-1);
                          setReviewNotes('');
                        }}
                        className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-xl transition-all flex items-center gap-2"
                      >
                        <X className="h-5 w-5" />
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Similarity Resolution Modal */}
        {resolverOpen && resolverTarget && (
          <SimilarityResolutionCenter
            mcqBankId={resolverTarget.mcqBankId}
            sopId={resolverTarget.sopId}
            sopName={resolverTarget.sopName}
            sopIdentifier={resolverTarget.sopIdentifier}
            isOpen={resolverOpen}
            onClose={() => {
              setResolverOpen(false);
              setResolverTarget(null);
            }}
            onComplete={(summary) => {
              // Refresh the list after resolution completes
              fetchSimilarQuestions();
            }}
          />
        )}
      </div>
    </div>
  );
}
