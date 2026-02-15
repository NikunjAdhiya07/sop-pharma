'use client';

import { useState, useEffect } from 'react';
import { 
  Trash2, 
  RotateCcw, 
  Filter, 
  Search, 
  AlertCircle,
  CheckCircle,
  XCircle,
  Download,
  RefreshCw,
  Eye,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';

interface EliminatedQuestion {
  _id: string;
  sopId: string;
  sopName: string;
  sopIdentifier: string;
  question: {
    question: string;
    difficulty: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
    sopReference: string;
  };
  eliminationReason: 'duplicate' | 'content-mismatch' | 'manual';
  eliminatedAt: string;
  eliminatedBy?: string;
  duplicateOf?: string;
  similarityScore?: number;
  replacedWith?: string;
}

export default function EliminatedQuestionsPage() {
  const [eliminated, setEliminated] = useState<EliminatedQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<{
    reason: string;
    search: string;
    sopId: string;
  }>({
    reason: 'all',
    search: '',
    sopId: '',
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [cleanupResults, setCleanupResults] = useState<any>(null);

  const runCleanup = async (dryRun: boolean = false) => {
    if (!confirm(dryRun ? 'Run cleanup in preview mode?' : 'Run actual cleanup? This will remove duplicates and old questions!')) {
      return;
    }

    setCleanupRunning(true);
    setCleanupResults(null);

    try {
      const response = await fetch('/api/admin/cleanup-mcqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'all',
          dryRun,
          similarityThreshold: 80,
          autoReplace: !dryRun, // Only auto-replace in live mode
        }),
      });

      const data = await response.json();

      if (data.success) {
        setCleanupResults(data.results);
        alert(`Cleanup ${dryRun ? 'preview' : 'complete'}!\n\nRemoved: ${data.results.removed.total} questions\nReplaced: ${data.results.replaced} questions`);
        
        // Refresh the eliminated questions list
        if (!dryRun) {
          fetchEliminated();
        }
      } else {
        alert(`Cleanup failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Cleanup failed:', error);
      alert('Cleanup failed - check console for details');
    } finally {
      setCleanupRunning(false);
    }
  };

  useEffect(() => {
    fetchEliminated();
  }, [filter.reason, filter.sopId]);

  const fetchEliminated = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.reason !== 'all') params.append('reason', filter.reason);
      if (filter.sopId) params.append('sopId', filter.sopId);
      
      // Only fetch questions from review center workflow (excludes similarity-based)
      params.append('source', 'review');
      
      const response = await fetch(`/api/admin/eliminated-questions?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setEliminated(data.eliminated);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch eliminated questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (id: string) => {
    if (!confirm('Are you sure you want to restore this question?')) return;
    
    setRestoring(id);
    try {
      const response = await fetch('/api/admin/eliminated-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eliminatedId: id, action: 'restore' }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert('Question restored successfully!');
        fetchEliminated();
      } else {
        alert(`Failed to restore: ${data.error}`);
      }
    } catch (error) {
      console.error('Restore failed:', error);
      alert('Failed to restore question');
    } finally {
      setRestoring(null);
    }
  };

  const getReasonIcon = (reason: string) => {
    switch (reason) {
      case 'duplicate':
        return <AlertCircle className="w-5 h-5 text-yellow-400" />;
      case 'content-mismatch':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'manual':
        return <Trash2 className="w-5 h-5 text-gray-400" />;
      default:
        return null;
    }
  };

  const getReasonBadge = (reason: string) => {
    const colors = {
      duplicate: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      'content-mismatch': 'bg-red-500/20 text-red-300 border-red-500/30',
      manual: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
    };
    
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${colors[reason as keyof typeof colors]}`}>
        {reason.replace('-', ' ').toUpperCase()}
      </span>
    );
  };

  const filteredEliminated = eliminated.filter(item => {
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      return (
        item.question.question.toLowerCase().includes(searchLower) ||
        item.sopName.toLowerCase().includes(searchLower) ||
        item.sopIdentifier.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <PageHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Review Center - Eliminated Questions
            </h1>
            <p className="text-gray-400">
              Questions deleted, replaced, or modified through the Review Center workflow
            </p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => runCleanup(true)}
              disabled={cleanupRunning}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-lg"
            >
              <Eye className={`w-5 h-5 ${cleanupRunning ? 'animate-pulse' : ''}`} />
              Preview Cleanup
            </button>
            <button
              onClick={() => runCleanup(false)}
              disabled={cleanupRunning}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-lg"
            >
              <Trash2 className={`w-5 h-5 ${cleanupRunning ? 'animate-spin' : ''}`} />
              {cleanupRunning ? 'Running...' : 'Run Cleanup'}
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Eliminated</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {Object.values(stats).reduce((a, b) => a + b, 0)}
                </p>
              </div>
              <Trash2 className="w-10 h-10 text-purple-400 opacity-50" />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm border border-yellow-500/30 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Duplicates</p>
                <p className="text-3xl font-bold text-yellow-300 mt-1">
                  {stats.duplicate || 0}
                </p>
              </div>
              <AlertCircle className="w-10 h-10 text-yellow-400 opacity-50" />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm border border-red-500/30 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Content Mismatches</p>
                <p className="text-3xl font-bold text-red-300 mt-1">
                  {stats['content-mismatch'] || 0}
                </p>
              </div>
              <XCircle className="w-10 h-10 text-red-400 opacity-50" />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm border border-gray-500/30 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Manual Removals</p>
                <p className="text-3xl font-bold text-gray-300 mt-1">
                  {stats.manual || 0}
                </p>
              </div>
              <Trash2 className="w-10 h-10 text-gray-400 opacity-50" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={filter.search}
                  onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                  placeholder="Search questions, SOPs..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* Reason Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Elimination Reason
              </label>
              <select
                value={filter.reason}
                onChange={(e) => setFilter({ ...filter, reason: e.target.value })}
                className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
              >
                <option value="all">All Reasons</option>
                <option value="duplicate">Duplicates</option>
                <option value="content-mismatch">Content Mismatches</option>
                <option value="manual">Manual Removals</option>
              </select>
            </div>

            {/* Refresh Button */}
            <div className="flex items-end">
              <button
                onClick={fetchEliminated}
                disabled={loading}
                className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Questions List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12">
              <RefreshCw className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
              <p className="text-gray-400">Loading eliminated questions...</p>
            </div>
          ) : filteredEliminated.length === 0 ? (
            <div className="text-center py-12 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl">
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <p className="text-xl text-white font-medium mb-2">No eliminated questions found</p>
              <p className="text-gray-400">All MCQs are clean!</p>
            </div>
          ) : (
            filteredEliminated.map((item) => (
              <div
                key={item._id}
                className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl overflow-hidden hover:border-purple-500/50 transition-all"
              >
                {/* Header */}
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {getReasonIcon(item.eliminationReason)}
                        <h3 className="text-lg font-bold text-white">
                          {item.sopIdentifier} - {item.sopName}
                        </h3>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        {getReasonBadge(item.eliminationReason)}
                        {item.similarityScore && (
                          <span className="px-3 py-1 bg-orange-500/20 text-orange-300 border border-orange-500/30 rounded-full text-xs font-medium">
                            {item.similarityScore}% Similar
                          </span>
                        )}
                        <span className="text-gray-400 text-sm">
                          Eliminated {new Date(item.eliminatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setExpandedId(expandedId === item._id ? null : item._id)}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        {expandedId === item._id ? 'Hide' : 'View'}
                        {expandedId === item._id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleRestore(item._id)}
                        disabled={restoring === item._id}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
                      >
                        <RotateCcw className={`w-4 h-4 ${restoring === item._id ? 'animate-spin' : ''}`} />
                        Restore
                      </button>
                    </div>
                  </div>

                  {/* Question Preview */}
                  <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-600">
                    <p className="text-white font-medium mb-2">{item.question.question}</p>
                    <p className="text-gray-400 text-sm">
                      Reference: {item.question.sopReference} | Difficulty: {item.question.difficulty}
                    </p>
                  </div>

                  {/* Additional Info */}
                  {item.duplicateOf && (
                    <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                      <p className="text-yellow-300 text-sm font-medium mb-1">Duplicate of:</p>
                      <p className="text-gray-300 text-sm">{item.duplicateOf}</p>
                    </div>
                  )}
                </div>

                {/* Expanded Details */}
                {expandedId === item._id && (
                  <div className="border-t border-slate-700 p-6 bg-slate-900/30">
                    <h4 className="text-white font-bold mb-4">Full Question Details</h4>
                    
                    <div className="space-y-4">
                      <div>
                        <p className="text-gray-400 text-sm mb-2">Options:</p>
                        <div className="space-y-2">
                          {item.question.options.map((option, idx) => (
                            <div
                              key={idx}
                              className={`p-3 rounded-lg ${
                                option === item.question.correctAnswer
                                  ? 'bg-green-500/20 border border-green-500/30'
                                  : 'bg-slate-800 border border-slate-600'
                              }`}
                            >
                              <p className={option === item.question.correctAnswer ? 'text-green-300' : 'text-gray-300'}>
                                {option} {option === item.question.correctAnswer && '✓'}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-gray-400 text-sm mb-2">Explanation:</p>
                        <p className="text-gray-300 bg-slate-800 p-3 rounded-lg border border-slate-600">
                          {item.question.explanation}
                        </p>
                      </div>

                      {item.eliminatedBy && (
                        <div>
                          <p className="text-gray-400 text-sm">Eliminated by: <span className="text-white">{item.eliminatedBy}</span></p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Results Count */}
        {!loading && filteredEliminated.length > 0 && (
          <div className="mt-6 text-center text-gray-400">
            Showing {filteredEliminated.length} of {eliminated.length} eliminated questions
          </div>
        )}
      </div>
    </div>
  );
}
