'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Trophy,
  CheckCircle2,
  XCircle,
  Clock,
  Target,
  TrendingUp,
  Award,
  BarChart3,
  Eye,
  EyeOff,
  ArrowLeft,
  RotateCcw,
  Loader2,
} from 'lucide-react';

interface TestResult {
  _id: string;
  username: string;
  userFullName: string;
  mcqBankId: string;
  sopName: string;
  sopIdentifier: string;
  testName: string;
  questions: Array<{
    questionIndex: number;
    question: string;
    aiIcon: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    difficultyStars: string;
    options: string[];
    selectedAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    explanation: string;
    sopReference: string;
  }>;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  skippedQuestions: number;
  score: number;
  grade: string;
  isPassed: boolean;
  passingScore: number;
  difficultyBreakdown: {
    easy: { correct: number; total: number };
    medium: { correct: number; total: number };
    hard: { correct: number; total: number };
  };
  timeTaken: number;
  attemptNumber: number;
  reviewed: boolean;
}

export default function TestResultsPage() {
  const router = useRouter();
  const params = useParams();
  const resultId = params.id as string;

  const [result, setResult] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showExplanations, setShowExplanations] = useState(true);
  const [selectedQuestion, setSelectedQuestion] = useState<number | null>(null);

  useEffect(() => {
    fetchResult();
  }, [resultId]);

  const fetchResult = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/mcq-tests/results?resultId=${resultId}`);
      const data = await response.json();

      if (data.success) {
        setResult(data.result);
        // Mark as reviewed
        await fetch('/api/mcq-tests/results', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resultId }),
        });
      }
    } catch (error) {
      console.error('Error fetching result:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith('A')) return 'text-emerald-400';
    if (grade.startsWith('B')) return 'text-blue-400';
    if (grade === 'C') return 'text-yellow-400';
    return 'text-red-400';
  };

  const getGradeBg = (grade: string) => {
    if (grade.startsWith('A')) return 'bg-emerald-500/20 border-emerald-500';
    if (grade.startsWith('B')) return 'bg-blue-500/20 border-blue-500';
    if (grade === 'C') return 'bg-yellow-500/20 border-yellow-500';
    return 'bg-red-500/20 border-red-500';
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
          <p className="text-white text-xl font-medium">Loading Results...</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-xl">Results not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Test Results</h1>
              <p className="text-gray-300">{result.sopName}</p>
              <p className="text-purple-300 text-sm font-mono">{result.sopIdentifier}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/mcq-tests')}
                className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 transition-all"
              >
                <ArrowLeft className="h-5 w-5" />
                Back to Tests
              </button>
              <button
                onClick={() => router.push(`/mcq-tests/${result.mcqBankId}`)}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl transition-all"
              >
                <RotateCcw className="h-5 w-5" />
                Retake Test
              </button>
            </div>
          </div>
        </div>

        {/* Score Card */}
        <div className={`bg-gradient-to-br ${result.isPassed ? 'from-emerald-500/20 to-green-500/20 border-emerald-500' : 'from-red-500/20 to-orange-500/20 border-red-500'} backdrop-blur-lg rounded-2xl p-8 border-2 mb-8 shadow-2xl`}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              {result.isPassed ? (
                <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                  <Trophy className="h-12 w-12 text-white" />
                </div>
              ) : (
                <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center shadow-lg">
                  <XCircle className="h-12 w-12 text-white" />
                </div>
              )}
              <div>
                <h2 className="text-3xl font-bold text-white mb-1">
                  {result.isPassed ? 'Congratulations! 🎉' : 'Keep Trying! 💪'}
                </h2>
                <p className="text-gray-300">
                  {result.isPassed ? 'You passed the test!' : `Passing score: ${result.passingScore}%`}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-6xl font-bold ${getGradeColor(result.grade)} mb-2`}>
                {result.score}%
              </div>
              <div className={`inline-block px-6 py-2 rounded-xl border-2 ${getGradeBg(result.grade)}`}>
                <span className={`text-2xl font-bold ${getGradeColor(result.grade)}`}>
                  Grade: {result.grade}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <span className="text-gray-300 text-sm">Correct</span>
              </div>
              <p className="text-3xl font-bold text-white">{result.correctAnswers}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="h-5 w-5 text-red-400" />
                <span className="text-gray-300 text-sm">Incorrect</span>
              </div>
              <p className="text-3xl font-bold text-white">{result.incorrectAnswers}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-5 w-5 text-blue-400" />
                <span className="text-gray-300 text-sm">Time Taken</span>
              </div>
              <p className="text-2xl font-bold text-white">{formatTime(result.timeTaken)}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-5 w-5 text-purple-400" />
                <span className="text-gray-300 text-sm">Attempt</span>
              </div>
              <p className="text-3xl font-bold text-white">#{result.attemptNumber}</p>
            </div>
          </div>
        </div>

        {/* Difficulty Breakdown */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-8">
          <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-purple-400" />
            Performance by Difficulty
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Easy */}
            <div className="bg-green-500/10 rounded-xl p-5 border border-green-500/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-green-300 font-semibold">⭐ Easy</span>
                <span className="text-white font-bold">
                  {result.difficultyBreakdown.easy.correct} / {result.difficultyBreakdown.easy.total}
                </span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-3 mb-2">
                <div
                  className="bg-green-500 h-3 rounded-full transition-all"
                  style={{
                    width: `${result.difficultyBreakdown.easy.total > 0 ? (result.difficultyBreakdown.easy.correct / result.difficultyBreakdown.easy.total) * 100 : 0}%`
                  }}
                />
              </div>
              <p className="text-green-300 text-sm">
                {result.difficultyBreakdown.easy.total > 0 
                  ? Math.round((result.difficultyBreakdown.easy.correct / result.difficultyBreakdown.easy.total) * 100)
                  : 0}% Correct
              </p>
            </div>

            {/* Medium */}
            <div className="bg-yellow-500/10 rounded-xl p-5 border border-yellow-500/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-yellow-300 font-semibold">⭐⭐ Medium</span>
                <span className="text-white font-bold">
                  {result.difficultyBreakdown.medium.correct} / {result.difficultyBreakdown.medium.total}
                </span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-3 mb-2">
                <div
                  className="bg-yellow-500 h-3 rounded-full transition-all"
                  style={{
                    width: `${result.difficultyBreakdown.medium.total > 0 ? (result.difficultyBreakdown.medium.correct / result.difficultyBreakdown.medium.total) * 100 : 0}%`
                  }}
                />
              </div>
              <p className="text-yellow-300 text-sm">
                {result.difficultyBreakdown.medium.total > 0 
                  ? Math.round((result.difficultyBreakdown.medium.correct / result.difficultyBreakdown.medium.total) * 100)
                  : 0}% Correct
              </p>
            </div>

            {/* Hard */}
            <div className="bg-red-500/10 rounded-xl p-5 border border-red-500/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-red-300 font-semibold">⭐⭐⭐ Hard</span>
                <span className="text-white font-bold">
                  {result.difficultyBreakdown.hard.correct} / {result.difficultyBreakdown.hard.total}
                </span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-3 mb-2">
                <div
                  className="bg-red-500 h-3 rounded-full transition-all"
                  style={{
                    width: `${result.difficultyBreakdown.hard.total > 0 ? (result.difficultyBreakdown.hard.correct / result.difficultyBreakdown.hard.total) * 100 : 0}%`
                  }}
                />
              </div>
              <p className="text-red-300 text-sm">
                {result.difficultyBreakdown.hard.total > 0 
                  ? Math.round((result.difficultyBreakdown.hard.correct / result.difficultyBreakdown.hard.total) * 100)
                  : 0}% Correct
              </p>
            </div>
          </div>
        </div>

        {/* Question Review */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-white flex items-center gap-2">
              <Eye className="h-6 w-6 text-purple-400" />
              Question Review
            </h3>
            <button
              onClick={() => setShowExplanations(!showExplanations)}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 transition-all"
            >
              {showExplanations ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showExplanations ? 'Hide' : 'Show'} Explanations
            </button>
          </div>

          <div className="space-y-4">
            {result.questions.map((q, index) => (
              <div
                key={index}
                className={`bg-white/5 rounded-xl p-6 border-2 ${
                  q.isCorrect ? 'border-green-500/30' : 'border-red-500/30'
                }`}
              >
                <div className="flex items-start gap-4 mb-4">
                  <span className="text-4xl">{q.aiIcon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-lg font-mono text-sm">
                        Question {index + 1}
                      </span>
                      <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${getDifficultyColor(q.difficulty)}`}>
                        {q.difficultyStars} {q.difficulty}
                      </span>
                      {q.isCorrect ? (
                        <span className="px-3 py-1 bg-green-500/20 text-green-300 rounded-lg text-xs font-bold border border-green-500/50 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Correct
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-red-500/20 text-red-300 rounded-lg text-xs font-bold border border-red-500/50 flex items-center gap-1">
                          <XCircle className="h-3 w-3" />
                          Incorrect
                        </span>
                      )}
                    </div>
                    <h4 className="text-xl font-bold text-white mb-4">{q.question}</h4>

                    <div className="space-y-2 mb-4">
                      {q.options.map((option, optIndex) => {
                        const isCorrect = option === q.correctAnswer;
                        const isSelected = option === q.selectedAnswer;

                        return (
                          <div
                            key={optIndex}
                            className={`p-3 rounded-lg border-2 ${
                              isCorrect
                                ? 'bg-green-500/20 border-green-500'
                                : isSelected
                                ? 'bg-red-500/20 border-red-500'
                                : 'bg-white/5 border-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {isCorrect && <CheckCircle2 className="h-4 w-4 text-green-400" />}
                              {isSelected && !isCorrect && <XCircle className="h-4 w-4 text-red-400" />}
                              <span className={`${isCorrect ? 'text-green-300 font-semibold' : isSelected ? 'text-red-300' : 'text-gray-300'}`}>
                                {option}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {showExplanations && (
                      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                        <p className="text-blue-300 font-semibold mb-2">💡 Explanation:</p>
                        <p className="text-gray-300 mb-3">{q.explanation}</p>
                        <p className="text-xs text-gray-400 italic">Reference: {q.sopReference}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
