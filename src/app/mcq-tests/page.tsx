'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Trophy,
  Clock,
  Target,
  TrendingUp,
  Play,
  Eye,
  Award,
  BarChart3,
  Filter,
  Search,
  ArrowLeft,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface MCQBank {
  _id: string;
  sopName: string;
  sopIdentifier: string;
  totalQuestions: number;
  difficultyDistribution: {
    easy: number;
    medium: number;
    hard: number;
  };
  department: string;
  attempts: Array<{
    score: number;
    isPassed: boolean;
    attemptNumber: number;
    completedAt: string;
  }>;
  totalAttempts: number;
  bestScore: number;
}

export default function MCQTestsPage() {
  const router = useRouter();
  const [mcqBanks, setMcqBanks] = useState<MCQBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'name' | 'questions' | 'attempts'>('name');
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
      fetchMCQBanks();
    }
  }, [userId]);

  const fetchMCQBanks = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/mcq-tests?userId=${userId}`);
      const data = await response.json();

      if (data.success) {
        setMcqBanks(data.mcqBanks);
      }
    } catch (error) {
      console.error('Error fetching MCQ banks:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredBanks = mcqBanks
    .filter(bank => {
      const matchesSearch = bank.sopName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           bank.sopIdentifier.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDepartment = departmentFilter === 'All' || bank.department === departmentFilter;
      return matchesSearch && matchesDepartment;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.sopName.localeCompare(b.sopName);
        case 'questions':
          return b.totalQuestions - a.totalQuestions;
        case 'attempts':
          return b.totalAttempts - a.totalAttempts;
        default:
          return 0;
      }
    });

  const departments = ['All', ...Array.from(new Set(mcqBanks.map(b => b.department)))];

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-400';
    if (score >= 80) return 'text-blue-400';
    if (score >= 70) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 90) return 'bg-emerald-500/20 border-emerald-500/50';
    if (score >= 80) return 'bg-blue-500/20 border-blue-500/50';
    if (score >= 70) return 'bg-yellow-500/20 border-yellow-500/50';
    return 'bg-red-500/20 border-red-500/50';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-white text-xl font-medium">Loading MCQ Tests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent mb-2">
                📚 MCQ Test Center
              </h1>
              <p className="text-gray-300 text-lg">
                Test your knowledge with generated MCQ banks
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/mcq-tests/review-center')}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 text-white rounded-xl border border-yellow-500/50 transition-all shadow-lg shadow-yellow-500/20"
              >
                <Award className="h-5 w-5" />
                ⭐ Review Center
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 transition-all"
              >
                <ArrowLeft className="h-5 w-5" />
                Dashboard
              </button>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-3">
              <BookOpen className="h-8 w-8 text-blue-400" />
              <TrendingUp className="h-5 w-5 text-green-400" />
            </div>
            <p className="text-gray-400 text-sm mb-1">Available Tests</p>
            <p className="text-4xl font-bold text-white">{mcqBanks.length}</p>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-3">
              <Target className="h-8 w-8 text-purple-400" />
              <TrendingUp className="h-5 w-5 text-green-400" />
            </div>
            <p className="text-gray-400 text-sm mb-1">Total Questions</p>
            <p className="text-4xl font-bold text-white">
              {mcqBanks.reduce((sum, b) => sum + b.totalQuestions, 0)}
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-3">
              <Trophy className="h-8 w-8 text-yellow-400" />
              <TrendingUp className="h-5 w-5 text-green-400" />
            </div>
            <p className="text-gray-400 text-sm mb-1">Tests Completed</p>
            <p className="text-4xl font-bold text-white">
              {mcqBanks.reduce((sum, b) => sum + b.totalAttempts, 0)}
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-3">
              <Award className="h-8 w-8 text-emerald-400" />
              <TrendingUp className="h-5 w-5 text-green-400" />
            </div>
            <p className="text-gray-400 text-sm mb-1">Average Score</p>
            <p className="text-4xl font-bold text-white">
              {mcqBanks.length > 0
                ? Math.round(
                    mcqBanks.reduce((sum, b) => sum + b.bestScore, 0) / mcqBanks.length
                  )
                : 0}%
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by SOP name or identifier..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {departments.map(dept => (
                <option key={dept} value={dept} className="bg-slate-800">
                  {dept}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="name" className="bg-slate-800">Sort by Name</option>
              <option value="questions" className="bg-slate-800">Sort by Questions</option>
              <option value="attempts" className="bg-slate-800">Sort by Attempts</option>
            </select>
          </div>
        </div>

        {/* MCQ Banks Grid */}
        {filteredBanks.length === 0 ? (
          <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10">
            <BookOpen className="h-16 w-16 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-400 text-xl">No MCQ tests found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredBanks.map((bank) => (
              <div
                key={bank._id}
                className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:border-purple-500/50 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-xl hover:shadow-purple-500/20"
              >
                {/* Header */}
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-white mb-2 line-clamp-2">
                    {bank.sopName}
                  </h3>
                  <p className="text-sm text-purple-300 font-mono">{bank.sopIdentifier}</p>
                  <p className="text-xs text-gray-400 mt-1">{bank.department}</p>
                </div>

                {/* Stats */}
                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">Total Questions:</span>
                    <span className="text-white font-bold">{bank.totalQuestions}</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-green-300">Easy:</span>
                      <span className="text-white font-semibold">{bank.difficultyDistribution.easy}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-yellow-300">Medium:</span>
                      <span className="text-white font-semibold">{bank.difficultyDistribution.medium}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-red-300">Hard:</span>
                      <span className="text-white font-semibold">{bank.difficultyDistribution.hard}</span>
                    </div>
                  </div>

                  {bank.totalAttempts > 0 && (
                    <>
                      <div className="border-t border-white/10 pt-3">
                        <div className="flex items-center justify-between text-sm mb-2">
                          <span className="text-gray-300">Best Score:</span>
                          <span className={`font-bold text-lg ${getScoreColor(bank.bestScore)}`}>
                            {bank.bestScore}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">Attempts:</span>
                          <span className="text-white font-semibold">{bank.totalAttempts}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/mcq-tests/${bank._id}`)}
                    className="flex-1 py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/30"
                  >
                    <Play className="h-4 w-4" />
                    Start Test
                  </button>
                  {bank.totalAttempts > 0 && (
                    <button
                      onClick={() => router.push(`/mcq-tests/history/${bank._id}`)}
                      className="py-3 px-4 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all border border-white/20"
                      title="View History"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
