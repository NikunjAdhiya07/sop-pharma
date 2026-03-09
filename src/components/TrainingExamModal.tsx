'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, CheckCircle2, XCircle, AlertTriangle, PlayCircle, ChevronRight, Award } from 'lucide-react';

interface ExamQuestion {
  question: string;
  options: string[];
}

interface Props {
  matrixId: string;
  sopName: string;
  onClose: () => void;
  onComplete: () => void;
}

type Phase = 'loading' | 'intro' | 'exam' | 'result' | 'error';

export default function TrainingExamModal({ matrixId, sopName, onClose, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [attemptId, setAttemptId] = useState('');
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [resumed, setResumed] = useState(false);

  const startExam = useCallback(async () => {
    setPhase('loading');
    try {
      const res = await fetch('/api/training/exam/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrixId }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Failed to start exam');
        setPhase('error');
        return;
      }
      setAttemptId(data.attemptId);
      setAttemptNumber(data.attemptNumber);
      setQuestions(data.questions || []);
      setAnswers({});
      setCurrentQ(0);
      setResumed(data.resumed || false);
      setPhase(data.attemptNumber === 1 && !data.resumed ? 'intro' : 'exam');
    } catch (e: any) {
      setError(e.message);
      setPhase('error');
    }
  }, [matrixId]);

  useEffect(() => { startExam(); }, [startExam]);

  const handleAnswer = (optionIdx: number) => {
    setAnswers(prev => ({ ...prev, [currentQ]: questions[currentQ].options[optionIdx] }));
  };

  const submitExam = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const answerPayload = questions.map((q, i) => ({
        question: q.question,
        userAnswer: answers[i] || '',
      }));
      const res = await fetch('/api/training/exam/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, answers: answerPayload }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
        setPhase('result');
      } else {
        setError(data.error || 'Submission failed');
        setPhase('error');
      }
    } catch (e: any) {
      setError(e.message);
      setPhase('error');
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = Object.keys(answers).length;
  const progress = questions.length > 0 ? (currentQ / questions.length) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#0c0a1e] border border-indigo-500/20 rounded-3xl w-full max-w-3xl shadow-2xl shadow-indigo-500/10 max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
          <div>
            <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em]">SOP Examination</p>
            <h2 className="text-lg font-black text-white mt-0.5">{sopName}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* LOADING */}
          {phase === 'loading' && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="h-10 w-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              <p className="text-slate-500 font-bold">Preparing your exam…</p>
            </div>
          )}

          {/* ERROR */}
          {phase === 'error' && (
            <div className="flex flex-col items-center justify-center py-20 px-8 gap-4">
              <div className="p-4 bg-rose-500/10 rounded-2xl">
                <AlertTriangle className="h-8 w-8 text-rose-400" />
              </div>
              <p className="text-rose-400 font-bold text-center">{error}</p>
              <button onClick={onClose} className="px-6 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-slate-400 transition-all">
                Close
              </button>
            </div>
          )}

          {/* INTRO */}
          {phase === 'intro' && (
            <div className="p-8 space-y-6">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto">
                  <PlayCircle className="h-8 w-8 text-indigo-400" />
                </div>
                <h3 className="text-xl font-black text-white">Ready to Start?</h3>
                <p className="text-slate-400 text-sm max-w-md mx-auto">
                  Attempt <strong className="text-white">#1</strong> of 5 — answer all <strong className="text-white">{questions.length} questions</strong>.
                  You need <strong className="text-emerald-400">100% (all correct)</strong> to pass and earn your certificate.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Total Questions', value: questions.length, color: 'text-indigo-300' },
                  { label: 'Max Attempts', value: 5, color: 'text-amber-400' },
                  { label: 'Pass Score', value: '100%', color: 'text-emerald-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-center">
                    <p className={`text-2xl font-black ${color}`}>{value}</p>
                    <p className="text-[10px] text-slate-600 uppercase tracking-widest mt-1">{label}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-black text-slate-400 uppercase tracking-widest transition-all">
                  Cancel
                </button>
                <button
                  onClick={() => setPhase('exam')}
                  className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl text-xs font-black text-white uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20"
                >
                  Start Exam
                </button>
              </div>
            </div>
          )}

          {/* EXAM */}
          {phase === 'exam' && questions.length > 0 && (
            <div className="p-6 space-y-5">
              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-slate-500">Question {currentQ + 1} of {questions.length}</span>
                  <span className="text-indigo-400">Attempt #{attemptNumber}</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-300"
                    style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Question */}
              <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5">
                <p className="text-white font-bold text-sm leading-relaxed">
                  {questions[currentQ].question}
                </p>
              </div>

              {/* Options */}
              <div className="space-y-3">
                {questions[currentQ].options.map((opt, idx) => {
                  const selected = answers[currentQ] === opt;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleAnswer(idx)}
                      className={`w-full text-left px-5 py-3.5 rounded-xl border text-sm font-medium transition-all ${
                        selected
                          ? 'bg-indigo-600/25 border-indigo-500/60 text-white font-bold'
                          : 'bg-white/[0.02] border-white/10 text-slate-300 hover:bg-white/[0.05] hover:border-white/20'
                      }`}
                    >
                      <span className={`inline-block w-6 h-6 rounded-lg mr-3 text-center text-xs font-black leading-6 shrink-0 ${
                        selected ? 'bg-indigo-500 text-white' : 'bg-white/10 text-slate-500'
                      }`}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>

              {/* Nav */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setCurrentQ(q => Math.max(0, q - 1))}
                  disabled={currentQ === 0}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  ← Previous
                </button>
                <span className="text-xs text-slate-600 font-bold">
                  {answeredCount}/{questions.length} answered
                </span>
                {currentQ < questions.length - 1 ? (
                  <button
                    onClick={() => setCurrentQ(q => q + 1)}
                    className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 rounded-xl text-xs font-black text-indigo-300 transition-all flex items-center gap-1.5"
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={submitExam}
                    disabled={submitting || answeredCount < questions.length}
                    title={answeredCount < questions.length ? `Please answer all ${questions.length} questions first.` : ''}
                    className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 rounded-xl text-xs font-black text-white transition-all flex items-center gap-2"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Submit Exam
                  </button>
                )}
              </div>

              {/* Question palette */}
              <div className="border-t border-white/5 pt-4">
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2">Question Palette</p>
                <div className="flex flex-wrap gap-1.5">
                  {questions.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentQ(i)}
                      className={`h-7 w-7 rounded-lg text-[10px] font-black transition-all ${
                        i === currentQ
                          ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/40'
                          : answers[i]
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-white/5 text-slate-600 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* RESULT */}
          {phase === 'result' && result && (
            <div className="p-8 space-y-6">
              <div className="text-center space-y-3">
                <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mx-auto ${result.passed ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
                  {result.passed
                    ? <Award className="h-10 w-10 text-emerald-400" />
                    : <XCircle className="h-10 w-10 text-rose-400" />
                  }
                </div>
                <h3 className={`text-2xl font-black ${result.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {result.passed ? '🎉 Passed!' : result.maxedOut ? 'Maximum Attempts Reached' : 'Not Passed Yet'}
                </h3>
                <p className="text-slate-400 text-sm">
                  {result.passed
                    ? 'Congratulations! Your certificate has been auto-generated.'
                    : result.maxedOut
                    ? 'You have used all 5 attempts. Please contact your trainer.'
                    : `${result.attemptsRemaining} attempt${result.attemptsRemaining !== 1 ? 's' : ''} remaining. Only incorrect questions will appear in the next attempt.`
                  }
                </p>
              </div>

              {/* Score display */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-center">
                  <p className="text-3xl font-black text-white">{result.score}%</p>
                  <p className="text-[10px] text-slate-600 uppercase tracking-widest mt-1">Score</p>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 text-center">
                  <p className="text-3xl font-black text-emerald-400">{result.correctCount}</p>
                  <p className="text-[10px] text-slate-600 uppercase tracking-widest mt-1">Correct</p>
                </div>
                <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4 text-center">
                  <p className="text-3xl font-black text-rose-400">{result.wrongCount}</p>
                  <p className="text-[10px] text-slate-600 uppercase tracking-widest mt-1">Incorrect</p>
                </div>
              </div>

              {result.certificateNumber && (
                <div className="flex items-center gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                  <Award className="h-6 w-6 text-amber-400 shrink-0" />
                  <div>
                    <p className="text-amber-400 font-black text-sm">Certificate Generated!</p>
                    <p className="text-slate-500 text-[11px] font-mono mt-0.5">{result.certificateNumber}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { onComplete(); }}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-black text-slate-400 uppercase tracking-widest transition-all"
                >
                  Close
                </button>
                {!result.passed && !result.maxedOut && (
                  <button
                    onClick={startExam}
                    className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl text-xs font-black text-white uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20"
                  >
                    Retry ({result.wrongCount} wrong questions)
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
