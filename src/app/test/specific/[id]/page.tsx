'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Clock,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  ArrowRight,
  Send,
  AlertCircle,
  Loader2,
  Award,
  Zap,
} from 'lucide-react';

interface MCQ {
  aiIcon: string;
  question: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  difficultyStars: '⭐' | '⭐⭐' | '⭐⭐⭐';
  options: string[];
  correctAnswer: string;
  explanation: string;
  sopReference: string;
  sopIdentifier?: string;
}

interface MCQBank {
  _id: string;
  sopName: string;
  sopIdentifier: string;
  mcqs: MCQ[];
  totalQuestions: number;
}

export default function SpecificTrainingTestSessionPage() {
  const router = useRouter();
  const params = useParams();
  const rawIdParam = params?.id;

  const [mcqs, setMcqs] = useState<MCQ[]>([]);
  const [bankInfo, setBankInfo] = useState<{ name: string; identifier: string; stats?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<{ [key: number]: string }>({});
  const [revealed, setRevealed] = useState<{ [key: number]: boolean }>({});
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(0);

  const [userId, setUserId] = useState<string>('');

  useEffect(() => {
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
    if (rawIdParam) {
      fetchMergedBanks();
    }
  }, [rawIdParam]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!showResults && !error) {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime, showResults, error]);

  const fetchMergedBanks = async () => {
    try {
      setLoading(true);
      setError(null);

      const rawIds = Array.isArray(rawIdParam) ? rawIdParam.join(',') : rawIdParam as string;
      const ids = decodeURIComponent(rawIds)
        .split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0);
      
      if (ids.length === 0) {
        throw new Error('No valid SOP IDs provided for assessment.');
      }

      const fetchPromises = ids.map(async (id) => {
        try {
          const res = await fetch(`/api/mcq-bank/${id}`);
          if (!res.ok) return null;
          const data = await res.json();
          return data.success && data.mcqBank ? data.mcqBank : null;
        } catch (e) {
          return null;
        }
      });

      const bankResults = await Promise.all(fetchPromises);
      const validBanks: MCQBank[] = bankResults.filter((b): b is MCQBank => b !== null);
      
      if (validBanks.length === 0) {
        throw new Error('Unable to load any valid question banks. Please ensure the selected SOPs have MCQs generated.');
      }

      // Merge and Filter Stage
      let filteredPool: MCQ[] = [];
      validBanks.forEach(bank => {
        const matchingMcqs = bank.mcqs
          .filter(q => q.difficulty === 'Medium' || q.difficulty === 'Hard')
          .map(q => ({
            ...q,
            sopIdentifier: q.sopIdentifier || bank.sopIdentifier
          }));
        filteredPool = [...filteredPool, ...matchingMcqs];
      });

      if (filteredPool.length === 0) {
        throw new Error('No "Medium" or "Hard" difficulty questions found in the selected SOPs.');
      }

      // Random Selection Stage (Target 100)
      const shuffled = filteredPool.sort(() => Math.random() - 0.5);
      const targetCount = 100;
      const finalSelection = shuffled.slice(0, targetCount);

      setMcqs(finalSelection);

      // Set header info
      if (validBanks.length === 1) {
        setBankInfo({
          name: validBanks[0].sopName,
          identifier: validBanks[0].sopIdentifier,
          stats: `Expert Mode: ${finalSelection.length} Medium/Hard Questions`
        });
      } else {
        setBankInfo({
          name: 'Targeted Skill Assessment',
          identifier: `${validBanks.length} SOPs Combined`,
          stats: `Expert Mode: ${finalSelection.length} Medium/Hard Questions`
        });
      }

    } catch (err: any) {
      console.error('CRITICAL: Error in fetchMergedBanks:', err);
      setError(err.message || 'An unexpected error occurred while preparing your assessment.');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSelect = (answer: string) => {
    if (revealed[currentQuestion]) return;

    const isCorrect = answer === mcqs[currentQuestion].correctAnswer;
    if (isCorrect) {
      setScore(prev => prev + 1);
    }

    setAnswers({
      ...answers,
      [currentQuestion]: answer,
    });
    setRevealed({
      ...revealed,
      [currentQuestion]: true,
    });
  };

  const handleNext = () => {
    if (currentQuestion < mcqs.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      handleSubmit();
    }
  };

  const handleExit = () => {
    if (confirm('Are you sure you want to exit? Your progress will be lost.')) {
        router.push('/test/specific');
    }
  };

  const handleSubmit = async () => {
    if (mcqs.length === 0) return;

    setSubmitting(true);
    try {
      alert(`Assessment Complete!\nTotal Questions: ${mcqs.length}\nCorrect Answers: ${score}\nPercentage: ${Math.round((score/mcqs.length)*100)}%`);
      router.push('/test/specific');
    } catch (error) {
      console.error('Error submitting test:', error);
      alert('Assessment finished. Final Score: ' + score);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <Loader2 className="h-16 w-16 text-yellow-400 animate-spin mb-4" />
          <p className="text-white text-xl font-medium">Curating 100 Expert Questions...</p>
        </div>
      </div>
    );
  }

  if (error || mcqs.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="bg-orange-500/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border border-orange-500/30">
            <Zap className="h-10 w-10 text-orange-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">Filtering Error</h2>
          <p className="text-gray-400 mb-8 leading-relaxed">
            {error || 'No matching Medium or Hard questions were found in the selected SOPs.'}
          </p>
          <div className="flex flex-col gap-3">
              <button
                onClick={() => fetchMergedBanks()}
                className="w-full px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 transition-all font-bold"
              >
                Try Again
              </button>
              <button
                onClick={() => router.push('/test/specific')}
                className="w-full px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-yellow-500/20"
              >
                Back to Selection
              </button>
          </div>
        </div>
      </div>
    );
  }

  const currentMCQ = mcqs[currentQuestion];
  const isAnswered = revealed[currentQuestion];
  const selectedAnswer = answers[currentQuestion];
  const progress = ((currentQuestion + 1) / mcqs.length) * 100;

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6 transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="bg-orange-500/20 p-2 rounded-lg border border-orange-500/30">
                <Zap className="h-6 w-6 text-orange-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-white truncate max-w-md">{bankInfo?.name}</h1>
                <p className="text-orange-300 font-mono text-xs">{bankInfo?.identifier} • {bankInfo?.stats}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm font-mono font-bold">
              <div className="bg-white/10 px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-400" />
                <span className="text-white">{formatTime(elapsedTime)}</span>
              </div>
              <div className="bg-white/10 px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                <Award className="h-4 w-4 text-emerald-400" />
                <span className="text-white">Score: {score}</span>
              </div>
            </div>
          </div>

          <div className="w-full bg-white/20 rounded-full h-1.5">
            <div
              className="bg-gradient-to-r from-orange-400 via-yellow-400 to-orange-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Question Card */}
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
                <Zap className="h-32 w-32 text-orange-500" />
            </div>

          <div className="mb-8 relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <span className="px-3 py-1 bg-orange-500/20 text-orange-300 rounded-lg font-mono text-xs border border-orange-500/30">
                Question {currentQuestion + 1} of {mcqs.length}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-white/10 bg-white/5 text-gray-400`}>
                {currentMCQ.sopIdentifier}
              </span>
              <span className={`px-3 py-1 bg-white/5 text-gray-400 rounded-lg font-mono text-xs border border-white/10`}>
                {currentMCQ.difficultyStars} {currentMCQ.difficulty}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white leading-relaxed">
              {currentMCQ.question}
            </h2>
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 gap-3 mb-8 relative z-10">
            {currentMCQ.options.map((option, index) => {
              const isSelected = selectedAnswer === option;
              const isCorrect = option === currentMCQ.correctAnswer;
              
              let buttonStyles = "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20";
              let iconColor = "border-gray-400";

              if (isAnswered) {
                if (isCorrect) {
                  buttonStyles = "bg-emerald-500/20 border-emerald-500/50 shadow-lg shadow-emerald-500/10 scale-[1.02]";
                  iconColor = "border-emerald-400 bg-emerald-500";
                } else if (isSelected) {
                  buttonStyles = "bg-red-500/20 border-red-500/50 opacity-80";
                  iconColor = "border-red-400 bg-red-500";
                } else {
                  buttonStyles = "bg-white/5 border-white/10 opacity-40 grayscale-[0.5]";
                }
              }

              return (
                <button
                  key={index}
                  disabled={isAnswered}
                  onClick={() => handleAnswerSelect(option)}
                  className={`w-full p-4 rounded-2xl text-left transition-all border-2 flex items-center gap-4 ${buttonStyles}`}
                >
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${iconColor}`}>
                    {isAnswered && isCorrect && <CheckCircle2 className="h-4 w-4 text-white" />}
                    {isAnswered && isSelected && !isCorrect && <XCircle className="h-4 w-4 text-white" />}
                  </div>
                  <span className="text-white font-medium">{option}</span>
                </button>
              );
            })}
          </div>

          {/* Correct Answer Explanation */}
          {isAnswered && (
            <div className="animate-in fade-in slide-in-from-top-4 duration-500 mb-8 relative z-10">
              <div className={`p-6 rounded-2xl border ${
                selectedAnswer === currentMCQ.correctAnswer 
                ? 'bg-emerald-500/10 border-emerald-500/30' 
                : 'bg-red-500/10 border-red-500/30'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  {selectedAnswer === currentMCQ.correctAnswer ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-400" />
                  )}
                  <span className={`font-bold uppercase tracking-wider text-sm ${
                    selectedAnswer === currentMCQ.correctAnswer ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {selectedAnswer === currentMCQ.correctAnswer ? 'Excellent!' : 'Incorrect'}
                  </span>
                </div>
                
                <p className="text-white font-semibold mb-2">
                  Correct Answer: <span className="text-emerald-400">{currentMCQ.correctAnswer}</span>
                </p>
                
                <div className="text-gray-300 text-sm leading-relaxed bg-black/20 p-4 rounded-xl border border-white/5">
                  <p className="font-bold text-gray-400 mb-1 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" /> Explanation:
                  </p>
                  {currentMCQ.explanation}
                  {currentMCQ.sopReference && (
                    <div className="mt-3 pt-3 border-t border-white/10 text-xs italic text-gray-500">
                      Reference: {currentMCQ.sopReference}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Navigation Area */}
          <div className="flex items-center justify-between pt-8 border-t border-white/10 relative z-10">
            <button
              onClick={handleExit}
              className="px-6 py-3 rounded-xl border border-white/10 text-gray-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all flex items-center gap-2 font-semibold"
            >
              <ArrowLeft className="h-4 w-4" /> Exit Test
            </button>
            
            <button
              onClick={handleNext}
              disabled={!isAnswered || submitting}
              className={`px-8 py-4 rounded-2xl font-bold transition-all flex items-center gap-2 shadow-xl ${
                !isAnswered
                  ? 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/10 opacity-50'
                  : 'bg-gradient-to-r from-orange-500 to-yellow-600 text-white hover:scale-105 active:scale-95 shadow-orange-500/20'
              }`}
            >
              {currentQuestion === mcqs.length - 1 ? (
                submitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Finishing...
                  </>
                ) : (
                  <>
                    Finish Test
                    <Send className="h-5 w-5" />
                  </>
                )
              ) : (
                <>
                  Next Question
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
