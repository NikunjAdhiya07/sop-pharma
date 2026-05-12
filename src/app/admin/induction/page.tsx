'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, Clock, User, ArrowRight, ShieldCheck, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import PageHeader from '@/components/PageHeader';

interface InductionUser {
  _id: string;
  name: string;
  email: string;
  username: string;
  createdAt: string;
  inductionProgress?: {
    completed: boolean;
    videosWatched: string[];
    sopsRead: string[];
  };
}

export default function AdminInductionPage() {
  useAuthGuard({ allowedRoles: ['admin'] });
  const [users, setUsers] = useState<InductionUser[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/induction/users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Failed to fetch users', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleApprove = async (userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to promote ${userName} to Active User?`)) return;

    try {
      const res = await fetch('/api/admin/move-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, newStage: 'active' }),
      });
      
      const data = await res.json();
      if (data.success) {
        alert(`${userName} has been promoted!`);
        fetchUsers(); // Refresh list
      } else {
        alert('Failed to promote user: ' + data.message);
      }
    } catch (error) {
      alert('Error promoting user');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <PageHeader 
            title="Induction Approval" 
            subtitle="Review and promote users who have completed induction training."
            icon={ShieldCheck}
        />

        {loading ? (
             <div className="flex justify-center p-12">
                <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
             </div>
        ) : (
             <div className="grid gap-6">
                {users.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                        <User className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-slate-500 font-medium">No users pending induction approval.</h3>
                    </div>
                ) : (
                    users.map((user) => (
                        <div key={user._id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-md transition-all">
                            <div className="flex items-start gap-4">
                                <div className={`p-3 rounded-xl ${user.inductionProgress?.completed ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                    {user.inductionProgress?.completed ? <CheckCircle className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-bold text-slate-800">{user.name}</h3>
                                        <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full border border-slate-200">
                                            @{user.username}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 text-slate-500 text-sm mt-1">
                                        <Mail className="w-3 h-3" /> {user.email}
                                    </div>
                                    <div className="mt-2 text-xs flex gap-3 text-slate-400">
                                        <span>Joined: {new Date(user.createdAt).toLocaleDateString()}</span>
                                        {user.inductionProgress?.completed && <span className="text-emerald-500 font-bold">Training Complete</span>}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-3 pl-14 md:pl-0">
                                <button
                                    onClick={() => handleApprove(user._id, user.name)}
                                    className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-purple-500/20 active:scale-95"
                                >
                                    Promote to Full User
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
             </div>
        )}
      </div>
    </div>
  );
}
