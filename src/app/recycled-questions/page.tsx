'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search, ArrowLeft, Loader2, Trash2, FolderOpen,
  ChevronDown, ChevronRight, User, Calendar, AlertCircle
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { formatSOPDisplayName } from '@/lib/sopLibraryHelper';

interface EliminatedQuestion {
  _id: string;
  sopId: string;
  sopName: string;
  sopIdentifier: string;
  question: any;
  originalQuestionIndex?: number;
  eliminationReason: string;
  eliminatedAt: string;
  eliminatedBy?: string;
  replacedWith?: string;
}

interface GroupedBySOP {
  sopId: string;
  sopName: string;
  sopIdentifier: string;
  department: string;
  questions: EliminatedQuestion[];
  totalQuestions: number;
}

export default function RecycledQuestionsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [groupedBySOP, setGroupedBySOP] = useState<GroupedBySOP[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSOPs, setExpandedSOPs] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState({ total: 0, byDepartment: {} as Record<string, number> });

  useEffect(() => {
    fetchRecycledQuestions();
  }, []);

  const fetchRecycledQuestions = async () => {
    try {
      setLoading(true);
      // Only fetch questions eliminated due to similarity (duplicate reason)
      // This excludes review center eliminations
      const response = await fetch('/api/mcq-bank/eliminated?grouped=true&limit=1000&source=similarity');
      const data = await response.json();

      if (data.success) {
        setGroupedBySOP(data.groupedBySOP);
        
        // Calculate stats
        const total = data.groupedBySOP.reduce((sum: number, group: GroupedBySOP) => sum + group.totalQuestions, 0);
        const byDept: Record<string, number> = {};
        data.groupedBySOP.forEach((group: GroupedBySOP) => {
          byDept[group.department] = (byDept[group.department] || 0) + group.totalQuestions;
        });
        
        setStats({ total, byDepartment: byDept });
      }
    } catch (error) {
      console.error('Error fetching recycled questions:', error);
    } finally {
      setLoading(false);
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

  const filteredGroups = groupedBySOP.filter(group => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      group.sopName.toLowerCase().includes(search) ||
      group.sopIdentifier.toLowerCase().includes(search) ||
      group.department.toLowerCase().includes(search)
    );
  });

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy': return 'bg-green-500/20 text-green-300 border-green-500';
      case 'Medium': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500';
      case 'Hard': return 'bg-red-500/20 text-red-300 border-red-500';
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <PageHeader
        title="Similar Questions - Eliminated"
        subtitle="Questions removed due to similarity/duplicates from Similar Questions workflow"
        icon={Trash2}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
          >
            <ArrowLeft className="h-5 w-5" />
            Back
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-16">
            <Loader2 className="h-12 w-12 text-purple-400 animate-spin" />
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">Total Recycled</p>
                    <p className="text-3xl font-bold text-red-400">{stats.total}</p>
                  </div>
                  <Trash2 className="h-12 w-12 text-red-400" />
                </div>
              </div>

              {Object.entries(stats.byDepartment).slice(0, 3).map(([dept, count]) => (
                <div key={dept} className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm">{dept} Department</p>
                      <p className="text-3xl font-bold text-orange-400">{count}</p>
                    </div>
                    <FolderOpen className="h-12 w-12 text-orange-400" />
                  </div>
                </div>
              ))}
            </div>

            {/* Search */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-white/20 mb-8">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by SOP name, identifier, or department..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Grouped by SOP */}
            {filteredGroups.length === 0 ? (
              <div className="text-center py-16">
                <Trash2 className="h-16 w-16 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400 text-xl">
                  {searchTerm ? 'No matching recycled questions found' : 'No recycled questions yet'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredGroups.map((group) => (
                  <div
                    key={group.sopIdentifier}
                    className="bg-white/10 backdrop-blur-lg rounded-2xl border border-red-500/20 overflow-hidden"
                  >
                    {/* SOP Header */}
                    <button
                      onClick={() => toggleSOPExpansion(group.sopIdentifier)}
                      className="w-full p-6 flex items-center justify-between hover:bg-white/5 transition-all"
                    >
                      <div className="flex items-center gap-4">
                        {expandedSOPs.has(group.sopIdentifier) ? (
                          <ChevronDown className="h-6 w-6 text-red-400" />
                        ) : (
                          <ChevronRight className="h-6 w-6 text-red-400" />
                        )}
                        <Trash2 className="h-6 w-6 text-red-400" />
                        <div className="text-left">
                          <h3 className="text-lg font-bold text-white">
                            {formatSOPDisplayName(group.sopName, group.sopIdentifier)}
                          </h3>
                          <p className="text-sm text-gray-400">
                            {group.department} • {group.totalQuestions} recycled question{group.totalQuestions !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <span className="px-4 py-2 bg-red-600/20 text-red-300 rounded-lg font-bold border border-red-500/30">
                        {group.totalQuestions}
                      </span>
                    </button>

                    {/* Expanded Questions */}
                    {expandedSOPs.has(group.sopIdentifier) && (
                      <div className="p-6 pt-0 space-y-4">
                        {group.questions.map((elim, idx) => (
                          <div
                            key={idx}
                            className="bg-white/5 rounded-xl p-5 border border-red-500/20"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-start flex-1 pr-4">
                                <span className="flex items-center justify-center min-w-[2rem] h-8 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 font-mono text-xs mr-4 flex-shrink-0 px-2">
                                  {typeof elim.originalQuestionIndex === 'number' ? `Q${elim.originalQuestionIndex + 1}` : 
                                   typeof (elim as any).originalIndex === 'number' ? `Q${(elim as any).originalIndex + 1}` : 
                                   <Trash2 className="h-4 w-4" />}
                                </span>
                                <div className="flex-1">
                                  <h3 className="text-gray-400 font-semibold mb-1 line-through">
                                    {elim.question.question}
                                  </h3>
                                  <div className="flex flex-wrap gap-2 mb-2">
                                    <span className="text-xs px-2 py-0.5 rounded bg-red-900/30 text-red-300 border border-red-500/20 flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {new Date(elim.eliminatedAt).toLocaleDateString()} at {new Date(elim.eliminatedAt).toLocaleTimeString()}
                                    </span>
                                    {elim.eliminatedBy && elim.eliminatedBy !== 'Unknown User' && (
                                      <span className="text-xs px-2 py-0.5 rounded bg-purple-900/30 text-purple-300 border border-purple-500/20 flex items-center gap-1">
                                        <User className="h-3 w-3" />
                                        Deleted by: {elim.eliminatedBy}
                                      </span>
                                    )}
                                    <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300 border border-gray-600 flex items-center gap-1">
                                      <AlertCircle className="h-3 w-3" />
                                      {elim.eliminationReason === 'manual' ? 'Manually Deleted' : elim.eliminationReason}
                                    </span>
                                    {elim.question.difficulty && (
                                      <span className={`text-xs px-2 py-0.5 rounded border ${getDifficultyColor(elim.question.difficulty)}`}>
                                        {elim.question.difficultyStars} {elim.question.difficulty}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2 mt-4 pl-12 border-l-2 border-red-500/10 ml-4">
                              {elim.question.options?.map((opt: string, optIdx: number) => (
                                <div
                                  key={optIdx}
                                  className={`text-sm p-2 rounded ${
                                    opt === elim.question.correctAnswer
                                      ? 'bg-green-900/10 text-green-400 border border-green-500/20'
                                      : 'text-gray-500 bg-white/5'
                                  }`}
                                >
                                  {opt} {opt === elim.question.correctAnswer && '✓'}
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
          </>
        )}
      </div>
    </div>
  );
}
