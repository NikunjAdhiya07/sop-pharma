'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { 
  AlertTriangle, 
  ArrowLeft, 
  Loader2, 
  ChevronRight, 
  CheckCircle2, 
  BrainCircuit, 
  Filter,
  BarChart3,
  ShieldAlert,
  FileText,
  Settings2,
  BookOpen
} from 'lucide-react';
import QuestionBasisSelection from '@/components/QuestionBasisSelection';
import TestRunner from '@/components/TestRunner';

interface MCQBank {
  _id: string;
  sopId: string;
  sopName: string;
  sopIdentifier: string;
}

export default function KapaTestPage() {
  useAuthGuard();
  const router = useRouter();
  const [basis, setBasis] = useState<'selection' | 'ai' | 'manual'>('selection');
  const [step, setStep] = useState<'selection' | 'criteria' | 'testing'>('selection');
  
  // Selection State
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard' | 'Any'>('Any');
  const [selectedSopId, setSelectedSopId] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(20);
  
  // Data State
  const [banks, setBanks] = useState<MCQBank[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);

  useEffect(() => {
    if (step === 'criteria') {
      fetchBanks();
    }
  }, [step]);

  const fetchBanks = async () => {
    setLoadingBanks(true);
    try {
      const response = await fetch('/api/mcq-bank?limit=100');
      const data = await response.json();
      if (data.success) {
        setBanks(data.mcqBanks);
      }
    } catch (error) {
      console.error('Error fetching banks:', error);
    } finally {
      setLoadingBanks(false);
    }
  };

  const handleStartTest = async () => {
    if (!selectedSopId) {
      alert('Please select an SOP for KAPA retraining');
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch('/api/test/kapa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          mode: basis,
          difficulty: difficulty,
          sopId: selectedSopId,
          questionCount
        }),
      });

      const data = await response.json();
      if (data.success) {
        setQuestions(data.questions);
        setStep('testing');
      } else {
        alert(data.error || 'Failed to generate test');
      }
    } catch (error) {
      console.error('Error starting KAPA test:', error);
      alert('An error occurred.');
    } finally {
      setGenerating(false);
    }
  };

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
            title="KAPA / Incident Test Configuration" 
            onSelect={(type) => {
              setBasis(type);
              setStep('criteria'); // Both modes need SOP selection first
            }} 
          />
        </div>
      </div>
    );
  }

  if (step === 'criteria') {
    return (
      <div className="min-h-screen bg-slate-900 p-8">
        <div className="max-w-4xl mx-auto">
           <button
            onClick={() => setStep('selection')}
            className="mb-8 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all flex items-center gap-2 border border-white/10"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Mode Selection
          </button>

          <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-10 border border-white/20 shadow-2xl relative overflow-hidden">
             {basis === 'ai' && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-rose-500 to-red-500 animate-pulse"></div>}
            
            <div className="flex items-center gap-4 mb-8">
              <div className="bg-red-500/20 p-4 rounded-xl border border-red-500/30">
                {basis === 'ai' ? <BrainCircuit className="h-8 w-8 text-red-400" /> : <Filter className="h-8 w-8 text-red-400" />}
              </div>
              <div>
                <h2 className="text-3xl font-bold text-white">Targeted {basis.toUpperCase()} Retraining</h2>
                <p className="text-gray-400">Select the specific SOP involved in the incident for focused retraining.</p>
              </div>
            </div>

            <div className="space-y-8">
              {/* Difficulty Selection for Manual Mode */}
              {basis === 'manual' && (
                <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                  <label className="block text-white font-semibold mb-4 flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-red-400" /> Select Difficulty
                  </label>
                  <div className="grid grid-cols-4 gap-4">
                    {['Any', 'Easy', 'Medium', 'Hard'].map((level) => (
                      <button
                        key={level}
                        onClick={() => setDifficulty(level as any)}
                        className={`py-3 rounded-xl border transition-all ${
                          difficulty === level 
                            ? 'bg-red-600/30 border-red-500 text-white' 
                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-white font-semibold mb-4 text-lg flex items-center gap-2">
                  <FileText className="h-6 w-6 text-red-400" /> Select Incident SOP
                </label>
                {loadingBanks ? (
                  <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 text-red-500 animate-spin" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {banks.map((bank) => (
                      <div
                        key={bank._id}
                        onClick={() => setSelectedSopId(bank.sopId)}
                        className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 flex items-center justify-between group ${
                          selectedSopId === bank.sopId
                            ? 'bg-red-600/30 border-red-500 shadow-lg'
                            : 'bg-white/5 border-white/10 hover:border-red-500/50'
                        }`}
                      >
                        <div>
                          <p className="text-white font-medium group-hover:text-red-300 transition-colors line-clamp-1">{bank.sopName}</p>
                          <p className="text-gray-500 text-xs font-mono mt-1">{bank.sopIdentifier}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border transition-all flex items-center justify-center ${
                           selectedSopId === bank.sopId ? 'bg-red-500 border-red-500' : 'border-white/20'
                        }`}>
                          {selectedSopId === bank.sopId && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-white/10">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex-1">
                    <label className="block text-white font-semibold mb-2 flex items-center gap-2">
                      <Settings2 className="h-5 w-5 text-red-400" /> Retraining Intensity
                    </label>
                    <input 
                      type="range" min="10" max="40" step="5" value={questionCount}
                      onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                      className="w-full accent-red-500 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between mt-2 text-xs text-gray-500 font-mono">
                      <span>10</span>
                      <span>25</span>
                      <span>40</span>
                    </div>
                  </div>
                  <div className="ml-10 text-center">
                    <div className="text-4xl font-black text-red-400">{questionCount}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Total MCQs</div>
                  </div>
                </div>

                <button
                  onClick={handleStartTest}
                  disabled={!selectedSopId || generating}
                  className={`w-full py-5 text-white font-black text-xl rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-2xl flex items-center justify-center gap-3 ${
                    basis === 'ai' 
                      ? 'bg-gradient-to-r from-red-600 via-rose-600 to-red-700 shadow-red-500/20' 
                      : 'bg-gradient-to-r from-red-600 to-rose-600'
                  }`}
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin" />
                      {basis === 'ai' ? 'AI Analyzing Incident...' : 'Gathering MCQs...'}
                    </>
                  ) : (
                    <>
                      {basis === 'ai' ? 'Start AI Retraining' : 'Start Manual Retraining'}
                      <ShieldAlert className="h-6 w-6" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }



  if (step === 'testing') {
    return (
      <TestRunner 
        questions={questions} 
        title={`KAPA / Incident Training (${basis.toUpperCase()})`}
        onExit={() => setStep('selection')} 
      />
    );
  }

  return null;
}
