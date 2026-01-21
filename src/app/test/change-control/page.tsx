'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Settings2, 
  ArrowLeft, 
  Loader2, 
  ChevronRight, 
  CheckCircle2, 
  BrainCircuit, 
  Filter,
  BarChart3,
  FileCheck
} from 'lucide-react';
import QuestionBasisSelection from '@/components/QuestionBasisSelection';
import TestRunner from '@/components/TestRunner';

interface MCQBank {
  _id: string;
  sopId: string;
  sopName: string;
  sopIdentifier: string;
}

export default function ChangeControlTestPage() {
  const router = useRouter();
  const [basis, setBasis] = useState<'selection' | 'ai' | 'manual'>('selection');
  const [step, setStep] = useState<'selection' | 'difficulty' | 'criteria' | 'ready' | 'testing'>('selection');
  
  // Selection State
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard' | 'Any'>('Any');
  const [selectedSopIds, setSelectedSopIds] = useState<string[]>([]);
  const [questionCount, setQuestionCount] = useState(20);
  
  // Data State
  const [banks, setBanks] = useState<MCQBank[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);

  useEffect(() => {
    if (basis === 'manual' && step === 'criteria') {
      fetchBanks();
    }
  }, [basis, step]);

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
    setGenerating(true);
    try {
      const response = await fetch('/api/test/change-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          mode: basis,
          difficulty: difficulty,
          sopIds: selectedSopIds,
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
      console.error('Error starting change control test:', error);
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
            title="Change Control Test Configuration" 
            onSelect={(type) => {
              setBasis(type);
              if (type === 'ai') {
                setStep('ready');
              } else {
                setStep('difficulty');
              }
            }} 
          />
        </div>
      </div>
    );
  }

  if (step === 'difficulty') {
    return (
      <div className="min-h-screen bg-slate-900 p-8 flex items-center justify-center">
        <div className="max-w-4xl w-full">
           <button
            onClick={() => setStep('selection')}
            className="mb-8 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all flex items-center gap-2 border border-white/10"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Mode Selection
          </button>
          
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-10 border border-white/20 text-center shadow-2xl">
            <div className="bg-orange-500/20 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-orange-500/30">
              <BarChart3 className="h-10 w-10 text-orange-400" />
            </div>
            <h2 className="text-4xl font-bold text-white mb-4">Select Difficulty Level</h2>
            <p className="text-gray-400 mb-10">Target specific competence levels for the change control assessment.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
              {['Easy', 'Medium', 'Hard', 'Any'].map((level) => (
                <button
                  key={level}
                  onClick={() => {
                    setDifficulty(level as any);
                    setStep('criteria');
                  }}
                  className={`p-6 rounded-2xl border-2 transition-all flex items-center justify-between group ${
                    difficulty === level 
                      ? 'bg-orange-600/30 border-orange-500 shadow-lg' 
                      : 'bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/[0.08]'
                  }`}
                >
                  <div className="flex flex-col items-start px-2">
                    <span className="text-2xl font-bold text-white mb-1">{level}</span>
                    <span className="text-gray-500 text-sm">
                      {level === 'Any' ? 'Balanced change impact' : `${level} level change review`}
                    </span>
                  </div>
                  <ChevronRight className="h-6 w-6 text-gray-500 group-hover:text-white transition-all group-hover:translate-x-1" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'criteria') {
    return (
      <div className="min-h-screen bg-slate-900 p-8">
        <div className="max-w-4xl mx-auto">
           <button
            onClick={() => setStep('difficulty')}
            className="mb-8 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all flex items-center gap-2 border border-white/10"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Difficulty
          </button>

          <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-10 border border-white/20 shadow-2xl">
            <div className="flex items-center gap-4 mb-8">
              <div className="bg-orange-500/20 p-4 rounded-xl border border-orange-500/30">
                <Filter className="h-8 w-8 text-orange-400" />
              </div>
              <div>
                <h2 className="text-3xl font-bold text-white">Change Control Criteria</h2>
                <p className="text-gray-400">Select SOPs affected by recent changes for assessment.</p>
              </div>
            </div>

            <div className="space-y-8">
              <div>
                <label className="block text-white font-semibold mb-4 text-lg">Select Modified SOPs</label>
                {loadingBanks ? (
                  <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                    {banks.map((bank) => (
                      <div
                        key={bank._id}
                        onClick={() => {
                          if (selectedSopIds.includes(bank.sopId)) {
                            setSelectedSopIds(selectedSopIds.filter(id => id !== bank.sopId));
                          } else {
                            setSelectedSopIds([...selectedSopIds, bank.sopId]);
                          }
                        }}
                        className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 flex items-center justify-between group ${
                          selectedSopIds.includes(bank.sopId)
                            ? 'bg-orange-600/30 border-orange-500 shadow-lg'
                            : 'bg-white/5 border-white/10 hover:border-orange-500/50'
                        }`}
                      >
                        <div>
                          <p className="text-white font-medium group-hover:text-orange-300 transition-colors line-clamp-1">{bank.sopName}</p>
                          <p className="text-gray-500 text-xs font-mono mt-1">{bank.sopIdentifier}</p>
                        </div>
                        <div className={`w-5 h-5 rounded border transition-all flex items-center justify-center ${
                           selectedSopIds.includes(bank.sopId) ? 'bg-orange-500 border-orange-500' : 'border-white/20'
                        }`}>
                          {selectedSopIds.includes(bank.sopId) && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-white/10">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex-1">
                    <label className="block text-white font-semibold mb-2">Number of Questions</label>
                    <input 
                      type="range" min="5" max="50" step="5" value={questionCount}
                      onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                      className="w-full accent-orange-500 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between mt-2 text-xs text-gray-500 font-mono">
                      <span>5</span>
                      <span>25</span>
                      <span>50</span>
                    </div>
                  </div>
                  <div className="ml-10 text-center">
                    <div className="text-4xl font-black text-orange-400">{questionCount}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Total MCQs</div>
                  </div>
                </div>

                <button
                  onClick={handleStartTest}
                  disabled={selectedSopIds.length === 0 || generating}
                  className="w-full py-4 bg-gradient-to-r from-orange-600 to-amber-600 text-white font-bold rounded-2xl hover:brightness-110 active:scale-95 transition-all shadow-xl flex items-center justify-center gap-2"
                >
                  {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Generate Change Test <ChevronRight className="h-5 w-5" /></>}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'ready') {
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
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 animate-pulse"></div>
            
            <div className="bg-orange-500/20 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 border border-orange-500/30 animate-in zoom-in-50 duration-500">
              <Settings2 className="h-12 w-12 text-orange-400" />
            </div>
            
            <h2 className="text-4xl font-black text-white mb-4">AI Change Control Ready</h2>
            <p className="text-gray-400 text-lg mb-10 leading-relaxed">
              Gemini will automatically evaluate modified procedures and generate <span className="text-orange-400 font-bold">20 critical questions</span> regarding the system updates.
            </p>
            
            <div className="grid grid-cols-2 gap-4 mb-10 text-left">
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Impact</div>
                <div className="text-white font-semibold">Change Impact</div>
              </div>
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Verify</div>
                <div className="text-white font-semibold">Modifications</div>
              </div>
            </div>

            <button
              onClick={handleStartTest}
              disabled={generating}
              className="w-full py-5 bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 text-white font-black text-xl rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-orange-500/20 flex items-center justify-center gap-3"
            >
              {generating ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" />
                  Analyzing Changes...
                </>
              ) : (
                <>
                  Start Change Review
                  <FileCheck className="h-6 w-6" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'testing') {
    return (
      <TestRunner 
        questions={questions} 
        title={`Change Control Training (${basis.toUpperCase()})`}
        onExit={() => setStep('selection')} 
      />
    );
  }

  return null;
}
