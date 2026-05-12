'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { 
  CheckCircle2, AlertCircle, ChevronRight, 
  ArrowLeft, BrainCircuit, Timer, Award,
  XCircle, RotateCcw, Home
} from 'lucide-react';

interface Question {
  question: string;
  options: string[];
  correctAnswer: string;
}

interface Session {
  _id: string;
  employeeName: string;
  sopIdentifier: string;
  sopName: string;
  questions: Question[];
  status: string;
  isRetest: boolean;
  attemptNumber: number;
}

export default function TestExecutionPage() {
  useAuthGuard();
  const { sessionId } = useParams();
  const router = useRouter();
  
  const [session, setSession] = useState<Session | null>(null);
  const [answers, setAnswers] = useState<{ [key: number]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    isPassed: boolean;
    score: number;
    correctCount: number;
    totalCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch(`/api/training/session?id=${sessionId}`);
        const json = await res.json();
        if (json.success) {
          setSession(json.data);
          if (json.data.status === 'Completed' || json.data.status === 'Re-test Required') {
            // If already done, show results logic could be here
            // But for now let's assume valid session
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchSession();
  }, [sessionId]);

  const handleSubmit = async () => {
    if (Object.keys(answers).length < (session?.questions.length || 0)) {
      if (!confirm('You have not answered all questions. Submit anyway?')) return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/training/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, answers })
      });
      const json = await res.json();
      if (json.success) {
        setResult(json);
      }
    } catch (e) {
      alert('Error submitting test');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetest = async () => {
    try {
      const res = await fetch('/api/training/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentSessionId: sessionId })
      });
      const json = await res.json();
      if (json.success) {
        router.push(`/training/test/${json.sessionId}`);
        // Reset state for new session
        setResult(null);
        setAnswers({});
      }
    } catch (e) {
      alert('Error creating retest');
    }
  };

  if (loading) return <LoadingState />;
  if (!session) return <ErrorState />;

  if (result) return (
    <ResultView 
      result={result} 
      session={session} 
      onRetest={handleRetest} 
      onBack={() => router.push('/training')} 
    />
  );

  return (
    <div className="min-h-screen bg-[#020617] text-white p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white/5 border border-white/10 p-8 rounded-[2.5rem] backdrop-blur-xl">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="px-4 py-1.5 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-full text-[10px] font-black uppercase tracking-widest">
                {session.isRetest ? `Re-test Attempt #${session.attemptNumber}` : 'Standard Evaluation'}
              </span>
              <span className="text-slate-500 font-bold font-mono text-xs">{session.sopIdentifier}</span>
            </div>
            <h1 className="text-3xl font-black text-white leading-tight">{session.sopName}</h1>
            <p className="text-slate-400 font-bold flex items-center gap-2">
              <Award className="h-4 w-4 text-indigo-400" />
              Candidate: <span className="text-white uppercase tracking-tight">{session.employeeName}</span>
            </p>
          </div>
          
          <div className="flex flex-row md:flex-col items-center gap-4">
             <div className="bg-white/5 border border-white/10 px-6 py-4 rounded-2xl text-center">
                <p className="text-[10px] uppercase font-black text-slate-500 tracking-widest mb-1">Questions</p>
                <p className="text-2xl font-black text-white">{session.questions.length}</p>
             </div>
             <div className="bg-indigo-500/10 border border-indigo-500/20 px-6 py-4 rounded-2xl text-center">
                <p className="text-[10px] uppercase font-black text-indigo-400 tracking-widest mb-1">Progress</p>
                <p className="text-2xl font-black text-white">{Object.keys(answers).length}/{session.questions.length}</p>
             </div>
          </div>
        </div>

        {/* Questions */}
        <div className="space-y-8">
          {session.questions.map((q, idx) => (
            <div key={idx} className="bg-white/[0.03] border border-white/5 rounded-[2rem] overflow-hidden">
              <div className="px-8 py-4 bg-white/5 border-b border-white/5 flex justify-between items-center text-xs font-bold text-slate-500 uppercase tracking-widest">
                <span>Question {idx + 1}</span>
                {answers[idx] && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              </div>
              <div className="p-8 space-y-8">
                <h3 className="text-xl font-bold text-white leading-relaxed">{q.question}</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {q.options.map((opt, oIdx) => (
                    <button
                      key={oIdx}
                      onClick={() => setAnswers(prev => ({ ...prev, [idx]: opt }))}
                      className={`group relative p-6 rounded-2xl text-left font-bold transition-all border ${
                        answers[idx] === opt
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl shadow-indigo-600/30'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black transition-all ${
                          answers[idx] === opt ? 'bg-white text-indigo-600 shadow-lg' : 'bg-white/10 text-slate-500 group-hover:text-slate-300'
                        }`}>
                          {String.fromCharCode(65 + oIdx)}
                        </div>
                        <span className="flex-1">{opt}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Submit Bar */}
        <div className="sticky bottom-8 left-0 right-0 z-10 flex justify-center">
          <div className="bg-indigo-600 hover:bg-indigo-500 p-1.5 rounded-[2rem] shadow-2xl shadow-indigo-600/50 flex transition-all">
            <button
               onClick={handleSubmit}
               disabled={isSubmitting}
               className="flex items-center gap-3 px-10 py-5 bg-white text-indigo-600 rounded-[1.8rem] font-black text-md shadow-inner transition-all hover:px-12 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="h-5 w-5 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
                  SUBMITTING...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  SUBMIT TRAINING EVALUATION
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultView({ result, session, onRetest, onBack }: any) {
  return (
    <div className="min-h-screen bg-[#020617] text-white flex items-center justify-center p-6">
      <div className="max-w-xl w-full bg-white/5 border border-white/10 p-12 rounded-[3rem] backdrop-blur-2xl shadow-2xl shadow-black text-center space-y-10 relative overflow-hidden">
        {/* Glow effect */}
        <div className={`absolute -top-20 -left-20 w-40 h-40 blur-[100px] rounded-full ${result.isPassed ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        
        <div className="space-y-4 relative z-10">
          <div className="flex justify-center">
            <div className={`h-24 w-24 rounded-3xl flex items-center justify-center ${
              result.isPassed ? 'bg-emerald-500 shadow-2xl shadow-emerald-500/40 text-white' : 'bg-rose-500 shadow-2xl shadow-rose-500/40 text-white'
            }`}>
              {result.isPassed ? <Award className="h-12 w-12" /> : <AlertCircle className="h-12 w-12" />}
            </div>
          </div>
          
          <div className="space-y-2">
            <h2 className="text-4xl font-black">{result.isPassed ? 'Success!' : 'Re-test Required'}</h2>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">
              {result.isPassed ? 'SOP Compliance Training Completed' : 'Training criteria not met'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
             <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Score</p>
             <p className={`text-3xl font-black ${result.isPassed ? 'text-emerald-400' : 'text-rose-400'}`}>{Math.round(result.score)}%</p>
          </div>
          <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
             <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Accuracy</p>
             <p className="text-3xl font-black text-white">{result.correctCount}/{result.totalCount}</p>
          </div>
        </div>

        <div className="p-8 bg-black/40 rounded-3xl border border-white/5 text-left space-y-4">
          <p className="text-xs font-bold text-slate-400">
            {result.isPassed 
              ? 'Congratulations! You have successfully completed the training for this SOP. Your digital acknowledgment has been recorded.' 
              : `You only answered ${result.correctCount} out of ${result.totalCount} questions correctly. To pass, you must answer ALL questions correctly. A re-test has been prepared focusing only on your incorrect answers.`}
          </p>
          {result.isPassed && (
            <div className="flex items-center gap-3 text-emerald-400 font-black text-[10px] uppercase tracking-wider">
               <CheckCircle2 className="h-4 w-4" />
               Stored as completion record in training matrix
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {!result.isPassed && (
            <button 
              onClick={onRetest}
              className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-black flex items-center justify-center gap-3 transition-all shadow-xl shadow-indigo-600/20"
            >
              <RotateCcw className="h-5 w-5" />
              GENERATE RE-TEST NOW
            </button>
          )}
          <button 
            onClick={onBack}
            className="w-full py-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black flex items-center justify-center gap-3 transition-all text-slate-300"
          >
            <Home className="h-5 w-5" />
            BACK TO DASHBOARD
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
     <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="text-center space-y-6">
           <div className="h-16 w-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto" />
           <p className="text-lg font-black text-slate-500 uppercase tracking-[0.3em]">Loading Evaluation...</p>
        </div>
     </div>
  );
}

function ErrorState() {
  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6">
       <div className="text-center space-y-6 max-w-sm">
          <XCircle className="h-16 w-16 text-rose-500 mx-auto" />
          <h2 className="text-2xl font-black text-white">Session Not Found</h2>
          <p className="text-slate-400 font-bold">The test session you are looking for does not exist or has expired.</p>
          <button onClick={() => window.location.href = '/training'} className="w-full py-4 bg-indigo-600 rounded-xl font-bold">Go Back</button>
       </div>
    </div>
  );
}
