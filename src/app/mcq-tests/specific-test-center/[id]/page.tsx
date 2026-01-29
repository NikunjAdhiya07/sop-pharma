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
}

interface MCQBank {
  _id: string;
  sopName: string;
  sopIdentifier: string;
  mcqs: MCQ[];
  totalQuestions: number;
}

export default function SpecificTestPage() {
  const router = useRouter();
  const params = useParams();
  const bankId = params.id as string;

  const [mcqBank, setMcqBank] = useState<MCQBank | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<{ [key: number]: string }>({});
  const [revealed, setRevealed] = useState<{ [key: number]: boolean }>({});
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(0);

  // Get user ID from localStorage
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
    if (bankId) {
      fetchMCQBank();
    }
  }, [bankId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!showResults) {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime, showResults]);

  const fetchMCQBank = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/mcq-bank/${bankId}`);
      const data = await response.json();

      if (data.success && data.mcqBank) {
        setMcqBank(data.mcqBank);
      } else {
        console.error('Failed to fetch MCQ bank:', data);
      }
    } catch (error) {
      console.error('Error fetching MCQ bank:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSelect = (answer: string) => {
    if (revealed[currentQuestion]) return;

    const isCorrect = answer === mcqBank?.mcqs[currentQuestion].correctAnswer;
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
    if (mcqBank && currentQuestion < mcqBank.mcqs.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (!mcqBank) return;

    setSubmitting(true);
    try {
      const formattedAnswers = mcqBank.mcqs.map((mcq, index) => ({
        questionIndex: index,
        selectedAnswer: answers[index] || '',
      }));

      const response = await fetch('/api/mcq-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          mcqBankId: bankId,
          answers: formattedAnswers,
          timeTaken: elapsedTime,
          startedAt: new Date(startTime).toISOString(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        router.push(`/mcq-tests/results/${data.testResult._id}`);
      } else {
        alert('Failed to submit test: ' + data.error);
      }
    } catch (error) {
      console.error('Error submitting test:', error);
      alert('Failed to submit test');
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <Loader2 className="h-16 w-16 text-yellow-400 animate-spin mb-4" />
          <p className="text-white text-xl font-medium">Loading Specific Test...</p>
        </div>
      </div>
    );
  }

  if (!mcqBank) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <p className="text-white text-xl">Test not found</p>
          <button
            onClick={() => router.push('/mcq-tests/specific-test-center')}
            className="mt-4 px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-xl"
          >
            Back to Center
          </button>
        </div>
      </div>
    );
  }

  const currentMCQ = mcqBank.mcqs[currentQuestion];
  const isAnswered = revealed[currentQuestion];
  const selectedAnswer = answers[currentQuestion];
  const progress = ((currentQuestion + 1) / mcqBank.totalQuestions) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6 transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="bg-yellow-500/20 p-2 rounded-lg">
                <Zap className="h-6 w-6 text-yellow-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white line-clamp-1">{mcqBank.sopName}</h1>
                <p className="text-yellow-300 font-mono text-xs">{mcqBank.sopIdentifier} • Specific Mode</p>
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
              className="bg-gradient-to-r from-yellow-400 to-orange-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Question Card */}
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 shadow-2xl">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="px-3 py-1 bg-yellow-500/20 text-yellow-300 rounded-lg font-mono text-xs border border-yellow-500/30">
                Question {currentQuestion + 1} of {mcqBank.totalQuestions}
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
          <div className="space-y-3 mb-8">
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

          {/* Correct Answer Explanation - Revealed after answer */}
          {isAnswered && (
            <div className="animate-in fade-in slide-in-from-top-4 duration-500">
              <div className={`p-6 rounded-2xl border mb-8 ${
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

              <div className="flex justify-end">
                <button
                  onClick={handleNext}
                  disabled={submitting}
                  className="flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white font-bold rounded-2xl transition-all shadow-xl shadow-yellow-500/20 group"
                >
                  {currentQuestion === mcqBank.mcqs.length - 1 ? (
                    submitting ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Finishing...
                      </>
                    ) : (
                      <>
                        Finish Test
                        <Send className="h-5 w-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                      </>
                    )
                  ) : (
                    <>
                      Next Question
                      <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
