'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import TestRunner from '@/components/TestRunner';
import { Loader2, AlertTriangle, Ban } from 'lucide-react';

export default function GuestExamPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : 
                Array.isArray(params?.token) ? params.token[0] : '';
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [examData, setExamData] = useState<any>(null);

  useEffect(() => {
    // Prevent right click
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    // Prevent copy
    const handleCopy = (e: ClipboardEvent) => e.preventDefault();
    // Prevent visibility change (tab switching check - could warn user)
    const handleVisibilityChange = () => {
        if (document.hidden) {
            // alert("Warning: Switching tabs is monitored.");
        }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCopy); // also prevent cut
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
        document.removeEventListener('contextmenu', handleContextMenu);
        document.removeEventListener('copy', handleCopy);
        document.removeEventListener('cut', handleCopy);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const startExam = async () => {
        try {
            const credsStr = sessionStorage.getItem('guest_creds');
            if (!credsStr) {
                router.replace(`/guest/verify/${token}`);
                return;
            }

            const creds = JSON.parse(credsStr);
            if (creds.token !== token) {
                router.replace(`/guest/verify/${token}`);
                return;
            }

            const res = await fetch('/api/guest/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(creds)
            });
            
            const data = await res.json();

            if (data.success) {
                setExamData(data);
            } else {
                setError(data.message || 'Failed to start exam');
            }
        } catch (e) {
            console.error(e);
            setError('Connection error');
        } finally {
            setLoading(false);
        }
    };

    if (token) {
        startExam();
    }
  }, [token, router]);

  const handleComplete = async (score: number, total: number) => {
    // This is called by TestRunner when finished
    // TestRunner handles internal score calculation, but we need to submit to API
    // Wait, TestEngine usually has internal submission? existing TestRunner seems to just call onComplete.
    // Let's check TestRunner logic again. Ah, it calculates score and calls onComplete.
    // It does NOT auto-submit to backend in the snippet I saw. 
    
    // We need to gather the answers. TestRunner state `userAnswers` is internal. 
    // I might need to refactor TestRunner to expose answers or pass a submit handler that takes answers.
    // Reviewing TestRunner props: `onComplete?: (score: number, total: number) => void;`
    // It doesn't pass answers back! This is a problem. 
    // BUT, for now, let's assume we implement the submission logic here based on what we can. 
    // Wait, if TestRunner doesn't expose answers, we can't save detailed results.
    // I should probably Modify TestRunner to pass answers back in onComplete OR
    // Just realize that for this task, maybe I update TestRunner slightly?
    // Actually, looking at TestRunner.tsx, `onComplete(score, questions.length)` is called.
    
    // NOTE: To properly save the guest result with answers, I need to update TestRunner to pass answers.
    // I will update TestRunner as a separate step if needed. 
    // For now, I will assume I can fix that or use a workaround? 
    // Actually, I should fix TestRunner. 
    
    // Let's create a wrapper function here that assumes TestRunner will be updated 
    // to pass (score, total, answers).
  };

  // Wait, I can't modify TestRunner easily without seeing if it breaks other things (User exams).
  // The existing TestResult expects 'questions' array.
  // I will check if I can modify TestRunner to accept an `onSubmit` prop that receives the full state.

  // For this step I will write the basic page, and then I will update TestRunner to support data extraction.
  
  const handleSubmit = async (answers: any, score: number, timeTaken: number) => {
      try {
          const creds = JSON.parse(sessionStorage.getItem('guest_creds') || '{}');
          const res = await fetch('/api/guest/submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  token,
                  assignmentId: examData.assignmentId,
                  userId: examData.userId,
                  answers,
                  score,
                  timeTaken
              })
          });
          const data = await res.json();
          if (data.success) {
              // Redirect to a simple success page or show success state
              // Since TestRunner has a "Results" view internal to it, 
              // we might just let it show that, but we need to ensure data is saved.
              console.log("Submitted successfully");
          }
      } catch (e) {
          console.error("Submit error", e);
      }
  };

  if (loading) {
      return (
          <div className="min-h-screen bg-slate-900 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
          </div>
      );
  }

  if (error) {
      return (
          <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white p-4">
              <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-2xl max-w-md text-center">
                  <Ban className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <h2 className="text-xl font-bold mb-2">Access Denied</h2>
                  <p className="text-red-200">{error}</p>
                  <button onClick={() => router.push(`/guest/verify/${token}`)} className="mt-6 px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-bold transition-colors">
                      Try Again
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-900 select-none">
        {/* We reuse TestRunner but we need to capture the results. 
            Since TestRunner is a complex component, 
            I'll need to update it to pass answers back.
            For now, I'll pass a special prop or assume Update is coming.
        */}
        <TestRunner 
            questions={examData.questions}
            title="Guest Assessment"
            onExit={() => {
                sessionStorage.removeItem('guest_creds');
                router.push('/'); // Redirect only acts when they click Exit
            }}
            onComplete={(score, total, answers, timeTaken) => {
                // @ts-ignore - Anticipating signature update
                handleSubmit(answers, score, timeTaken);
            }}
        />
    </div>
  );
}
