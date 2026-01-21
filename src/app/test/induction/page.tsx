'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  GraduationCap, 
  ArrowLeft, 
  Loader2, 
  ChevronRight, 
  CheckCircle2, 
  BrainCircuit, 
  Filter,
  BarChart3,
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

export default function InductionTestPage() {
  const router = useRouter();
  const [basis, setBasis] = useState<'selection' | 'ai' | 'manual'>('selection');
  const [step, setStep] = useState<'selection' | 'difficulty' | 'criteria' | 'ready' | 'testing'>('selection');
  
  // Selection State
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard' | 'Any'>('Any');
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [questionCount, setQuestionCount] = useState(20);
  
  // Data State
  const [departments, setDepartments] = useState<string[]>([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);

  useEffect(() => {
    if (step === 'criteria' || step === 'ready') {
      fetchDepartments();
    }
  }, [step]);

  const fetchDepartments = async () => {
    setLoadingDepartments(true);
    try {
      const response = await fetch('/api/departments');
      const data = await response.json();
      if (data.success) {
        setDepartments(data.departments);
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
    } finally {
      setLoadingDepartments(false);
    }
  };

  const handleStartTest = async () => {
    if (selectedDepartments.length === 0) {
      alert('Please select at least one department');
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch('/api/test/induction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          mode: basis,
          difficulty: difficulty,
          departments: selectedDepartments,
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
      console.error('Error starting induction test:', error);
      alert('An error occurred.');
    } finally {
      setGenerating(false);
    }
  };

  const toggleDepartment = (dept: string) => {
    if (selectedDepartments.includes(dept)) {
      setSelectedDepartments(selectedDepartments.filter(d => d !== dept));
    } else {
      if (selectedDepartments.length < 2) {
        setSelectedDepartments([...selectedDepartments, dept]);
      } else {
        alert('Maximum 2 departments allowed for induction training');
      }
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
            title="Induction Test Configuration" 
            onSelect={(type) => {
              setBasis(type);
              if (type === 'ai') {
                setStep('ready'); // AI mode also needs department selection now
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
            <div className="bg-purple-500/20 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-purple-500/30">
              <BarChart3 className="h-10 w-10 text-purple-400" />
            </div>
            <h2 className="text-4xl font-bold text-white mb-4">Select Difficulty Level</h2>
            <p className="text-gray-400 mb-10">Choose the complexity level for the new employee induction test.</p>
            
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
                      ? 'bg-purple-600/30 border-purple-500 shadow-lg' 
                      : 'bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/[0.08]'
                  }`}
                >
                  <div className="flex flex-col items-start px-2">
                    <span className="text-2xl font-bold text-white mb-1">{level}</span>
                    <span className="text-gray-500 text-sm">
                      {level === 'Any' ? 'Standard competency mix' : `${level} level orientation`}
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

  if (step === 'criteria' || step === 'ready') {
    return (
      <div className="min-h-screen bg-slate-900 p-8">
        <div className="max-w-4xl mx-auto">
           <button
            onClick={() => step === 'criteria' ? setStep('difficulty') : setStep('selection')}
            className="mb-8 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all flex items-center gap-2 border border-white/10"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-10 border border-white/20 shadow-2xl relative overflow-hidden">
            {step === 'ready' && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 animate-pulse"></div>}
            
            <div className="flex items-center gap-4 mb-8">
              <div className="bg-purple-500/20 p-4 rounded-xl border border-purple-500/30">
                {step === 'ready' ? <BrainCircuit className="h-8 w-8 text-purple-400" /> : <Filter className="h-8 w-8 text-purple-400" />}
              </div>
              <div>
                <h2 className="text-3xl font-bold text-white">{step === 'ready' ? 'AI Induction' : 'Manual Induction'} Configuration</h2>
                <p className="text-gray-400">Select target departments for induction training (Max 2).</p>
              </div>
            </div>

            <div className="space-y-8">
              <div>
                <label className="block text-white font-semibold mb-4 text-lg">Select Departments</label>
                {loadingDepartments ? (
                  <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 text-purple-500 animate-spin" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                    {departments.map((dept) => (
                      <div
                        key={dept}
                        onClick={() => toggleDepartment(dept)}
                        className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 flex items-center justify-between group ${
                          selectedDepartments.includes(dept)
                            ? 'bg-purple-600/30 border-purple-500 shadow-lg'
                            : 'bg-white/5 border-white/10 hover:border-purple-500/50'
                        }`}
                      >
                        <div>
                          <p className="text-white font-medium group-hover:text-purple-300 transition-colors">{dept}</p>
                          <p className="text-gray-500 text-xs mt-1">Include all SOPs from this department</p>
                        </div>
                        <div className={`w-5 h-5 rounded border transition-all flex items-center justify-center ${
                           selectedDepartments.includes(dept) ? 'bg-purple-500 border-purple-500' : 'border-white/20'
                        }`}>
                          {selectedDepartments.includes(dept) && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
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
                      className="w-full accent-purple-500 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between mt-2 text-xs text-gray-500 font-mono">
                      <span>5</span>
                      <span>25</span>
                      <span>50</span>
                    </div>
                  </div>
                  <div className="ml-10 text-center">
                    <div className="text-4xl font-black text-purple-400">{questionCount}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Total MCQs</div>
                  </div>
                </div>

                <div className="mb-6 flex gap-4">
                  <div className="flex-1 p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Method</div>
                    <div className="text-white font-semibold">{basis === 'ai' ? 'AI Automated' : 'Manual Targeting'}</div>
                  </div>
                  <div className="flex-1 p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Selected</div>
                    <div className="text-white font-semibold">{selectedDepartments.length} / 2 Depts</div>
                  </div>
                </div>

                <button
                  onClick={handleStartTest}
                  disabled={selectedDepartments.length === 0 || generating}
                  className={`w-full py-5 text-white font-black text-xl rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-2xl flex items-center justify-center gap-3 ${
                    basis === 'ai' 
                      ? 'bg-gradient-to-r from-purple-600 via-pink-600 to-purple-700 shadow-purple-500/20' 
                      : 'bg-gradient-to-r from-purple-600 to-pink-600'
                  }`}
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin" />
                      {basis === 'ai' ? 'AI Analyzing...' : 'Gathering MCQs...'}
                    </>
                  ) : (
                    <>
                      {basis === 'ai' ? 'Start AI Induction' : 'Start Manual Induction'}
                      <BookOpen className="h-6 w-6" />
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
        title={`Induction Training Test (${basis.toUpperCase()})`}
        onExit={() => setStep('selection')} 
      />
    );
  }

  return null;
}
