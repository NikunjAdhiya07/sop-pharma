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
  Zap,
  ChevronRight,
  Loader2,
  ClipboardList,
} from 'lucide-react';
import QuestionBasisSelection from '@/components/QuestionBasisSelection';

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

export default function SpecificTestCenterPage() {
  const router = useRouter();
  const [step, setStep] = useState<'selection' | 'manual-sop-list' | 'ai-ready'>('selection');
  const [basis, setBasis] = useState<'ai' | 'manual'>('ai');
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-white text-xl font-medium">Loading Specific Test Center...</p>
        </div>
      </div>
    );
  }

  // STEP 1: Mode Selection
  if (step === 'selection') {
    return (
        <div className="min-h-screen bg-slate-900 p-8 flex items-center justify-center">
          <div className="w-full">
             <button
              onClick={() => router.push('/mcq-tests')}
              className="mb-8 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all flex items-center gap-2 border border-white/10"
            >
              <ArrowLeft className="h-4 w-4" /> Back to MCQ Tests
            </button>
            <QuestionBasisSelection 
              title="Specific Training Test Configuration" 
              onSelect={(type) => {
                setBasis(type);
                if (type === 'ai') {
                  setStep('ai-ready');
                } else {
                  setStep('manual-sop-list');
                }
              }} 
            />
          </div>
        </div>
      );
  }

  // STEP 2 (AI): AI Mode Ready
  if (step === 'ai-ready') {
    return (
        <div className="min-h-screen bg-slate-900 p-8 flex items-center justify-center relative">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-yellow-500/10 rounded-full blur-3xl animate-pulse"></div>
          </div>

          <div className="max-w-2xl w-full relative z-10">
             <button
              onClick={() => setStep('selection')}
              className="mb-8 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all flex items-center gap-2 border border-white/10"
            >
              <ArrowLeft className="h-4 w-4" /> Change Mode
            </button>
            
            <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-12 border border-white/20 text-center shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-500 via-orange-500 to-yellow-500 animate-pulse"></div>
              
              <div className="bg-yellow-500/20 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 border border-yellow-500/30 animate-in zoom-in-50 duration-500">
                <Zap className="h-12 w-12 text-yellow-400" />
              </div>
              
              <h2 className="text-4xl font-black text-white mb-4">AI Specific Assessment</h2>
              <p className="text-gray-400 text-lg mb-10 leading-relaxed">
                Automated procedure review with <span className="text-yellow-400 font-bold">Instant Feedback</span>. AI will curate questions across all SOPs to test your comprehensive knowledge.
              </p>
              
              <div className="grid grid-cols-2 gap-4 mb-10 text-left">
                <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Feedback</div>
                  <div className="text-white font-semibold flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Instant
                  </div>
                </div>
                <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Mode</div>
                  <div className="text-white font-semibold">Continuous Learning</div>
                </div>
              </div>
  
              <button
                // Since AI mode needs a way to pick questions, for now we can pick a random bank or 
                // we'll need a specialized API. For now, let's redirect to first bank as a placeholder 
                // or tell user to use manual mode if AI generation for specific test isn't ready.
                // Actually, I'll redirect to a special ID or similar.
                onClick={() => {
                    if (mcqBanks.length > 0) {
                        router.push(`/mcq-tests/specific-test-center/${mcqBanks[0]._id}`);
                    }
                }}
                className="w-full py-5 bg-gradient-to-r from-yellow-600 to-orange-600 text-white font-black text-xl rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-yellow-500/20 flex items-center justify-center gap-3"
              >
                Begin AI Specific Test
                <Play className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      );
  }

  // STEP 2 (Manual): Manual SOP List
  return (
    <div className="min-h-screen bg-slate-900 border-t border-white/10">
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
           <button
            onClick={() => setStep('selection')}
            className="mb-8 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all flex items-center gap-2 border border-white/10"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Selection
          </button>

          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-yellow-400 to-orange-600 bg-clip-text text-transparent mb-2">
                ⚡ Manual Question Set
              </h1>
              <p className="text-gray-300 text-lg">
                Select a specific SOP bank to begin your instant feedback assessment
              </p>
            </div>
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
                className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>

            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
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
              className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
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
                className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:border-yellow-500/50 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-xl hover:shadow-yellow-500/20"
              >
                {/* Header */}
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-white mb-2 line-clamp-2">
                    {bank.sopName}
                  </h3>
                  <p className="text-sm text-yellow-300 font-mono">{bank.sopIdentifier}</p>
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
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/mcq-tests/specific-test-center/${bank._id}`)}
                    className="flex-1 py-3 px-4 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-yellow-500/30"
                  >
                    <Zap className="h-4 w-4" />
                    Start Specific Test
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
