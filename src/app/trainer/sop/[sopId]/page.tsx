'use client';

import { useState, useEffect } from 'react';
import { User, CheckCircle, XCircle, Clock, Calendar } from 'lucide-react';
import { useParams } from 'next/navigation';
import PageHeader from '@/components/PageHeader';

interface TraineeResult {
  id: string;
  user: {
    _id: string;
    name: string;
    email: string;
    department?: string;
  };
  score: number;
  passed: boolean;
  date: string;
}

export default function TrainerSOPDetail() {
  const { sopId } = useParams();
  const [trainees, setTrainees] = useState<TraineeResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const res = await fetch(`/api/trainer/progress/${sopId}`);
        const data = await res.json();
        if (data.success) {
          setTrainees(data.trainees);
        }
      } catch (error) {
        console.error('Failed to fetch trainee progress', error);
      } finally {
        setLoading(false);
      }
    };
    if (sopId) fetchProgress();
  }, [sopId]);

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <PageHeader 
            title="Trainee Progress"
            subtitle="Tracking results for assigned SOP."
            icon={User}
        />

        {loading ? (
             <div className="flex justify-center p-12">
                <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
             </div>
        ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Trainee</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Department</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Result</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Score</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {trainees.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                        No trainees have attempted this SOP yet.
                                    </td>
                                </tr>
                            ) : (
                                trainees.map((result) => (
                                    <tr key={result.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-xs">
                                                    {result.user.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-slate-800">{result.user.name}</p>
                                                    <p className="text-xs text-slate-500">{result.user.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {result.user.department || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4">
                                            {result.passed ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                                                    <CheckCircle className="w-3 h-3" /> Passed
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                                    <XCircle className="w-3 h-3" /> Failed
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm font-bold text-slate-700">
                                            {result.score}%
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-500">
                                            {new Date(result.date).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
