'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  ArrowLeft,
  Zap,
  Search,
  CheckCircle2,
  Play,
  Loader2,
  ChevronRight,
  Filter,
  Info,
} from 'lucide-react';
import QuestionBasisSelection from '@/components/QuestionBasisSelection';

interface MCQBank {
  _id: string;
  sopName: string;
  sopIdentifier: string;
  totalQuestions: number;
  department: string;
}

export default function SpecificTrainingTestPage() {
  const router = useRouter();
  const [step, setStep] = useState<'selection' | 'manual-sop-list' | 'ai-ready'>('selection');
  const [basis, setBasis] = useState<'ai' | 'manual'>('ai');
  const [mcqBanks, setMcqBanks] = useState<MCQBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);
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

  const toggleBankSelection = (id: string) => {
    setSelectedBankIds(prev => 
      prev.includes(id) 
        ? prev.filter(bankId => bankId !== id)
        : [...prev, id]
    );
  };

  const filteredBanks = mcqBanks.filter(bank => 
    bank.sopName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bank.sopIdentifier.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-white text-xl font-medium">Loading Specific Training Test Center...</p>
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
              onClick={() => router.push('/test')}
              className="mb-8 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all flex items-center gap-2 border border-white/10"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Test Center
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
        <div className="min-h-screen bg-slate-900 p-8 flex items-center justify-center">
          <div className="max-w-2xl w-full">
             <button
              onClick={() => setStep('selection')}
              className="mb-8 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all flex items-center gap-2 border border-white/10"
            >
              <ArrowLeft className="h-4 w-4" /> Change Mode
            </button>
            
            <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-12 border border-white/20 text-center shadow-2xl relative overflow-hidden">
              <div className="bg-yellow-500/20 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 border border-yellow-500/30">
                <Zap className="h-12 w-12 text-yellow-400" />
              </div>
              
              <h2 className="text-4xl font-black text-white mb-4">AI Specific Assessment</h2>
              <p className="text-gray-400 text-lg mb-10 leading-relaxed">
                Gemini will curate <span className="text-yellow-400 font-bold">10 high-impact questions</span> for a targeted proficiency check with <span className="text-yellow-400 font-bold">Instant Feedback</span>.
              </p>
              
              <button
                onClick={() => {
                    if (mcqBanks.length > 0) {
                        router.push(`/test/specific/${mcqBanks[0]._id}`);
                    }
                }}
                className="w-full py-5 bg-gradient-to-r from-yellow-600 to-orange-600 text-white font-black text-xl rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-2xl flex items-center justify-center gap-3"
              >
                Begin AI Specific Test
                <Play className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      );
  }

  // STEP 2 (Manual): manual SOP List - Multi Selection with Tooltips
  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
         <button
          onClick={() => setStep('selection')}
          className="mb-8 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all flex items-center gap-2 border border-white/10"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Mode Selection
        </button>

        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-10 border border-white/20 shadow-2xl">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="bg-yellow-500/20 p-4 rounded-xl border border-yellow-500/30">
                <Filter className="h-8 w-8 text-yellow-400" />
              </div>
              <div>
                <h2 className="text-3xl font-bold text-white">Select Targeted SOPs</h2>
                <p className="text-gray-400">Choose one or more SOPs for instant feedback assessment.</p>
              </div>
            </div>
            {selectedBankIds.length > 0 && (
              <div className="bg-yellow-500 text-slate-900 px-4 py-2 rounded-full font-bold text-sm animate-in zoom-in duration-300 shadow-lg shadow-yellow-500/20">
                {selectedBankIds.length} Selected
              </div>
            )}
          </div>

          <div className="space-y-8">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-500" />
              <input
                type="text"
                placeholder="Search SOP by name or identifier..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {filteredBanks.map((bank) => (
                <div
                  key={bank._id}
                  onClick={() => toggleBankSelection(bank._id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 flex items-center justify-between group relative ${
                    selectedBankIds.includes(bank._id)
                      ? 'bg-yellow-600/30 border-yellow-500 shadow-lg'
                      : 'bg-white/5 border-white/10 hover:border-yellow-500/50'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="relative">
                      <p className="text-white font-medium group-hover:text-yellow-300 transition-colors truncate">
                        {bank.sopName}
                      </p>
                      {/* Tooltip on hover */}
                      <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <div className="bg-slate-800 text-white text-xs p-3 rounded-lg border border-white/10 shadow-2xl max-w-[250px] leading-relaxed">
                          <p className="font-bold text-yellow-500 mb-1">{bank.sopIdentifier}</p>
                          {bank.sopName}
                        </div>
                        <div className="w-2 h-2 bg-slate-800 rotate-45 border-r border-b border-white/10 ml-4 -mt-1"></div>
                      </div>
                    </div>
                    <p className="text-gray-500 text-xs font-mono mt-1">{bank.sopIdentifier}</p>
                  </div>
                  <div className={`shrink-0 w-6 h-6 rounded-lg border-2 transition-all flex items-center justify-center ${
                     selectedBankIds.includes(bank._id) ? 'bg-yellow-500 border-yellow-500' : 'border-white/20'
                  }`}>
                    {selectedBankIds.includes(bank._id) && <CheckCircle2 className="h-4 w-4 text-white" />}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-6 border-t border-white/10 flex flex-col gap-4">
              <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl">
                 <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                 <p className="text-blue-300 text-xs">
                   You are starting a <strong>Combined Specific Test</strong>. Questions from all selected SOPs will be shuffled into a single session with instant feedback.
                 </p>
              </div>

              <button
                onClick={() => {
                  if (selectedBankIds.length > 0) {
                    const idsStr = selectedBankIds.join(',');
                    router.push(`/test/specific/${idsStr}`);
                  }
                }}
                disabled={selectedBankIds.length === 0}
                className="w-full py-4 bg-gradient-to-r from-yellow-600 to-orange-600 text-white font-bold rounded-2xl hover:brightness-110 active:scale-95 transition-all shadow-xl disabled:opacity-50 flex items-center justify-center gap-2"
              >
                Start Multi-SOP Assessment <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
