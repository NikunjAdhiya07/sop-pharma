'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Filter, Download, Eye, BookOpen, Award, Loader2, Plus, Trash2, FolderOpen, Upload } from 'lucide-react';

interface MCQ {
  aiIcon: string;
  question: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  difficultyStars: '⭐' | '⭐⭐' | '⭐⭐⭐';
  options: string[];
  correctAnswer: string;
  explanation: string;
  sopReference: string;
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
  totalQuestions: number;
  difficultyDistribution: {
    easy: number;
    medium: number;
    hard: number;
  };
  createdAt: string;
}

export default function MCQBankPage() {
  const [mcqBanks, setMcqBanks] = useState<MCQBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingMore, setGeneratingMore] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('All');
  const [selectedMCQBank, setSelectedMCQBank] = useState<MCQBank | null>(null);
  const [selectedMCQ, setSelectedMCQ] = useState<{mcq: MCQ, index: number} | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalBanks, setTotalBanks] = useState(0);

  useEffect(() => {
    fetchMCQBanks();
  }, [currentPage]);

  const fetchMCQBanks = async () => {
    try {
      // Fetch all MCQ banks with a high limit to show everything
      const response = await fetch(`/api/mcq-bank?limit=1000&page=${currentPage}`);
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

  const filteredMCQBanks = mcqBanks.filter(bank =>
    bank.sopName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bank.sopIdentifier.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1 text-center">
              <h1 className="text-5xl font-bold text-white mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                MCQ Question Bank
              </h1>
              <p className="text-gray-300 text-lg">
                Browse and manage your generated MCQ banks {totalBanks > 0 && `(${totalBanks} total)`}
              </p>
            </div>
            <div className="flex gap-3">
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
          </div>
        </div>

        {/* Search and Filter */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-white/20 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
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
            <div className="flex gap-2">
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
          </div>
        </div>

        {/* MCQ Banks Grid */}
        {filteredMCQBanks.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="h-16 w-16 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-400 text-xl">No MCQ banks found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMCQBanks.map((bank) => (
              <div
                key={bank._id}
                className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-xl border border-white/20 hover:border-purple-500/50 transition-all duration-300 transform hover:scale-[1.02]"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white mb-2">
                      {bank.sopName}
                    </h3>
                    <p className="text-gray-400 text-sm font-mono">
                      {bank.sopIdentifier}
                    </p>
                  </div>
                  <Award className="h-6 w-6 text-purple-400" />
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">Total Questions:</span>
                    <span className="text-white font-bold">{bank.totalQuestions}</span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-green-300 text-sm">Easy:</span>
                      <span className="text-white font-semibold">{bank.difficultyDistribution.easy}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-yellow-300 text-sm">Medium:</span>
                      <span className="text-white font-semibold">{bank.difficultyDistribution.medium}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-red-300 text-sm">Hard:</span>
                      <span className="text-white font-semibold">{bank.difficultyDistribution.hard}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedMCQBank(bank)}
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

        {/* Pagination and Summary */}
        {filteredMCQBanks.length > 0 && (
          <div className="mt-8 bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-white/20">
            <div className="flex items-center justify-between">
              <div className="text-gray-300">
                Showing <span className="text-white font-semibold">{filteredMCQBanks.length}</span> of{' '}
                <span className="text-white font-semibold">{totalBanks}</span> MCQ Bank(s)
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
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-purple-500/30">
              <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 p-6 rounded-t-2xl z-10">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">
                      {selectedMCQBank.sopName}
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
                {selectedMCQBank.mcqs
                  .filter(mcq => difficultyFilter === 'All' || mcq.difficulty === difficultyFilter)
                  .map((mcq, index) => (
                    <div
                      key={index}
                      className="bg-white/5 rounded-xl p-5 border border-white/10 hover:border-purple-500/30 transition-all cursor-pointer"
                      onClick={() => setSelectedMCQ({mcq, index})}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-start flex-1 pr-4">
                          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-purple-300 font-mono text-xs mr-4 flex-shrink-0">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span className="text-2xl mr-3">{mcq.aiIcon}</span>
                          <h3 className="text-white font-semibold">
                            {mcq.question}
                          </h3>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border whitespace-nowrap ${getDifficultyColor(mcq.difficulty)}`}>
                          {mcq.difficultyStars} {mcq.difficulty}
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        {mcq.options.map((option, optIndex) => (
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
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* MCQ Detail Modal */}
        {selectedMCQ && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
            <div className="bg-slate-900 rounded-2xl max-w-3xl w-full border border-purple-500/30">
              <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-6 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">MCQ Details</h2>
                  <button
                    onClick={() => setSelectedMCQ(null)}
                    className="text-white hover:text-gray-200 text-2xl font-bold"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                 <div className="flex items-start">
                  <span className="text-4xl mr-4">{selectedMCQ.mcq.aiIcon}</span>
                  <div>
                    <h3 className="text-white font-bold text-lg mb-2">Question {String(selectedMCQ.index + 1).padStart(2, '0')}:</h3>
                    <p className="text-gray-300 text-xl">{selectedMCQ.mcq.question}</p>
                    <div className="mt-2">
                       <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getDifficultyColor(selectedMCQ.mcq.difficulty)}`}>
                        {selectedMCQ.mcq.difficultyStars} {selectedMCQ.mcq.difficulty}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-white font-bold mb-3">Options:</h3>
                  <div className="space-y-2">
                    {selectedMCQ.mcq.options.map((option, index) => (
                      <div
                        key={index}
                        className={`p-4 rounded-lg ${
                          option === selectedMCQ.mcq.correctAnswer
                            ? 'bg-green-500/20 border-2 border-green-500'
                            : 'bg-white/5 border border-white/10'
                        }`}
                      >
                        <span className="text-gray-300">{option}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-white font-bold mb-2">Explanation:</h3>
                  <p className="text-gray-300 bg-white/5 p-4 rounded-lg">
                    {selectedMCQ.mcq.explanation}
                  </p>
                </div>

                <div>
                  <h3 className="text-white font-bold mb-2">SOP Reference:</h3>
                  <p className="text-gray-400 bg-white/5 p-4 rounded-lg italic text-sm">
                    "{selectedMCQ.mcq.sopReference}"
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
