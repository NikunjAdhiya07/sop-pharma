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
  const [visitedQuestions, setVisitedQuestions] = useState<Set<number>>(new Set([0]));
  const [currentTime, setCurrentTime] = useState<number>(0);

  useEffect(() => {
    setCurrentTime(Date.now());
    if (currentStep === 'testing') {
      const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
      return () => clearInterval(timer);
    }
  }, [currentStep]);

  useEffect(() => {
    setVisitedQuestions(prev => new Set(prev).add(currentQuestionIndex));
  }, [currentQuestionIndex]);

  const handleClearResponse = () => {
    const newAnswers = { ...userAnswers };
    delete newAnswers[currentQuestionIndex];
    setUserAnswers(newAnswers);
  };

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
    const durationSeconds = Math.floor((currentTime - testStartTime) / 1000);
    const MathMax = Math.max(0, durationSeconds);
    const hrs = Math.floor(MathMax / 3600);
    const mins = Math.floor((MathMax % 3600) / 60);
    const secs = Math.floor(MathMax % 60);
    const timeDisplay = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    return (
      <div className="h-screen flex flex-col bg-slate-950 text-white font-sans overflow-hidden">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-white/10 shadow-md">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold tracking-wide">{title}</h1>
            <div className="flex items-center gap-2 text-xs font-bold px-3 py-1 bg-black/30 rounded border border-white/5">
              <span className="text-emerald-400">+1 Correct</span>
              <span className="text-rose-400">-0 Incorrect</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-lg font-mono">
              <Timer className="h-5 w-5 text-gray-400" />
              <span>{timeDisplay}</span>
            </div>
            <button
               onClick={() => {
                 const endTime = Date.now();
                 setTestEndTime(endTime);
                 setCurrentStep('results');
                 if (onComplete) {
                   const detailedAnswers = questions.map((q, idx) => ({
                     questionId: q._id || `q_${idx}`, question: q.question, selectedAnswer: userAnswers[idx] || '', correctAnswer: q.correctAnswer, isCorrect: userAnswers[idx] === q.correctAnswer, sopName: q.sopName, sopIdentifier: q.sopIdentifier, sopId: q.sopId || q._id
                   }));
                   // @ts-ignore
                   onComplete(calculateScore(), questions.length, detailedAnswers, Math.floor((endTime - testStartTime) / 1000));
                 }
               }}
               className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded transition-colors"
            >
              Submit Test
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Left Panel - Question Area */}
          <div className="flex-1 flex flex-col bg-slate-900 border-r border-white/10">
            <div className="flex-1 p-8 overflow-y-auto">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold">Question {currentQuestionIndex + 1}</h2>
                <div className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-md text-sm text-gray-300 font-medium tracking-wide">
                  {q.sopName || q.sopIdentifier || 'General'}
                </div>
              </div>
              
              <div className="bg-white/5 rounded-xl p-8 border border-white/10 shadow-lg mb-8">
                <p className="text-lg leading-relaxed mb-6 font-medium text-gray-100">
                  {q.question}
                </p>
                {/* Visual Placeholder for diagram if any */}
                {/* <div className="w-full h-32 bg-black/40 rounded-lg border border-white/5 flex items-center justify-center text-gray-600 mb-8 text-sm">
                  [ Diagram / Image Area from CDN ]
                </div> */}
              </div>

              <div className="flex flex-col gap-4">
                {q.options.map((option, idx) => (
                  <label
                    key={idx}
                    className={`flex items-center p-5 rounded-xl border cursor-pointer transition-all ${
                      userAnswers[currentQuestionIndex] === option
                        ? 'bg-blue-600/10 border-blue-500/50 shadow-[0_0_15px_rgba(37,99,235,0.1)]'
                        : 'bg-white/5 border-white/10 hover:bg-white/[0.08] hover:border-white/20'
                    }`}
                  >
                    <div className="relative flex items-center justify-center w-6 h-6 mr-4">
                      <input
                        type="radio"
                        name={`question-${currentQuestionIndex}`}
                        className="peer sr-only"
                        checked={userAnswers[currentQuestionIndex] === option}
                        onChange={() => handleOptionSelect(option)}
                      />
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        userAnswers[currentQuestionIndex] === option 
                          ? 'border-blue-500 bg-transparent' 
                          : 'border-gray-500 bg-transparent'
                      }`}>
                        {userAnswers[currentQuestionIndex] === option && (
                          <div className="w-3 h-3 rounded-full bg-blue-500" />
                        )}
                      </div>
                    </div>
                    <span className="text-base text-gray-200">{option}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between p-6 bg-slate-900 border-t border-white/10">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleClearResponse}
                  disabled={!userAnswers[currentQuestionIndex]}
                  className="px-6 py-3 rounded-lg bg-white/5 border border-white/10 text-gray-300 font-medium hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear Response
                </button>
                <button
                  onClick={() => handleToggleReview(currentQuestionIndex)}
                  className={`px-6 py-3 rounded-lg font-medium transition-colors border ${
                    markedForReview.has(currentQuestionIndex)
                      ? 'bg-amber-500/10 border-amber-500/50 text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.1)]'
                      : 'bg-white/5 border-white/10 text-amber-500 hover:bg-amber-500/5 hover:border-amber-500/30'
                  }`}
                >
                  {markedForReview.has(currentQuestionIndex) ? 'Unmark Review' : 'Mark for Review'}
                </button>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={handlePrevious}
                  disabled={currentQuestionIndex === 0}
                  className="px-6 py-3 rounded-lg bg-white/5 border border-white/10 text-gray-300 font-medium hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <ArrowLeft className="h-4 w-4" /> Prev
                </button>
                <button
                  onClick={handleNext}
                  className="px-8 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors flex items-center gap-2 shadow-lg hover:shadow-blue-500/20"
                >
                  Save & Next <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Right Panel - Palette */}
          <div className="w-80 bg-slate-900 border-l border-white/10 flex flex-col shrink-0">
            <div className="p-4 border-b border-white/10">
              <h3 className="font-bold text-lg mb-4 text-white">Question Palette</h3>
              <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs font-medium text-gray-300">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-emerald-500 flex items-center justify-center text-white shadow-sm" />
                  <span>Answered</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-rose-500 flex items-center justify-center text-white shadow-sm" />
                  <span>Not Answered</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center text-gray-400" />
                  <span>Not Visited</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-white shadow-sm" />
                  <span>Review</span>
                </div>
              </div>
            </div>

            <div className="flex-1 p-5 overflow-y-auto bg-slate-900 border-b border-white/10">
              <div className="grid grid-cols-5 gap-3">
                {questions.map((_, idx) => {
                  const isAnswered = !!userAnswers[idx];
                  const isMarked = markedForReview.has(idx);
                  const isVisited = visitedQuestions.has(idx);
                  
                  let bgClass = 'bg-white/5 text-gray-400 border border-white/10'; // Not visited
                  let shapeClass = 'rounded-md';
                  
                  if (isMarked) {
                    bgClass = 'bg-amber-500 text-white shadow-md shadow-amber-500/20';
                    shapeClass = 'rounded-full'; // Make review circles
                  } else if (isAnswered) {
                    bgClass = 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20';
                  } else if (isVisited) {
                    bgClass = 'bg-rose-500 text-white shadow-md shadow-rose-500/20';
                  }

                  const isCurrent = currentQuestionIndex === idx;

                  return (
                    <button
                      key={idx}
                      onClick={() => setCurrentQuestionIndex(idx)}
                      className={`h-10 flex items-center justify-center text-sm font-bold transition-all ${bgClass} ${shapeClass} hover:opacity-80 ${
                        isCurrent ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 border-transparent transform scale-110' : ''
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
            
            <div className="p-6 bg-slate-900/50">
               <div className="w-full h-24 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center text-gray-500 text-xs text-center p-4">
                 Student Photo / Reg<br/>(Do not close this window)
               </div>
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
