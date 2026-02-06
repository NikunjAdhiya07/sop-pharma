'use client';

import { useState, useEffect } from 'react';
import { 
  ClipboardCheck, 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  ArrowLeft, 
  RotateCcw, 
  Loader2, 
  Award, 
  Timer,
  Library,
  Star,
  ClipboardList
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface MCQ {
  _id?: string;
  sopId?: string;
  mcqBankId?: string;
  questionIndex?: number;
  sopName: string;
  sopIdentifier: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  sopReference: string;
  difficulty: string;
  aiIcon: string;
  difficultyStars?: string;
  optionVariants?: Array<{
    text: string;
    isCorrect: boolean;
  }>;
}

interface TestRunnerProps {
  questions: MCQ[];
  onComplete?: (score: number, total: number, answers?: any[], timeTaken?: number) => void;
  onExit: () => void;
  title: string;
}

export default function TestRunner({ questions, onComplete, onExit, title }: TestRunnerProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<'testing' | 'results'>('testing');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [resultsFilter, setResultsFilter] = useState<'all' | 'correct' | 'incorrect'>('all');
  const [testStartTime] = useState<number>(Date.now());
  const [testEndTime, setTestEndTime] = useState<number>(0);
  const [markedForReview, setMarkedForReview] = useState<Set<number>>(new Set());
  const [flaggingQuestion, setFlaggingQuestion] = useState(false);

  const handleToggleReview = async (questionIndex: number) => {
    const q = questions[questionIndex];
    
    // If already marked, just toggle locally (don't unflag from database)
    if (markedForReview.has(questionIndex)) {
      const newMarked = new Set(markedForReview);
      newMarked.delete(questionIndex);
      setMarkedForReview(newMarked);
      return;
    }

    // Mark for review and send to database
    const newMarked = new Set(markedForReview);
    newMarked.add(questionIndex);
    setMarkedForReview(newMarked);

    // Validate required fields before sending
    if (!q.mcqBankId || q.questionIndex === undefined || !q.sopName || !q.sopIdentifier) {
      console.error('❌ Cannot flag question: Missing metadata', {
        mcqBankId: q.mcqBankId,
        questionIndex: q.questionIndex,
        sopName: q.sopName,
        sopIdentifier: q.sopIdentifier
      });
      
      const revertMarked = new Set(markedForReview);
      revertMarked.delete(questionIndex);
      setMarkedForReview(revertMarked);
      alert('Cannot flag this question for review (Missing metadata). Please restart the test.');
      return;
    }

    // Send to API
    setFlaggingQuestion(true);
    try {
      const response = await fetch('/api/mcq-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcqBankId: q.mcqBankId,
          questionIndex: q.questionIndex,
          sopId: q._id || q.sopId || q.mcqBankId, // Try multiple sources for ID
          sopName: q.sopName,
          sopIdentifier: q.sopIdentifier,
          question: {
            aiIcon: q.aiIcon || '🔬',
            question: q.question,
            difficulty: q.difficulty || 'Medium',
            difficultyStars: q.difficultyStars || '⭐⭐',
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation || 'Refer to SOP.',
            sopReference: q.sopReference || 'Section N/A',
            optionVariants: q.optionVariants || q.options.map((opt: string) => ({
              text: opt,
              isCorrect: opt === q.correctAnswer
            }))
          },
          flaggedBy: 'Test User',
          reviewNotes: 'Flagged during test',
        }),
      });

      const data = await response.json();
      
      if (!data.success) {
        console.error('Failed to flag question:', data.error);
        if (data.error === 'Missing required fields') {
          console.error('Payload debug:', {
            mcqBankId: q.mcqBankId,
            questionIndex: q.questionIndex,
            sopId: q._id || q.sopId || q.mcqBankId,
            question: !!q.question
          });
        }
        
        // If already flagged, that's okay - keep it marked locally
        if (!data.error?.toLowerCase().includes('already flagged')) {
          const revertMarked = new Set(markedForReview);
          revertMarked.delete(questionIndex);
          setMarkedForReview(revertMarked);
          alert(`Failed to flag question: ${data.error}`);
        }
      }
    } catch (error) {
      console.error('Error flagging question:', error);
      // Remove from local state if API failed
      const revertMarked = new Set(markedForReview);
      revertMarked.delete(questionIndex);
      setMarkedForReview(revertMarked);
    } finally {
      setFlaggingQuestion(false);
    }
  };


  const handleOptionSelect = (option: string) => {
    setUserAnswers({
      ...userAnswers,
      [currentQuestionIndex]: option
    });
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      const endTime = Date.now();
      setTestEndTime(endTime);
      setCurrentStep('results');
      const score = calculateScore();
      
      const timeTaken = Math.floor((endTime - testStartTime) / 1000);
      
      // Prepare detailed answers for submission
      const detailedAnswers = questions.map((q, idx) => ({
        questionId: q._id || `q_${idx}`,
        question: q.question,
        selectedAnswer: userAnswers[idx] || '',
        correctAnswer: q.correctAnswer,
        isCorrect: userAnswers[idx] === q.correctAnswer,
        sopName: q.sopName,
        sopIdentifier: q.sopIdentifier,
        sopId: q.sopId || q._id // Fallback
      }));

      if (onComplete) {
         // @ts-ignore - Extending the callback signature dynamically
         onComplete(score, questions.length, detailedAnswers, timeTaken);
      }
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const calculateScore = () => {
    let score = 0;
    questions.forEach((q, idx) => {
      if (userAnswers[idx] === q.correctAnswer) {
        score++;
      }
    });
    return score;
  };

  const getDuration = () => {
    const seconds = Math.floor((testEndTime - testStartTime) / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // TESTING UI
  if (currentStep === 'testing') {
    const q = questions[currentQuestionIndex];
    const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

    return (
      <div className="min-h-screen bg-slate-900 p-8 flex flex-col animate-in fade-in duration-500">
        <div className="max-w-4xl mx-auto w-full flex-1">
          {/* Progress Header */}
          <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 mb-8 border border-white/10">
            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden shadow-inner mb-4">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-purple-400 font-mono text-xl font-bold">Question {currentQuestionIndex + 1}</span>
                <span className="text-gray-500">of {questions.length}</span>
              </div>
              <div className="bg-white/10 px-4 py-1.5 rounded-full flex items-center gap-2 text-gray-300 font-mono text-sm border border-white/5">
                <Timer className="h-4 w-4 text-purple-400" />
                <span>{Math.floor((Date.now() - testStartTime) / 1000)}s</span>
              </div>
            </div>
          </div>

          {/* Question Card */}
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-10 border border-white/20 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5">
              <ClipboardCheck className="h-32 w-32 text-white" />
            </div>

            <div className="mb-8 relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-bold uppercase tracking-wider">
                    {q.sopIdentifier}
                  </span>
                  <span className="px-3 py-1 bg-white/5 text-gray-400 border border-white/10 rounded-lg text-xs font-medium">
                    {q.sopName}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                    q.difficulty === 'Easy' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                    q.difficulty === 'Medium' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                    'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}>
                    {q.difficulty}
                  </span>
                </div>
                
                {/* Review Star Button */}
                <button
                  onClick={() => handleToggleReview(currentQuestionIndex)}
                  disabled={flaggingQuestion}
                  className={`relative z-20 p-2.5 rounded-xl border-2 transition-all duration-200 flex items-center gap-2 cursor-pointer ${
                    markedForReview.has(currentQuestionIndex)
                      ? 'bg-amber-500/20 border-amber-500 text-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.2)]'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:border-amber-500/50 hover:text-amber-400 hover:bg-amber-500/10'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  title={markedForReview.has(currentQuestionIndex) ? 'Marked for review' : 'Mark for review'}
                >
                  <Star 
                    className={`h-5 w-5 transition-all ${
                      markedForReview.has(currentQuestionIndex) ? 'fill-amber-400' : ''
                    }`} 
                  />
                  {markedForReview.has(currentQuestionIndex) && (
                    <span className="text-xs font-bold">Flagged</span>
                  )}
                </button>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                {q.question}
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 mb-10">
              {q.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => handleOptionSelect(option)}
                  className={`p-5 rounded-2xl border-2 text-left transition-all duration-200 group flex items-center justify-between ${
                    userAnswers[currentQuestionIndex] === option
                      ? 'bg-purple-600/30 border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.15)]'
                      : 'bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/[0.07]'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold transition-all ${
                      userAnswers[currentQuestionIndex] === option
                        ? 'bg-purple-500 text-white shadow-lg'
                        : 'bg-white/10 text-gray-400 group-hover:bg-white/20'
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className={`text-lg transition-colors ${
                      userAnswers[currentQuestionIndex] === option ? 'text-white font-semibold' : 'text-gray-300 group-hover:text-white'
                    }`}>
                      {option}
                    </span>
                  </div>
                  {userAnswers[currentQuestionIndex] === option && (
                    <div className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center animate-in zoom-in duration-300">
                      <CheckCircle2 className="h-4 w-4 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-white/10">
              <button
                onClick={handlePrevious}
                disabled={currentQuestionIndex === 0}
                className="px-6 py-3 rounded-xl border border-white/20 text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" /> Previous
              </button>
              
              <button
                onClick={handleNext}
                disabled={!userAnswers[currentQuestionIndex]}
                className={`px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg ${
                  !userAnswers[currentQuestionIndex]
                    ? 'bg-white/10 text-gray-500 cursor-not-allowed border border-white/5'
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:scale-105 active:scale-95 shadow-purple-500/20'
                }`}
              >
                {currentQuestionIndex === questions.length - 1 ? 'Finish Test' : 'Next Question'}
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Question Navigation Grid */}
          <div className="bg-white/5 backdrop-blur-md rounded-3xl p-6 border border-white/10 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <ClipboardList className="h-4 w-4 text-purple-400" />
                </div>
                <h3 className="text-white font-bold tracking-tight">Question Navigator</h3>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span>Answered</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                  <span>Review</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                  <span>Current</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {questions.map((_, idx) => {
                const isAnswered = !!userAnswers[idx];
                const isCurrent = currentQuestionIndex === idx;
                const isMarked = markedForReview.has(idx);

                return (
                  <button
                    key={idx}
                    onClick={() => setCurrentQuestionIndex(idx)}
                    className={`relative w-12 h-12 rounded-xl flex items-center justify-center font-bold transition-all duration-300 border-2 group ${
                      isCurrent
                        ? 'bg-purple-600 border-purple-400 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] scale-110 z-10'
                        : isMarked
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 hover:bg-amber-500/30'
                        : isAnswered
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30'
                        : 'bg-white/5 border-white/10 text-gray-500 hover:border-white/30 hover:bg-white/10'
                    }`}
                  >
                    {idx + 1}
                    {isMarked && !isCurrent && (
                      <div className="absolute -top-1.5 -right-1.5 bg-slate-900 rounded-full p-0.5 border border-amber-500/50">
                        <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                      </div>
                    )}
                    
                    {/* Tooltip on hover */}
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-white text-slate-900 text-[10px] font-black rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl uppercase tracking-tighter">
                      {isCurrent ? 'Current' : isMarked ? 'Flagged' : isAnswered ? 'Completed' : 'Pending'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // RESULTS UI
  const score = calculateScore();
  const percentage = Math.round((score / questions.length) * 100);
  
  return (
    <div className="min-h-screen bg-slate-900 p-8 animate-in fade-in zoom-in-95 duration-700">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => router.push('/test')}
          className="mb-8 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all flex items-center gap-2 border border-white/10"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Test Center
        </button>
        
        <div className="bg-white/10 backdrop-blur-2xl rounded-3xl p-10 border border-white/20 shadow-2xl mb-8 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-10">
             <Award className="h-32 w-32 text-white" />
          </div>

          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-white mb-2">{title} Results</h1>
            <p className="text-gray-400 mb-8">Assessment completed successfully</p>
            
            <div className="relative inline-block scale-110">
              <svg className="w-48 h-48 transform -rotate-90">
                <circle
                  cx="96"
                  cy="96"
                  r="88"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="transparent"
                  className="text-white/5"
                />
                <circle
                  cx="96"
                  cy="96"
                  r="88"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="transparent"
                  strokeDasharray={552.9}
                  strokeDashoffset={552.9 - (552.9 * percentage) / 100}
                  className={`transition-all duration-1000 ease-out ${
                    percentage >= 70 ? 'text-emerald-500' : percentage >= 40 ? 'text-amber-500' : 'text-rose-500'
                  }`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-black text-white">{percentage}%</span>
                <span className="text-gray-500 text-xs mt-1 uppercase tracking-widest">{score} / {questions.length} Correct</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <button 
              onClick={() => setResultsFilter('all')}
              className={`bg-white/5 rounded-2xl p-6 border transition-all flex items-center gap-4 group hover:bg-white/[0.08] text-left ${
                resultsFilter === 'all' ? 'border-purple-500 bg-purple-500/10 shadow-[0_0_20px_rgba(168,85,247,0.1)]' : 'border-white/10'
              }`}
            >
              <div className="bg-purple-500/20 p-3 rounded-xl group-hover:scale-110 transition-transform">
                <Timer className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Time Taken</p>
                <p className="text-white font-bold text-xl">{getDuration()}</p>
                {resultsFilter === 'all' && <p className="text-[10px] text-purple-400 font-bold mt-1 uppercase">Showing All</p>}
              </div>
            </button>
            <button 
              onClick={() => setResultsFilter('correct')}
              className={`bg-white/5 rounded-2xl p-6 border transition-all flex items-center gap-4 group hover:bg-white/[0.08] text-left ${
                resultsFilter === 'correct' ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : 'border-white/10'
              }`}
            >
              <div className="bg-emerald-500/20 p-3 rounded-xl group-hover:scale-110 transition-transform">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wider text-emerald-400/70">Correct</p>
                <p className="text-white font-bold text-xl">{score}</p>
                {resultsFilter === 'correct' && <p className="text-[10px] text-emerald-400 font-bold mt-1 uppercase">Filtering Correct</p>}
              </div>
            </button>
            <button 
              onClick={() => setResultsFilter('incorrect')}
              className={`bg-white/5 rounded-2xl p-6 border transition-all flex items-center gap-4 group hover:bg-white/[0.08] text-left ${
                resultsFilter === 'incorrect' ? 'border-rose-500 bg-rose-500/10 shadow-[0_0_20px_rgba(244,63,94,0.1)]' : 'border-white/10'
              }`}
            >
              <div className="bg-rose-500/20 p-3 rounded-xl group-hover:scale-110 transition-transform">
                <XCircle className="h-6 w-6 text-rose-400" />
              </div>
              <div>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wider text-rose-400/70">Incorrect</p>
                <p className="text-white font-bold text-xl">{questions.length - score}</p>
                {resultsFilter === 'incorrect' && <p className="text-[10px] text-rose-400 font-bold mt-1 uppercase">Filtering Incorrect</p>}
              </div>
            </button>
          </div>

          <div className="flex flex-col md:flex-row gap-4">
             <button
              onClick={() => onExit()}
              className="flex-1 py-4 bg-white/10 text-white font-bold rounded-2xl hover:bg-white/20 transition-all border border-white/10 flex items-center justify-center gap-2"
            >
              <RotateCcw className="h-5 w-5" /> Retake Test
            </button>
            <button
              onClick={() => router.push('/test')}
              className="flex-1 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-2xl hover:brightness-110 transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2"
            >
               Finish & Exit
            </button>
          </div>
        </div>

        {/* Detailed Review */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              Assessment Review
              <span className="px-3 py-1 bg-white/10 rounded-lg text-sm font-medium text-gray-500">
                {resultsFilter === 'all' ? questions.length : 
                 resultsFilter === 'correct' ? score : (questions.length - score)} Questions
              </span>
            </div>
            {resultsFilter !== 'all' && (
              <button 
                onClick={() => setResultsFilter('all')}
                className="text-xs font-bold text-purple-400 uppercase tracking-widest hover:text-purple-300 transition-colors flex items-center gap-2 bg-purple-500/10 px-3 py-1.5 rounded-lg border border-purple-500/20"
              >
                <RotateCcw className="h-3 w-3" /> Clear Filter
              </button>
            )}
          </h2>
          {questions
            .map((q, idx) => ({ ...q, originalIndex: idx }))
            .filter(q => {
              if (resultsFilter === 'correct') return userAnswers[q.originalIndex] === q.correctAnswer;
              if (resultsFilter === 'incorrect') return userAnswers[q.originalIndex] !== q.correctAnswer;
              return true;
            })
            .map((q) => (
            <div 
              key={q.originalIndex} 
              className={`bg-white/5 backdrop-blur-lg rounded-3xl p-8 border ${
                userAnswers[q.originalIndex] === q.correctAnswer ? 'border-emerald-500/20' : 'border-rose-500/20'
              } relative overflow-hidden group hover:bg-white/[0.07] transition-all`}
            >
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white font-bold text-sm border border-white/10">
                      {q.originalIndex + 1}
                    </span>
                    <span className="px-2 py-1 bg-white/5 border border-white/10 rounded-md text-[10px] font-mono text-gray-400">
                      {q.sopIdentifier}
                    </span>
                    {userAnswers[q.originalIndex] === q.correctAnswer ? (
                      <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-bold">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Correct
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 px-3 py-1 bg-rose-500/20 text-rose-400 rounded-full text-xs font-bold">
                        <XCircle className="h-3.5 w-3.5" /> Incorrect
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-white group-hover:text-purple-300 transition-colors">{q.question}</h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {q.options.map((option, optIdx) => (
                  <div 
                    key={optIdx}
                    className={`p-4 rounded-xl border-2 flex items-center justify-between transition-all ${
                      option === q.correctAnswer
                        ? 'bg-emerald-500/10 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                        : option === userAnswers[q.originalIndex]
                        ? 'bg-rose-500/10 border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.1)]'
                        : 'bg-white/5 border-white/10 opacity-60'
                    }`}
                  >
                    <span className={`text-sm ${
                      option === q.correctAnswer ? 'text-emerald-300 font-bold' : option === userAnswers[q.originalIndex] ? 'text-rose-300' : 'text-gray-400'
                    }`}>
                      {option}
                    </span>
                    {option === q.correctAnswer && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    {option === userAnswers[q.originalIndex] && option !== q.correctAnswer && <XCircle className="h-4 w-4 text-rose-500" />}
                  </div>
                ))}
              </div>

              <div className="p-6 bg-white/[0.03] rounded-2xl border border-white/10 group-hover:bg-white/[0.05] transition-all">
                <div className="flex items-center gap-2 mb-3">
                  <Award className="h-4 w-4 text-purple-400" />
                  <span className="text-sm font-bold text-purple-300">Explanation</span>
                </div>
                <p className="text-gray-400 text-sm leading-relaxed mb-4">
                  {q.explanation}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono">
                  <Library className="h-3 w-3" />
                  Reference: {q.sopReference}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
