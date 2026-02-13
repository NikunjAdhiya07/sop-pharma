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
  Eye,
  Award,
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
  language?: 'English' | 'Gujarati';
}

export default function TakeTestPage() {
  const router = useRouter();
  const params = useParams();
  const bankId = params.id as string;

  const [mcqBank, setMcqBank] = useState<MCQBank | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<{ [key: number]: string }>({});
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<number>>(new Set());

  // Get user ID from localStorage
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
    if (bankId) {
      fetchMCQBank();
    }
  }, [bankId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime]);

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
    setAnswers({
      ...answers,
      [currentQuestion]: answer,
    });
  };

  const toggleFlag = () => {
    const newFlagged = new Set(flaggedQuestions);
    if (newFlagged.has(currentQuestion)) {
      newFlagged.delete(currentQuestion);
    } else {
      newFlagged.add(currentQuestion);
    }
    setFlaggedQuestions(newFlagged);
  };

  const handleNext = () => {
    if (mcqBank && currentQuestion < mcqBank.mcqs.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <Loader2 className="h-16 w-16 text-purple-400 animate-spin mb-4" />
          <p className="text-white text-xl font-medium">Loading Test...</p>
        </div>
      </div>
    );
  }

  if (!mcqBank) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <p className="text-white text-xl">Test not found</p>
          <button
            onClick={() => router.push('/mcq-tests')}
            className="mt-4 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl"
          >
            Back to Tests
          </button>
        </div>
      </div>
    );
  }

  const currentMCQ = mcqBank.mcqs[currentQuestion];
  const answeredCount = Object.keys(answers).length;
  const progress = (answeredCount / mcqBank.totalQuestions) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">{mcqBank.sopName}</h1>
              <p className="text-purple-300 font-mono text-sm">{mcqBank.sopIdentifier}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-xl">
                <Clock className="h-5 w-5 text-blue-400" />
                <span className="text-white font-mono font-bold">{formatTime(elapsedTime)}</span>
              </div>
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to exit? Your progress will be lost.')) {
                    router.push('/mcq-tests');
                  }
                }}
                className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-xl border border-red-500/50 transition-all"
              >
                Exit
              </button>
            </div>
          </div>

          {/* Progress */}
          <div>
            <div className="flex justify-between text-sm text-gray-300 mb-2">
              <span>Progress: {answeredCount} / {mcqBank.totalQuestions} answered</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Question */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-start gap-4 flex-1">
              <span className="text-5xl">{currentMCQ.aiIcon}</span>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <span className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-lg font-mono text-sm">
                    Question {currentQuestion + 1} / {mcqBank.totalQuestions}
                  </span>
                  <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${getDifficultyColor(currentMCQ.difficulty)}`}>
                    {currentMCQ.difficultyStars} {currentMCQ.difficulty}
                  </span>
                  <button
                    onClick={toggleFlag}
                    className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                      flaggedQuestions.has(currentQuestion)
                        ? 'bg-yellow-600/30 text-yellow-300 border-yellow-500'
                        : 'bg-gray-500/20 text-gray-400 border-gray-500/50 hover:bg-yellow-600/20 hover:text-yellow-400 hover:border-yellow-500/50'
                    }`}
                  >
                    <Award className="h-4 w-4" />
                    {flaggedQuestions.has(currentQuestion) ? 'Flagged' : 'Flag'}
                  </button>
                </div>
                <h2 className={`text-2xl font-bold text-white leading-relaxed ${mcqBank.language === 'Gujarati' ? 'font-gujarati' : ''}`}>
                  {currentMCQ.question}
                </h2>
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            {currentMCQ.options.map((option, index) => {
              const isSelected = answers[currentQuestion] === option;
              return (
                <button
                  key={index}
                  onClick={() => handleAnswerSelect(option)}
                  className={`w-full p-4 rounded-xl text-left transition-all border-2 ${
                    isSelected
                      ? 'bg-purple-500/30 border-purple-500 shadow-lg shadow-purple-500/20'
                      : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                      isSelected ? 'border-purple-400 bg-purple-500' : 'border-gray-400'
                    }`}>
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-white" />}
                    </div>
                    <span className={`text-white font-medium ${mcqBank.language === 'Gujarati' ? 'font-gujarati' : ''}`}>{option}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={handlePrevious}
            disabled={currentQuestion === 0}
            className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="h-5 w-5" />
            Previous
          </button>

          <div className="flex-1 flex justify-center gap-2 flex-wrap max-w-2xl">
            {mcqBank.mcqs.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentQuestion(index)}
                className={`w-10 h-10 rounded-lg font-bold transition-all relative ${
                  index === currentQuestion
                    ? 'bg-purple-600 text-white scale-110'
                    : answers[index]
                    ? 'bg-green-500/30 text-green-300 border border-green-500/50'
                    : 'bg-white/10 text-gray-400 hover:bg-white/20'
                }`}
              >
                {index + 1}
                {flaggedQuestions.has(index) && (
                  <span className="absolute -top-1 -right-1 text-yellow-400">
                    ⭐
                  </span>
                )}
              </button>
            ))}
          </div>

          {currentQuestion === mcqBank.mcqs.length - 1 ? (
            <button
              onClick={() => setShowConfirmSubmit(true)}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-green-500/30"
            >
              <Send className="h-5 w-5" />
              Submit Test
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 transition-all"
            >
              Next
              <ArrowRight className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Confirm Submit Modal */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-slate-900 to-purple-900 rounded-2xl p-8 max-w-md w-full border border-white/20">
            <h3 className="text-2xl font-bold text-white mb-4">Submit Test?</h3>
            <p className="text-gray-300 mb-6">
              You have answered <span className="font-bold text-purple-300">{answeredCount}</span> out of{' '}
              <span className="font-bold text-purple-300">{mcqBank.totalQuestions}</span> questions.
              {answeredCount < mcqBank.totalQuestions && (
                <span className="block mt-2 text-yellow-300">
                  ⚠️ {mcqBank.totalQuestions - answeredCount} question(s) are unanswered and will be marked as incorrect.
                </span>
              )}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 transition-all"
              >
                Review
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    Submit
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
