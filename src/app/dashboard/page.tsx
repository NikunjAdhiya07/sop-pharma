'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Upload, 
  BookOpen, 
  Sparkles, 
  ClipboardCheck, 
  LogOut, 
  User,
  FileText,
  TrendingUp,
  Clock,
  Shield,
  Activity,
  Zap,
  Calendar,
  Database,
  ArrowRight
} from 'lucide-react';
// NotificationBell removed as per requirement

interface UserData {
  id: string;
  username: string;
  name: string;
  role: string;
  trainingStage?: 'induction' | 'active' | 'certified';
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSOPs: 0,
    totalMCQBanks: 0,
    totalQuestions: 0,
    lastActivity: null as string | null
  });

  useEffect(() => {
    // Check if user is logged in
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }

    const fetchStats = async () => {
      try {
        const response = await fetch('/api/dashboard/stats');
        const data = await response.json();
        if (data.success) {
          setStats(data.stats);
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };

    try {
      const parsedUser = JSON.parse(userData);
      setUser(parsedUser);
      fetchStats();
    } catch (error) {
      console.error('Error parsing user data:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const formatLastActivity = (dateStr: string | null) => {
    if (!dateStr) return 'No activity';
    const date = new Date(dateStr);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-white text-xl font-medium">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Handle induction users
  if (user.trainingStage === 'induction') {
    // If we want to strictly redirect:
    // router.replace('/induction');
    // return null; 
    
    // OR if we want to render the induction dashboard component directly here:
    // Ideally we redirect to keep URLs clean
    if (typeof window !== 'undefined') {
       window.location.href = '/induction';
    }
    return null;
  }

  // Permission Check for Quick Actions
  const canManageSOPs = user.role === 'admin' || user.role === 'trainer' || user.role === 'qa-head';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10">
        {/* Header */}
        <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="bg-gradient-to-br from-purple-600 to-pink-600 p-3 rounded-xl shadow-lg shadow-purple-500/50">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent">
                    SOP Pharma Dashboard
                  </h1>
                  <p className="text-sm text-gray-400">AI-Powered MCQ Bank Generator</p>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                
                <div className="flex items-center space-x-3 bg-white/5 rounded-full px-4 py-2 border border-white/10 hover:border-purple-400/30 transition-all">
                  <div className="bg-purple-500/20 p-1.5 rounded-full">
                    <User className="h-4 w-4 text-purple-300" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{user.name}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                      {user.role}
                    </p>
                  </div>
                </div>

                {(user.role === 'admin' || user.role === 'qa-head') && (
                  <Link href="/admin">
                    <button className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors" title="Admin Panel">
                      <Shield className="h-5 w-5" />
                    </button>
                  </Link>
                )}

                <button
                  onClick={handleLogout}
                  className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors"
                  title="Logout"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Welcome Section */}
          <div className="mb-10">
            <h2 className="text-4xl font-bold text-white mb-3 flex items-center">
              Welcome back, {user.name}! 
              <span className="ml-3 text-5xl">👋</span>
            </h2>
            <p className="text-gray-300 text-lg flex items-center">
              <Zap className="h-5 w-5 mr-2 text-yellow-400" />
              Transform your SOPs into high-quality MCQs with AI-powered generation
            </p>
          </div>

          {/* Stats Cards */}
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {[
              { 
                label: 'Total SOPs', 
                value: stats.totalSOPs, 
                sub: 'Active Documents', 
                icon: FileText, 
                color: 'blue',
                link: '/files-manager'
              },
              { 
                label: 'MCQ Banks', 
                value: stats.totalMCQBanks, 
                sub: 'Generated Sets', 
                icon: BookOpen, 
                color: 'purple',
                link: '/mcq-bank' 
              },
              { 
                label: 'Total Questions', 
                value: stats.totalQuestions.toLocaleString(), 
                sub: 'Ready to Deploy', 
                icon: ClipboardCheck, 
                color: 'emerald',
                link: '/mcq-bank' 
              },
              { 
                label: 'Last Activity', 
                value: formatLastActivity(stats.lastActivity), 
                sub: 'System Update', 
                icon: Activity, 
                color: 'pink',
                link: '/mcq-bank',
                isText: true
              },
            ].map((stat, idx) => (
              <Link href={stat.link} key={idx} className="block h-full">
                <div className={`
                  group relative h-full bg-slate-800/40 backdrop-blur-md rounded-2xl p-6 
                  border border-white/5 hover:border-${stat.color}-500/30 
                  transition-all duration-300 hover:bg-slate-800/60 hover:shadow-lg hover:shadow-${stat.color}-500/10
                `}>
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-xl bg-${stat.color}-500/10 text-${stat.color}-400 group-hover:bg-${stat.color}-500/20 transition-colors`}>
                      <stat.icon className="h-6 w-6" />
                    </div>
                    {/* Placeholder Graph/Indicator */}
                    <div className="flex items-center text-emerald-400 text-xs font-medium bg-emerald-500/10 px-2 py-1 rounded-full">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      active
                    </div>
                  </div>
                  <div>
                    <h3 className={`text-3xl font-bold text-white mb-1 ${stat.isText ? 'text-xl' : ''}`}>
                      {stat.value}
                    </h3>
                    <p className="text-sm text-gray-400 font-medium">{stat.label}</p>
                    <p className="text-xs text-gray-500 mt-1">{stat.sub}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Quick Actions - Essential Only (Restricted to Admin/Trainer) */}
          {canManageSOPs && (
            <div className="mb-10">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white flex items-center">
                  <Zap className="h-7 w-7 mr-3 text-purple-400" />
                  Quick Actions
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {/* 1. Upload SOP */}
                <Link href="/sop-upload" className="block group h-full">
                  <div className="h-full bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl p-8 border border-white/10 hover:border-purple-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-purple-500/10 flex flex-col items-start relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-32 bg-purple-500/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-purple-500/10"></div>
                    
                    <div className="bg-purple-500/10 p-4 rounded-xl mb-6 group-hover:scale-110 transition-transform duration-300 border border-purple-500/20">
                      <Upload className="h-8 w-8 text-purple-400" />
                    </div>
                    
                    <h3 className="text-2xl font-bold text-white mb-3">Upload SOP</h3>
                    <p className="text-gray-400 text-sm leading-relaxed mb-8 flex-grow">
                      Upload PDF/DOCX files. AI automatically processes them into learning modules.
                    </p>
                    
                    <div className="flex items-center text-purple-400 font-semibold group-hover:translate-x-2 transition-transform">
                      Start Upload <ArrowRight className="ml-2 h-4 w-4" />
                    </div>
                  </div>
                </Link>

                {/* 2. SOP Library */}
                <Link href="/sop-library" className="block group h-full">
                   <div className="h-full bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl p-8 border border-white/10 hover:border-blue-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/10 flex flex-col items-start relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-32 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-blue-500/10"></div>
                    
                    <div className="bg-blue-500/10 p-4 rounded-xl mb-6 group-hover:scale-110 transition-transform duration-300 border border-blue-500/20">
                      <FileText className="h-8 w-8 text-blue-400" />
                    </div>
                    
                    <h3 className="text-2xl font-bold text-white mb-3">SOP Library</h3>
                    <p className="text-gray-400 text-sm leading-relaxed mb-8 flex-grow">
                      Access your SOPs, view analytics, and manage compliance status.
                    </p>
                    
                    <div className="flex items-center text-blue-400 font-semibold group-hover:translate-x-2 transition-transform">
                      Browse Library <ArrowRight className="ml-2 h-4 w-4" />
                    </div>
                  </div>
                </Link>

                {/* 3. MCQ Bank */}
                <Link href="/mcq-bank" className="block group h-full">
                   <div className="h-full bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl p-8 border border-white/10 hover:border-pink-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-pink-500/10 flex flex-col items-start relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-32 bg-pink-500/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-pink-500/10"></div>
                    
                    <div className="bg-pink-500/10 p-4 rounded-xl mb-6 group-hover:scale-110 transition-transform duration-300 border border-pink-500/20">
                      <BookOpen className="h-8 w-8 text-pink-400" />
                    </div>
                    
                    <h3 className="text-2xl font-bold text-white mb-3">MCQ Bank</h3>
                    <p className="text-gray-400 text-sm leading-relaxed mb-8 flex-grow">
                      Review, edit, and export generated MCQ assessments for training.
                    </p>
                    
                    <div className="flex items-center text-pink-400 font-semibold group-hover:translate-x-2 transition-transform">
                      View Bank <ArrowRight className="ml-2 h-4 w-4" />
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          )}

          {/* Main User Specific Actions (If they don't have manage SOPs) */}
          {!canManageSOPs && (
             <div className="mb-10">
                <h3 className="text-2xl font-bold text-white mb-6">Your Workspace</h3>
                <div className="grid md:grid-cols-3 gap-6">
                    <Link href="/user/profile">
                        <div className="bg-white/10 p-6 rounded-2xl border border-white/20 hover:bg-white/15 transition-all text-white">
                             <User className="w-8 h-8 mb-4 text-purple-400" />
                             <h4 className="text-xl font-bold mb-2">My Profile</h4>
                             <p className="text-sm text-gray-400">View progress and history</p>
                        </div>
                    </Link>
                     <Link href="/user/schedule">
                        <div className="bg-white/10 p-6 rounded-2xl border border-white/20 hover:bg-white/15 transition-all text-white">
                             <Calendar className="w-8 h-8 mb-4 text-emerald-400" />
                             <h4 className="text-xl font-bold mb-2">My Schedule</h4>
                             <p className="text-sm text-gray-400">Upcoming training sessions</p>
                        </div>
                    </Link>
                </div>
             </div>
          )}
        </main>
      </div>
    </div>
  );
}
