'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Award,
  Trophy,
  Clock,
  Target,
  TrendingUp,
  Eye,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Calendar,
  BarChart3,
  Filter,
} from 'lucide-react';

interface TestResult {
  _id: string;
  mcqBankId: string;
  sopName: string;
  sopIdentifier: string;
  testName: string;
  score: number;
  grade: string;
  isPassed: boolean;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  timeTaken: number;
  attemptNumber: number;
  completedAt: string;
  reviewed: boolean;
}

export default function ReviewCenterPage() {
  const router = useRouter();
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [userId, setUserId] = useState<string>('');

  useEffect(() => {
    // Get user from localStorage
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        setUserId(user.id);
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }
  }, []);

  useEffect(() => {
    if (userId) {
      fetchResults();
    }
  }, [userId]);

  const fetchResults = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/mcq-tests/results?userId=${userId}`);
      const data = await response.json();

      if (data.success) {
        setResults(data.results);
      }
    } catch (error) {
      console.error('Error fetching results:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredResults = results.filter(result => {
    if (filter === 'passed') return result.isPassed;
    if (filter === 'failed') return !result.isPassed;
    return true;
  });

  const getGradeColor = (grade: string) => {
    if (grade.startsWith('A')) return 'text-emerald-400';
    if (grade.startsWith('B')) return 'text-blue-400';
    if (grade === 'C') return 'text-yellow-400';
    return 'text-red-400';
  };

  const getGradeBg = (grade: string) => {
    if (grade.startsWith('A')) return 'bg-emerald-500/20 border-emerald-500';
    if (grade.startsWith('B')) return 'bg-blue-500/20 border-blue-500';
    if (grade === 'C') return 'bg-yellow-500/20 border-yellow-500';
    return 'bg-red-500/20 border-red-500';
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-white text-xl font-medium">Loading Review Center...</p>
        </div>
      </div>
    );
  }

  const stats = {
    total: results.length,
    passed: results.filter(r => r.isPassed).length,
    failed: results.filter(r => !r.isPassed).length,
    avgScore: results.length > 0 
      ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
      : 0,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-yellow-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-yellow-400 to-orange-600 bg-clip-text text-transparent mb-2">
                ⭐ Review Center
              </h1>
              <p className="text-gray-300 text-lg">
                Review all your test attempts and track your progress
              </p>
            </div>
            <button
              onClick={() => router.push('/mcq-tests')}
              className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 transition-all"
            >
              <ArrowLeft className="h-5 w-5" />
              Back to Tests
            </button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-3">
              <BarChart3 className="h-8 w-8 text-purple-400" />
              <TrendingUp className="h-5 w-5 text-green-400" />
            </div>
            <p className="text-gray-400 text-sm mb-1">Total Attempts</p>
            <p className="text-4xl font-bold text-white">{stats.total}</p>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <TrendingUp className="h-5 w-5 text-green-400" />
            </div>
            <p className="text-gray-400 text-sm mb-1">Passed</p>
            <p className="text-4xl font-bold text-emerald-400">{stats.passed}</p>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-3">
              <XCircle className="h-8 w-8 text-red-400" />
              <TrendingUp className="h-5 w-5 text-red-400" />
            </div>
            <p className="text-gray-400 text-sm mb-1">Failed</p>
            <p className="text-4xl font-bold text-red-400">{stats.failed}</p>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-3">
              <Trophy className="h-8 w-8 text-yellow-400" />
              <TrendingUp className="h-5 w-5 text-green-400" />
            </div>
            <p className="text-gray-400 text-sm mb-1">Average Score</p>
            <p className="text-4xl font-bold text-white">{stats.avgScore}%</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-8">
          <div className="flex items-center gap-4">
            <Filter className="h-5 w-5 text-gray-400" />
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-xl transition-all ${
                filter === 'all'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
            >
              All ({results.length})
            </button>
            <button
              onClick={() => setFilter('passed')}
              className={`px-4 py-2 rounded-xl transition-all ${
                filter === 'passed'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
            >
              Passed ({stats.passed})
            </button>
            <button
              onClick={() => setFilter('failed')}
              className={`px-4 py-2 rounded-xl transition-all ${
                filter === 'failed'
                  ? 'bg-red-600 text-white'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
            >
              Failed ({stats.failed})
            </button>
          </div>
        </div>

        {/* Results List */}
        {filteredResults.length === 0 ? (
          <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10">
            <Award className="h-16 w-16 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-400 text-xl">No test results found</p>
            <button
              onClick={() => router.push('/mcq-tests')}
              className="mt-4 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl transition-all"
            >
              Take a Test
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredResults.map((result) => (
              <div
                key={result._id}
                className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:border-purple-500/50 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-white">{result.sopName}</h3>
                      <span className={`px-3 py-1 rounded-lg text-sm font-bold border ${getGradeBg(result.grade)}`}>
                        <span className={getGradeColor(result.grade)}>Grade: {result.grade}</span>
                      </span>
                      {result.isPassed ? (
                        <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-lg text-sm font-bold border border-emerald-500/50">
                          ✓ Passed
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-red-500/20 text-red-300 rounded-lg text-sm font-bold border border-red-500/50">
                          ✗ Failed
                        </span>
                      )}
                    </div>
                    <p className="text-purple-300 text-sm font-mono mb-3">{result.sopIdentifier}</p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-300">
                          Score: <span className={`font-bold ${getGradeColor(result.grade)}`}>{result.score}%</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <span className="text-sm text-gray-300">
                          Correct: <span className="font-bold text-white">{result.correctAnswers}/{result.totalQuestions}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-blue-400" />
                        <span className="text-sm text-gray-300">
                          Time: <span className="font-bold text-white">{formatTime(result.timeTaken)}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-purple-400" />
                        <span className="text-sm text-gray-300">
                          Attempt #{result.attemptNumber}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500">
                      Completed: {formatDate(result.completedAt)}
                    </p>
                  </div>

                  <button
                    onClick={() => router.push(`/mcq-tests/results/${result._id}`)}
                    className="ml-4 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20"
                  >
                    <Eye className="h-5 w-5" />
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
