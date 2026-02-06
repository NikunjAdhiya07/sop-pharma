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
  BarChart3,
  Zap,
  Calendar,
  Database
} from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';

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

              <div className="flex items-center space-x-3">
                <NotificationBell userId={user.id} />
                
                <div className="flex items-center space-x-3 bg-white/10 rounded-xl px-4 py-2.5 border border-white/20 hover:border-purple-400/50 transition-all">
                  <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-2 rounded-lg shadow-lg">
                    <User className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{user.name}</p>
                    <p className="text-xs text-gray-400 flex items-center">
                      <Shield className="h-3 w-3 mr-1" />
                      {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                    </p>
                  </div>
                </div>

                {(user.role === 'admin' || user.role === 'qa-head') && (
                  <Link href="/admin">
                    <button className="flex items-center space-x-2 bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 text-purple-200 px-4 py-2.5 rounded-xl border border-purple-500/50 transition-all transform hover:scale-105 hover:shadow-lg hover:shadow-purple-500/20">
                      <Shield className="h-5 w-5" />
                      <span className="font-medium">Admin Panel</span>
                    </button>
                  </Link>
                )}

                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 px-4 py-2.5 rounded-xl border border-red-500/50 transition-all transform hover:scale-105 hover:shadow-lg hover:shadow-red-500/20"
                >
                  <LogOut className="h-5 w-5" />
                  <span className="font-medium">Logout</span>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            <Link href="/files-manager" className="block">
              <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:border-purple-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/10 group cursor-pointer h-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                    <FileText className="h-7 w-7 text-white" />
                  </div>
                  <div className="flex items-center space-x-1 text-green-400">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-xs font-semibold">+12%</span>
                  </div>
                </div>
                <p className="text-gray-400 text-sm font-medium mb-1">Total SOPs</p>
                <p className="text-4xl font-bold text-white mb-1">{stats.totalSOPs}</p>
                <p className="text-xs text-gray-500">Active documents</p>
              </div>
            </Link>

            <Link href="/mcq-bank" className="block">
              <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:border-pink-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-pink-500/10 group cursor-pointer h-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-gradient-to-br from-pink-500 to-pink-600 p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                    <BookOpen className="h-7 w-7 text-white" />
                  </div>
                  <div className="flex items-center space-x-1 text-green-400">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-xs font-semibold">+8%</span>
                  </div>
                </div>
                <p className="text-gray-400 text-sm font-medium mb-1">MCQ Banks</p>
                <p className="text-4xl font-bold text-white mb-1">{stats.totalMCQBanks}</p>
                <p className="text-xs text-gray-500">Generated banks</p>
              </div>
            </Link>

            <Link href="/mcq-bank" className="block">
              <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:border-emerald-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/10 group cursor-pointer h-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                    <ClipboardCheck className="h-7 w-7 text-white" />
                  </div>
                  <div className="flex items-center space-x-1 text-green-400">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-xs font-semibold">+24%</span>
                  </div>
                </div>
                <p className="text-gray-400 text-sm font-medium mb-1">Total Questions</p>
                <p className="text-4xl font-bold text-white mb-1">{stats.totalQuestions.toLocaleString()}</p>
                <p className="text-xs text-gray-500">Ready to use</p>
              </div>
            </Link>

            <Link href="/mcq-bank" className="block">
              <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:border-blue-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/10 group cursor-pointer h-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                    <Activity className="h-7 w-7 text-white" />
                  </div>
                  <Clock className="h-5 w-5 text-gray-400" />
                </div>
                <p className="text-gray-400 text-sm font-medium mb-1">Last Activity</p>
                <p className="text-2xl font-bold text-white mb-1 truncate">{formatLastActivity(stats.lastActivity)}</p>
                <p className="text-xs text-gray-500">MCQ generation</p>
              </div>
            </Link>
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
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Link href="/sop-upload">
                  <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20 hover:border-purple-500 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/20 cursor-pointer group h-full">
                    <div className="flex items-center mb-6">
                      <div className="bg-gradient-to-br from-purple-600 to-pink-600 p-4 rounded-xl mr-4 group-hover:scale-110 transition-transform shadow-lg shadow-purple-500/50">
                        <Upload className="h-8 w-8 text-white" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">Upload SOP</h2>
                    </div>
                    <p className="text-gray-300 text-base mb-6 leading-relaxed">
                      Upload your SOP documents and let AI generate comprehensive MCQ banks automatically.
                    </p>
                    <ul className="space-y-3 text-gray-400">
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-purple-400 rounded-full mr-3 group-hover:animate-pulse"></span>
                        <span className="text-sm">PDF & DOCX support</span>
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-purple-400 rounded-full mr-3 group-hover:animate-pulse"></span>
                        <span className="text-sm">AI-powered generation</span>
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-purple-400 rounded-full mr-3 group-hover:animate-pulse"></span>
                        <span className="text-sm">Instant processing</span>
                      </li>
                    </ul>
                  </div>
                </Link>

                <Link href="/sop-library">
                  <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20 hover:border-blue-500 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/20 cursor-pointer group h-full">
                    <div className="flex items-center mb-6">
                      <div className="bg-gradient-to-br from-blue-600 to-cyan-600 p-4 rounded-xl mr-4 group-hover:scale-110 transition-transform shadow-lg shadow-blue-500/50">
                        <FileText className="h-8 w-8 text-white" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">SOP Library</h2>
                    </div>
                    <p className="text-gray-300 text-base mb-6 leading-relaxed">
                      Browse and manage your SOP documents. Access monitoring and tracking features.
                    </p>
                    <ul className="space-y-3 text-gray-400">
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-blue-400 rounded-full mr-3 group-hover:animate-pulse"></span>
                        <span className="text-sm">View all SOPs</span>
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-blue-400 rounded-full mr-3 group-hover:animate-pulse"></span>
                        <span className="text-sm">Download documents</span>
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-blue-400 rounded-full mr-3 group-hover:animate-pulse"></span>
                        <span className="text-sm">SOP monitoring</span>
                      </li>
                    </ul>
                  </div>
                </Link>

                <Link href="/sop-compliance-sync">
                  <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20 hover:border-green-500 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-2xl hover:shadow-green-500/20 cursor-pointer group h-full">
                    <div className="flex items-center mb-6">
                      <div className="bg-gradient-to-br from-green-600 to-emerald-600 p-4 rounded-xl mr-4 group-hover:scale-110 transition-transform shadow-lg shadow-green-500/50">
                        <Database className="h-8 w-8 text-white" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">SOP Compliance Sync</h2>
                    </div>
                    <p className="text-gray-300 text-base mb-6 leading-relaxed">
                      Upload department files to sync SOP compliance dates and track review schedules.
                    </p>
                    <ul className="space-y-3 text-gray-400">
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-green-400 rounded-full mr-3 group-hover:animate-pulse"></span>
                        <span className="text-sm">Auto date extraction</span>
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-green-400 rounded-full mr-3 group-hover:animate-pulse"></span>
                        <span className="text-sm">Smart SOP matching</span>
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-green-400 rounded-full mr-3 group-hover:animate-pulse"></span>
                        <span className="text-sm">Instant monitoring sync</span>
                      </li>
                    </ul>
                  </div>
                </Link>

                <Link href="/mcq-bank">
                  <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20 hover:border-pink-500 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-2xl hover:shadow-pink-500/20 cursor-pointer group h-full">
                    <div className="flex items-center mb-6">
                      <div className="bg-gradient-to-br from-pink-600 to-purple-600 p-4 rounded-xl mr-4 group-hover:scale-110 transition-transform shadow-lg shadow-pink-500/50">
                        <BookOpen className="h-8 w-8 text-white" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">MCQ Bank</h2>
                    </div>
                    <p className="text-gray-300 text-base mb-6 leading-relaxed">
                      Browse, filter, and export your generated MCQ banks. All questions are ready for use.
                    </p>
                    <ul className="space-y-3 text-gray-400">
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-pink-400 rounded-full mr-3 group-hover:animate-pulse"></span>
                        <span className="text-sm">View all MCQ banks</span>
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-pink-400 rounded-full mr-3 group-hover:animate-pulse"></span>
                        <span className="text-sm">Export to JSON</span>
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-pink-400 rounded-full mr-3 group-hover:animate-pulse"></span>
                        <span className="text-sm">Advanced filtering</span>
                      </li>
                    </ul>
                  </div>
                </Link>

                <Link href="/sop-date-sync">
                  <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20 hover:border-orange-500 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-2xl hover:shadow-orange-500/20 cursor-pointer group h-full">
                    <div className="flex items-center mb-6">
                      <div className="bg-gradient-to-br from-orange-600 to-amber-600 p-4 rounded-xl mr-4 group-hover:scale-110 transition-transform shadow-lg shadow-orange-500/50">
                        <Calendar className="h-8 w-8 text-white" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">Date Sync</h2>
                    </div>
                    <p className="text-gray-300 text-base mb-6 leading-relaxed">
                      Upload SOP folders to extract dates and sync with monitoring automatically.
                    </p>
                    <ul className="space-y-3 text-gray-400">
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-orange-400 rounded-full mr-3 group-hover:animate-pulse"></span>
                        <span className="text-sm">Auto date extraction</span>
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-orange-400 rounded-full mr-3 group-hover:animate-pulse"></span>
                        <span className="text-sm">Bulk folder upload</span>
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-orange-400 rounded-full mr-3 group-hover:animate-pulse"></span>
                        <span className="text-sm">Monitoring sync</span>
                      </li>
                    </ul>
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
