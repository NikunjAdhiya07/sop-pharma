'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import {
  ChevronLeft, Loader2, CheckCircle2, XCircle, AlertCircle,
  Award, RotateCcw, ChevronRight, Clock, Shield, BookOpenCheck,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
  question: string;
  options: string[];
}

type ExamPhase = 'loading' | 'error' | 'blocked' | 'exam' | 'submitting' | 'result';

interface ResultData {
  score: number;
  correctCount: number;
  wrongCount: number;
  totalQuestions: number;
  passed: boolean;
  maxedOut: boolean;
  attemptsRemaining: number;
  attemptNumber: number;
  certificateNumber?: string;
  wrongQuestions: { question: string; correctAnswer: string; userAnswer: string }[];
}

// ─── Inner Component (reads searchParams) ─────────────────────────────────────

function ExamInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  const sopCode    = searchParams.get('sopCode')    ?? '';
  const employee   = searchParams.get('employee')   ?? '';
  const department = searchParams.get('department') ?? '';
  const monthParam = searchParams.get('month')      ?? '';
  const yearParam  = searchParams.get('year')       ?? '';

  // Exam state
  const [phase,       setPhase]       = useState<ExamPhase>('loading');
  const [errorMsg,    setErrorMsg]    = useState('');
  const [blockedMsg,  setBlockedMsg]  = useState('');
  const [questions,   setQuestions]   = useState<Question[]>([]);
  const [sopName,     setSopName]     = useState('');
  const [monthName,   setMonthName]   = useState('');
  const [monthYear,   setMonthYear]   = useState('');
  const [attemptId,   setAttemptId]   = useState('');
  const [matrixId,    setMatrixId]    = useState('');
  const [attemptNum,  setAttemptNum]  = useState(1);
  const [attemptsLeft, setAttemptsLeft] = useState(5);

  // Answering
  const [currentQ,  setCurrentQ]  = useState(0);
  const [answers,   setAnswers]   = useState<Record<number, string>>({});
  const [result,    setResult]    = useState<ResultData | null>(null);

  // Timer
  const [elapsed,   setElapsed]   = useState(0);
  const [startTime, setStartTime] = useState(0);

  // ── Start / resume exam ────────────────────────────────────────────────────
  const startExam = useCallback(async () => {
    setPhase('loading');
    setErrorMsg('');
    setAnswers({});
    setCurrentQ(0);
    setElapsed(0);
    setStartTime(Date.now());

    try {
      const res  = await fetch('/api/training/exam/self-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeName: employee,
          department,
          sopCode,
          month: monthParam || undefined,
          year:  yearParam  || undefined,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        if (data.alreadyPassed) {
          setBlockedMsg('🎉 You have already passed this exam and earned your certificate!');
          setPhase('blocked');
        } else if (data.maxedOut) {
          setBlockedMsg(`You have used all 5 attempts for ${sopCode}. Please contact your administrator.`);
          setPhase('blocked');
        } else {
          setErrorMsg(data.error || 'Failed to start exam.');
          setPhase('error');
        }
        return;
      }

      setSopName(data.sopName || sopCode);
      setMonthName(data.monthName || '');
      setMonthYear(data.year ? `${data.monthName} ${data.year}` : '');
      setAttemptId(data.attemptId);
      setMatrixId(data.matrixId);
      setAttemptNum(data.attemptNumber);
      setAttemptsLeft(data.attemptsRemaining ?? 0);
      setQuestions(data.questions || []);
      setStartTime(Date.now());
      setPhase('exam');
    } catch (e: any) {
      setErrorMsg(e.message || 'Network error.');
      setPhase('error');
    }
  }, [employee, department, sopCode, monthParam, yearParam]);

  useEffect(() => { startExam(); }, [startExam]);

  // Timer
  useEffect(() => {
    if (phase !== 'exam') return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase, startTime]);

  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setPhase('submitting');
    try {
      const answerPayload = questions.map((q, i) => ({
        question:   q.question,
        userAnswer: answers[i] ?? '',
      }));

      const res  = await fetch('/api/training/exam/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, answers: answerPayload }),
      });
      const data = await res.json();

      if (!data.success) {
        setErrorMsg(data.error || 'Submit failed.');
        setPhase('error');
        return;
      }

      setResult(data);
      setPhase('result');
    } catch (e: any) {
      setErrorMsg(e.message);
      setPhase('error');
    }
  };

  const answered = Object.keys(answers).length;
  const progress = questions.length ? (answered / questions.length) * 100 : 0;
  const q        = questions[currentQ];

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (phase === 'loading') return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center">
      <div className="text-center space-y-3">
        <Loader2 className="h-10 w-10 text-emerald-400 animate-spin mx-auto" />
        <p className="text-slate-400 font-bold text-sm">Preparing exam for <span className="text-white">{sopCode}</span>…</p>
        <p className="text-slate-600 text-xs">Attempt {attemptNum} of 5</p>
      </div>
    </div>
  );

  // ─── Submitting ─────────────────────────────────────────────────────────────
  if (phase === 'submitting') return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center">
      <div className="text-center space-y-3">
        <Loader2 className="h-10 w-10 text-indigo-400 animate-spin mx-auto" />
        <p className="text-slate-400 font-bold text-sm">Grading your answers…</p>
      </div>
    </div>
  );

  // ─── Error ──────────────────────────────────────────────────────────────────
  if (phase === 'error') return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-rose-400 mx-auto" />
        <h2 className="text-xl font-black text-white">Exam Unavailable</h2>
        <p className="text-slate-400 text-sm">{errorMsg}</p>
        <button onClick={() => router.back()}
          className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm transition-all">
          ← Go Back
        </button>
      </div>
    </div>
  );

  // ─── Blocked (already passed / maxed out) ───────────────────────────────────
  if (phase === 'blocked') return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-4">
        <Shield className="h-12 w-12 text-amber-400 mx-auto" />
        <h2 className="text-xl font-black text-white">Access Restricted</h2>
        <p className="text-slate-400 text-sm">{blockedMsg}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => router.push('/sop-training')}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm transition-all">
            ← Back to Training
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Results Screen ─────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    const passed     = result.passed;
    const maxedOut   = result.maxedOut;
    const canRetry   = !passed && !maxedOut && result.attemptsRemaining > 0;

    return (
      <div className="min-h-screen bg-[#020617] text-white">
        {/* Header */}
        <div className="border-b border-white/5 px-6 py-4 flex items-center gap-4"
          style={{ background: 'linear-gradient(135deg,#06011a,#0c0a1e)' }}>
          <button onClick={() => router.push('/sop-training')}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Exam Result — Attempt {result.attemptNumber} of 5</p>
            <p className="font-black text-white">{sopName || sopCode}</p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
          {/* Score Card */}
          <div className={`rounded-3xl p-8 text-center border ${
            passed    ? 'bg-gradient-to-br from-emerald-600/20 to-teal-600/5 border-emerald-500/30'
            : maxedOut ? 'bg-gradient-to-br from-rose-700/20  to-rose-700/5  border-rose-600/30'
            :            'bg-gradient-to-br from-amber-600/15 to-amber-600/5  border-amber-500/25'
          }`}>
            {passed
              ? <Award          className="h-14 w-14 text-emerald-400 mx-auto mb-4" />
              : maxedOut
                ? <XCircle      className="h-14 w-14 text-rose-400   mx-auto mb-4" />
                : <RotateCcw    className="h-14 w-14 text-amber-400  mx-auto mb-4" />
            }
            <p className={`text-6xl font-black mb-2 ${passed ? 'text-emerald-300' : maxedOut ? 'text-rose-300' : 'text-amber-300'}`}>
              {result.score}%
            </p>
            <p className="text-lg font-black text-white mb-1">
              {passed ? '🎉 Passed! Certificate Issued.' : maxedOut ? '❌ Maximum Attempts Reached' : `⚠️ Not Passed — ${result.attemptsRemaining} attempt${result.attemptsRemaining > 1 ? 's' : ''} left`}
            </p>
            <p className="text-slate-400 text-sm">Passing requirement: 100% correct</p>
          </div>

          {/* Certificate Banner */}
          {passed && result.certificateNumber && (
            <div className="flex items-center gap-4 p-5 bg-gradient-to-r from-emerald-600/15 to-teal-600/10 border border-emerald-500/30 rounded-2xl">
              <BookOpenCheck className="h-8 w-8 text-emerald-400 shrink-0" />
              <div>
                <p className="font-black text-emerald-300 text-sm">Certificate Generated Automatically</p>
                <p className="text-xs text-slate-400 mt-0.5">Certificate No: <span className="font-mono font-black text-white">{result.certificateNumber}</span></p>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Score',     value: `${result.score}%`,       color: 'text-indigo-300'  },
              { label: 'Correct',   value: result.correctCount,       color: 'text-emerald-300' },
              { label: 'Incorrect', value: result.wrongCount,         color: 'text-rose-300'    },
              { label: 'Time',      value: fmtTime(elapsed),          color: 'text-violet-300'  },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-center">
                <p className={`text-xl font-black ${color}`}>{value}</p>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Wrong answers review */}
          {result.wrongQuestions.length > 0 && (
            <div className="space-y-3">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                Incorrect Answers {canRetry ? '— Study These Before Retrying' : ''}
              </p>
              {result.wrongQuestions.map((wq, i) => (
                <div key={i} className="p-4 rounded-2xl border bg-rose-500/5 border-rose-500/20">
                  <p className="text-sm font-bold text-white mb-2">{i + 1}. {wq.question}</p>
                  {wq.userAnswer && (
                    <p className="text-xs text-rose-400">Your answer: {wq.userAnswer}</p>
                  )}
                  <p className="text-xs text-emerald-400 mt-0.5">✓ Correct: {wq.correctAnswer}</p>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={() => router.push('/sop-training?tab=start')}
              className="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm transition-all">
              ← Back to Training
            </button>
            {canRetry && (
              <button onClick={startExam}
                className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20">
                <RotateCcw className="h-4 w-4" /> Retry — Wrong Answers Only
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Exam Screen ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#020617] text-white flex flex-col">
      {/* Sticky header */}
      <div className="border-b border-white/5 px-6 py-4 flex items-center justify-between gap-4 sticky top-0 z-10 backdrop-blur-md"
        style={{ background: 'rgba(2,6,23,0.93)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
              {employee} · {department} · {monthYear}
            </p>
            <p className="font-black text-sm text-white truncate max-w-[320px]">
              {sopName || sopCode}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-5 shrink-0">
          {/* Attempt badge */}
          <div className={`px-3 py-1 rounded-full text-[10px] font-black border ${
            attemptNum === 1 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : attemptNum <= 3 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            :                   'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}>
            Attempt {attemptNum}/5
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
            <Clock className="h-3.5 w-3.5" />
            {fmtTime(elapsed)}
          </div>
          <div className="text-xs font-bold text-slate-400">
            {answered}/{questions.length} answered
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-white/5 shrink-0">
        <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
          style={{ width: `${progress}%` }} />
      </div>

      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8 flex flex-col gap-6">
        {/* Question navigator */}
        <div className="flex flex-wrap gap-1.5">
          {questions.map((_, i) => (
            <button key={i} onClick={() => setCurrentQ(i)}
              className={`w-7 h-7 rounded-lg text-[10px] font-black transition-all ${
                i === currentQ
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30'
                  : answers[i]
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-white/5 text-slate-500 hover:bg-white/10'
              }`}>
              {i + 1}
            </button>
          ))}
        </div>

        {/* 100% note */}
        <div className="flex items-center gap-2 p-3 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl text-amber-400 text-xs font-bold">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          You must answer ALL questions correctly (100%) to pass. Up to 5 attempts allowed.
        </div>

        {/* Question card */}
        {q && (
          <div className="bg-white/[0.025] border border-white/5 rounded-3xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-base font-bold text-white leading-relaxed">
                <span className="text-slate-600 font-black mr-2">Q{currentQ + 1}.</span>
                {q.question}
              </p>
            </div>
            <div className="space-y-2.5">
              {q.options.map((option, oi) => (
                <button key={oi} onClick={() => setAnswers(prev => ({ ...prev, [currentQ]: option }))}
                  className={`w-full text-left px-5 py-3.5 rounded-xl border font-bold text-sm transition-all ${
                    answers[currentQ] === option
                      ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-white/[0.02] border-white/[0.06] text-slate-300 hover:bg-white/[0.04] hover:border-white/10 hover:text-white'
                  }`}>
                  <span className="text-slate-600 font-black mr-3">{String.fromCharCode(65 + oi)}.</span>
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between gap-3">
          <button disabled={currentQ === 0} onClick={() => setCurrentQ(p => p - 1)}
            className="px-5 py-2.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded-xl font-bold text-sm transition-all flex items-center gap-2">
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>

          {currentQ < questions.length - 1 ? (
            <button onClick={() => setCurrentQ(p => p + 1)}
              className="px-5 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-sm transition-all flex items-center gap-2">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={handleSubmit}
              disabled={answered < questions.length}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-black text-sm transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20">
              <Award className="h-4 w-4" />
              Submit Exam
              {answered < questions.length && (
                <span className="text-emerald-200 font-medium text-[10px]">
                  ({questions.length - answered} unanswered)
                </span>
              )}
            </button>
          )}
        </div>

        {currentQ === questions.length - 1 && answered < questions.length && (
          <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs font-bold">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {questions.length - answered} question{questions.length - answered > 1 ? 's' : ''} still unanswered.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Outer page (wraps in Suspense for useSearchParams) ───────────────────────

export default function ExamPage() {
  useAuthGuard();
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
      </div>
    }>
      <ExamInner />
    </Suspense>
  );
}
