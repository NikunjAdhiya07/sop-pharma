'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { 
  Users, 
  Calendar, 
  BarChart3, 
  ClipboardList, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight,
  Search,
  Filter,
  ArrowLeft,
  ArrowUpRight,
  TrendingUp,
  LayoutDashboard,
  Bell,
  MoreVertical,
  Plus,
  BookOpen,
  PieChart,
  UserCheck,
  UserX,
  ShieldCheck,
  GraduationCap,
  Sparkles,
  Zap,
  User,
  LogOut,
  Shield,
  Activity
} from 'lucide-react';

interface UserData {
  id: string;
  username: string;
  name: string;
  role: string;
}

interface TraineeProgress {
  _id: string;
  name: string;
  username: string;
  department: string;
  testsAssigned: number;
  testsCompleted: number;
  averageScore: number;
  lastTestDate: string | null;
  status: 'active' | 'pending' | 'overdue';
}

interface TestAssignment {
  _id: string;
  testName: string;
  testType: string;
  userId: {
    _id: string;
    name: string;
  };
  sopIds?: Array<{ _id: string; name: string; identifier: string }>;
  assignedAt: string;
  deadline?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'overdue';
  score?: number;
}

export default function SOPScheduler() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'roster' | 'tasks' | 'analytics'>('overview');
  const [trainees, setTrainees] = useState<TraineeProgress[]>([]);
  const [assignments, setAssignments] = useState<TestAssignment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }

    try {
      const parsedUser = JSON.parse(userData);
      setCurrentUser(parsedUser);
      fetchData();
    } catch (error) {
      console.error('Error parsing user data:', error);
      router.push('/login');
    }
  }, [router]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersRes, assignmentsRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/assignments'),
      ]);

      const usersData = await usersRes.json();
      const assignmentsData = await assignmentsRes.json();

      if (usersData.success) {
        const traineesList = usersData.users.map((u: any) => ({
          _id: u._id,
          name: u.name,
          username: u.username,
          department: u.department || 'General',
          testsAssigned: u.testsAssigned || 0,
          testsCompleted: u.testsCompleted || 0,
          averageScore: u.averageScore || 0,
          lastTestDate: u.recentResults?.[0]?.completedAt || null,
          status: u.testsAssigned > u.testsCompleted ? 'pending' : 'active'
        }));
        setTrainees(traineesList);
      }

      if (assignmentsData.success) {
        setAssignments(assignmentsData.assignments);
      }
    } catch (error) {
      console.error('Error fetching scheduler data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    router.push('/login');
  };

  const isSupervisor = currentUser?.role === 'admin' || currentUser?.role === 'trainer';

  const filteredTrainees = useMemo(() => {
    return trainees.filter(t => 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.department.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [trainees, searchQuery]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter(a => 
      a.testName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.userId?.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [assignments, searchQuery]);

  if (loading || !currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-white text-xl font-medium">Initializing SOP Scheduler...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-slate-200">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 bg-white/5 backdrop-blur-2xl border-r border-white/10 flex flex-col transition-all duration-300">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-10 group cursor-pointer" onClick={() => router.push('/dashboard')}>
              <div className="bg-gradient-to-br from-purple-600 to-pink-600 p-2.5 rounded-xl shadow-lg shadow-purple-500/30 group-hover:scale-110 transition-transform">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent">SOP Scheduler</h1>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Training Core</p>
              </div>
            </div>

            <nav className="space-y-1.5">
              <SidebarItem 
                icon={<LayoutDashboard className="w-5 h-5" />} 
                label="Overview" 
                active={activeTab === 'overview'} 
                onClick={() => setActiveTab('overview')} 
              />
              <SidebarItem 
                icon={<Users className="w-5 h-5" />} 
                label="User Roster" 
                active={activeTab === 'roster'} 
                onClick={() => setActiveTab('roster')} 
              />
              <SidebarItem 
                icon={<ClipboardList className="w-5 h-5" />} 
                label="Task Allocation" 
                active={activeTab === 'tasks'} 
                onClick={() => setActiveTab('tasks')} 
              />
              <SidebarItem 
                icon={<BarChart3 className="w-5 h-5" />} 
                label="Analytics" 
                active={activeTab === 'analytics'} 
                onClick={() => setActiveTab('analytics')} 
              />
            </nav>
          </div>

          <div className="mt-auto p-6 space-y-4">
            <button 
              onClick={() => router.push('/dashboard')}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium transition-all group border border-white/10 text-white"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              Back to Apps
            </button>
            
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-4 border border-white/10">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold border border-white/20 shadow-lg">
                  {currentUser.name.charAt(0)}
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-bold text-white truncate">{currentUser.name}</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest flex items-center">
                    <Shield className="w-3 h-3 mr-1" />
                    {currentUser.role}
                  </p>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-bold transition-all border border-red-500/20"
              >
                <LogOut className="w-3 h-3" />
                Sign Out
              </button>
            </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Navigation */}
          <div className="px-8 pt-4">
            <PageHeader />
          </div>

          {/* Header */}
          <header className="h-20 border-b border-white/10 flex items-center justify-between px-8 bg-white/5 backdrop-blur-xl sticky top-0 z-50">
            <div className="flex items-center gap-4 flex-1 max-w-xl">
              <div className="relative w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search trainees, SOPs, or tasks..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all text-white placeholder-gray-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-200 text-xs font-bold">
                <Zap className="w-4 h-4" />
                Live Training Data
              </div>
              <button className="relative p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/10 group">
                <Bell className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-slate-900"></span>
              </button>
              <div className="h-8 w-[1px] bg-white/10 mx-2"></div>
              {isSupervisor && (
                <button 
                  onClick={() => router.push('/admin?tab=assignments')}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all shadow-lg shadow-purple-600/30 active:scale-95 border border-white/10"
                >
                  <Plus className="w-4 h-4" />
                  New Assignment
                </button>
              )}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative">
            {activeTab === 'overview' && (
              <OverviewTab 
                trainees={trainees} 
                assignments={assignments} 
                isSupervisor={isSupervisor}
                currentUser={currentUser}
                router={router}
                onTabChange={setActiveTab}
              />
            )}
            {activeTab === 'roster' && (
              <RosterTab trainees={filteredTrainees} />
            )}
            {activeTab === 'tasks' && (
              <TasksTab assignments={filteredAssignments} isSupervisor={isSupervisor} currentUser={currentUser} router={router} />
            )}
            {activeTab === 'analytics' && (
              <AnalyticsTab trainees={trainees} assignments={assignments} />
            )}
          </div>
        </main>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
        active 
          ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-200 border border-purple-500/30' 
          : 'text-gray-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      <div className={active ? "text-purple-400" : "text-gray-400"}>
        {icon}
      </div>
      <span className="text-sm">{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-500 shadow-sm shadow-purple-500"></div>}
    </button>
  );
}

function OverviewTab({ trainees, assignments, isSupervisor, currentUser, router, onTabChange }: any) {
  const stats = useMemo(() => {
    if (!isSupervisor) {
      const myAssignments = assignments.filter((a: any) => a.userId?._id === currentUser?.id);
      const completed = myAssignments.filter((a: any) => a.status === 'completed').length;
      const total = myAssignments.length || 1;
      const myTrainee = trainees.find((t: any) => t._id === currentUser?.id);
      
      return {
        label1: "My Courses",
        value1: total.toString(),
        label2: "Completion",
        value2: `${Math.round((completed / total) * 100)}%`,
        label3: "Avg Score",
        value3: `${myTrainee?.averageScore || 0}%`,
        label4: "Pending",
        value4: (total - completed).toString(),
        color1: "purple",
        color2: "emerald",
        color3: "blue",
        color4: "pink"
      };
    }

    return {
      label1: "Total Trainees",
      value1: trainees.length.toString(),
      label2: "Global Completion",
      value2: `${Math.round((assignments.filter((a: any) => a.status === 'completed').length / (assignments.length || 1)) * 100)}%`,
      label3: "Average Score",
      value3: `${Math.round(trainees.reduce((acc: number, t: any) => acc + (t.averageScore || 0), 0) / (trainees.length || 1))}%`,
      label4: "Overdue Tasks",
      value4: assignments.filter((a: any) => a.status === 'overdue').length.toString(),
      color1: "purple",
      color2: "emerald",
      color3: "blue",
      color4: "pink"
    };
  }, [trainees, assignments, isSupervisor, currentUser]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">
            {isSupervisor ? "Performance Overview" : "My Learning Dashboard"}
          </h2>
          <p className="text-gray-400 text-sm mt-1">Real-time statistics and training progress</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400 bg-white/5 px-4 py-2 rounded-lg border border-white/10 backdrop-blur-md">
          <Clock className="w-4 h-4 text-purple-400" />
          Last updated: Just now
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard icon={<Users className="w-5 h-5" />} label={stats.label1} value={stats.value1} trend="+12% this month" color={stats.color1} />
        <StatCard icon={<CheckCircle2 className="w-5 h-5" />} label={stats.label2} value={stats.value2} trend="+5% increase" color={stats.color2} />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label={stats.label3} value={stats.value3} trend="Top percentile" color={stats.color3} />
        <StatCard icon={<AlertCircle className="w-5 h-5" />} label={stats.label4} value={stats.value4} trend="Action required" color={stats.color4} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-2xl overflow-hidden relative group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          <div className="flex items-center justify-between mb-8 relative z-10">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              {isSupervisor ? "Top Performing Trainees" : "My Recent Results"}
            </h3>
            <button onClick={() => onTabChange(isSupervisor ? 'roster' : 'analytics')} className="text-sm font-semibold text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1 group/btn">
              View All <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
            </button>
          </div>
          <div className="space-y-3 relative z-10">
            {isSupervisor ? (
              trainees.sort((a: any, b: any) => b.averageScore - a.averageScore).slice(0, 5).map((trainee: any) => (
                <div key={trainee._id} className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all cursor-pointer group/item">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center font-bold text-lg text-white group-hover/item:scale-105 transition-transform">
                      {trainee.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-white group-hover/item:text-purple-300 transition-colors">{trainee.name}</h4>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{trainee.department}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-purple-400">{trainee.averageScore}%</p>
                  </div>
                </div>
              ))
            ) : (
              assignments.filter((a: any) => a.userId?._id === currentUser?.id && a.status === 'completed').slice(0, 5).map((a: any) => (
                <div key={a._id} className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all group/item">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                      <GraduationCap className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white uppercase tracking-tight truncate max-w-[200px]">{a.testName}</h4>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{new Date(a.assignedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-emerald-400">{a.score}%</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-2xl relative overflow-hidden group">
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-pink-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
          <div className="flex items-center justify-between mb-8 relative z-10">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-pink-500" />
              {isSupervisor ? "Urgent Assessments" : "Upcoming Deadlines"}
            </h3>
            <button onClick={() => onTabChange('tasks')} className="text-sm font-semibold text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1 group/btn">
              Full Schedule <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
            </button>
          </div>
          <div className="space-y-4 relative z-10">
            {assignments
              .filter((a: any) => (!isSupervisor ? a.userId?._id === currentUser?.id : true) && a.status !== 'completed')
              .sort((a: any, b: any) => new Date(a.deadline || 0).getTime() - new Date(b.deadline || 0).getTime())
              .slice(0, 4)
              .map((assignment: any) => (
                <div key={assignment._id} className="p-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all group/task">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                      assignment.status === 'overdue' ? 'bg-red-500 text-white' : 'bg-yellow-500 text-black'
                    }`}>
                      {assignment.status}
                    </span>
                    <span className="text-[10px] font-bold text-gray-500 uppercase">
                      {assignment.deadline ? `Due: ${new Date(assignment.deadline).toLocaleDateString()}` : 'No Deadline'}
                    </span>
                  </div>
                  <h4 className="font-bold text-white mb-1 group-hover/task:text-purple-300 transition-colors truncate">{assignment.testName}</h4>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <p className="flex items-center gap-1.5 font-medium">
                      <User className="w-3 h-3" /> {assignment.userId?.name}
                    </p>
                    <ArrowUpRight className="w-4 h-4 text-gray-700 group-hover/task:text-purple-400 group-hover/task:-translate-y-0.5 group-hover/task:translate-x-0.5 transition-all" />
                  </div>
                </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, trend, color }: { icon: React.ReactNode, label: string, value: string, trend: string, color: string }) {
  const colors: any = {
    purple: 'from-purple-500/20 to-purple-500/5 text-purple-400 border-purple-500/20 hover:border-purple-400',
    emerald: 'from-emerald-500/20 to-emerald-500/5 text-emerald-400 border-emerald-500/20 hover:border-emerald-400',
    pink: 'from-pink-500/20 to-pink-500/5 text-pink-400 border-pink-500/20 hover:border-pink-400',
    blue: 'from-blue-500/20 to-blue-500/5 text-blue-400 border-blue-500/20 hover:border-blue-400',
  };

  const bgGradients: any = {
    purple: 'from-purple-500 to-purple-600',
    emerald: 'from-emerald-500 to-emerald-600',
    pink: 'from-pink-500 to-pink-600',
    blue: 'from-blue-500 to-blue-600',
  };

  return (
    <div className={`bg-gradient-to-br ${colors[color]} backdrop-blur-xl p-6 rounded-3xl border border-white/10 shadow-xl transition-all duration-300 transform hover:scale-[1.02] group`}>
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-xl bg-gradient-to-br ${bgGradients[color]} text-white shadow-lg shadow-${color}-500/30 group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
        <div className="flex items-center space-x-1 text-green-400">
          <TrendingUp className="h-4 w-4" />
          <span className="text-[10px] font-black uppercase">Growth</span>
        </div>
      </div>
      <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">{label}</p>
      <h3 className="text-4xl font-black text-white tracking-tighter">{value}</h3>
      <div className="text-[10px] font-bold text-gray-500 mt-4 flex items-center gap-1.5 bg-white/5 py-1 px-2 rounded-lg w-fit">
        <span className={`w-1.5 h-1.5 rounded-full ${color === 'purple' ? 'bg-purple-500' : color === 'pink' ? 'bg-pink-500' : 'bg-green-500'} animate-pulse`}></span>
        {trend}
      </div>
    </div>
  );
}

function RosterTab({ trainees }: { trainees: TraineeProgress[] }) {
  return (
    <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">User Roster</h2>
          <p className="text-gray-400 text-sm mt-1">Manage competency and track personnel training status</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-400 hover:text-white transition-all">
          <Filter className="w-4 h-4" />
          Filter Personnel
        </button>
      </div>

      <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/5 border-b border-white/10">
                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Trainee Profile</th>
                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Department</th>
                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Competency</th>
                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Last Activity</th>
                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {trainees.map((trainee) => (
                <tr key={trainee._id} className="hover:bg-white/5 transition-all group cursor-pointer">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-bold text-lg text-white shadow-lg">
                        {trainee.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-white uppercase tracking-tight group-hover:text-purple-300 transition-colors">{trainee.name}</p>
                        <p className="text-xs text-gray-500 font-medium">@{trainee.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="px-3 py-1 bg-white/5 text-gray-300 rounded-lg text-[10px] font-black uppercase tracking-widest border border-white/5">{trainee.department}</span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="space-y-2 max-w-[140px]">
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-lg font-black text-white">{trainee.averageScore || 0}%</span>
                        <span className="text-[10px] text-gray-500 font-bold">{trainee.testsCompleted}/{trainee.testsAssigned} CMPL</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ${trainee.averageScore >= 80 ? 'bg-gradient-to-r from-purple-500 to-pink-500' : 'bg-red-500/50'}`} 
                          style={{ width: `${trainee.averageScore}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2 text-gray-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-xs font-bold">{trainee.lastTestDate ? new Date(trainee.lastTestDate).toLocaleDateString() : 'Never'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                      trainee.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30'
                    }`}>
                      {trainee.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TasksTab({ assignments, isSupervisor, currentUser, router }: any) {
  const displayAssignments = isSupervisor ? assignments : assignments.filter((a: any) => a.userId?._id === currentUser?.id);

  return (
    <div className="animate-in zoom-in-95 duration-500 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">{isSupervisor ? "Task Allocation" : "My Assignments"}</h2>
          <p className="text-gray-400 text-sm mt-1">Manage training courses and assessment schedules</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayAssignments.map((task: any) => (
          <div key={task._id} className="bg-white/5 backdrop-blur-xl p-6 rounded-3xl border border-white/10 shadow-xl hover:border-purple-500/50 transition-all duration-300 group cursor-pointer relative overflow-hidden flex flex-col min-h-[300px]">
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-purple-500 to-pink-500"></div>
            
            <div className="flex items-center justify-between mb-4">
              <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                task.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                task.status === 'overdue' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
              }`}>
                {task.status}
              </span>
              <span className="text-[10px] font-black text-gray-600 uppercase">#{task._id.slice(-6).toUpperCase()}</span>
            </div>
            
            <h3 className="text-xl font-bold text-white mb-3 group-hover:text-purple-300 transition-colors uppercase tracking-tight">{task.testName}</h3>
            
            <div className="flex flex-col gap-3 mb-6">
              <div className="flex items-center gap-2 text-xs text-gray-400 font-medium">
                <BookOpen className="w-4 h-4 text-purple-400" />
                <span>{task.testType} Assessment</span>
              </div>
              {task.sopIds && task.sopIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {task.sopIds.map((sop: any) => (
                    <span key={sop._id} className="text-[9px] px-2 py-1 bg-white/5 text-gray-400 rounded-lg border border-white/5 font-black uppercase tracking-widest">
                      {sop.identifier || 'SOP'}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-auto">
              <div className="flex items-center justify-between mb-6 pt-6 border-t border-white/5">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Grade</span>
                  <span className={`text-lg font-black ${task.score ? 'text-white' : 'text-gray-800'}`}>
                    {task.score ? `${task.score}%` : '---'}
                  </span>
                </div>
                <div className="text-right flex flex-col">
                  <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Target Date</span>
                  <span className="text-sm font-bold text-white">
                    {task.deadline ? new Date(task.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'ASAP'}
                  </span>
                </div>
              </div>

              {!isSupervisor && task.status !== 'completed' && (
                <button 
                  onClick={() => router.push(`/test/specific/${task._id}`)}
                  className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-2xl text-sm font-black transition-all shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2 group/play"
                >
                  START ASSESSMENT 
                  <ChevronRight className="w-4 h-4 group-hover/play:translate-x-1 transition-transform" />
                </button>
              )}
              
              {isSupervisor && (
                <div className="flex items-center gap-2 text-gray-500 italic text-[10px]">
                  <User className="w-3 h-3" />
                  Assigned to: <span className="text-gray-300 font-bold not-italic">{task.userId?.name}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsTab({ trainees, assignments }: any) {
  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Visual Analytics</h2>
          <p className="text-gray-400 text-sm mt-1">Personnel performance data and trends</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white/5 backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10"><TrendingUp className="w-32 h-32 text-purple-500" /></div>
          <h3 className="text-xl font-bold text-white mb-8 flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-400" />
            Performance Evolution
          </h3>
          <div className="h-[300px] flex items-end justify-between gap-4 relative">
            {[65, 82, 75, 91, 88, 70, 85, 94, 78, 89, 92, 95].map((val, i) => (
              <div key={i} className="flex-1 group relative">
                <div 
                  className="w-full bg-gradient-to-t from-purple-600 to-pink-500 rounded-t-xl transition-all duration-1000 ease-out group-hover:to-blue-400 cursor-pointer shadow-lg shadow-purple-500/20" 
                  style={{ height: `${val}%` }}
                >
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white text-slate-900 text-[10px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                    {val}%
                  </div>
                </div>
                <div className="mt-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center">
                  {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i]}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-pink-500/5 rounded-full blur-3xl group-hover:bg-pink-500/10 transition-colors"></div>
          <h3 className="text-xl font-bold text-white mb-8 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-pink-400" />
            Competency Matrix
          </h3>
          <div className="space-y-6">
            <DistributionRow label="90% - 100% (Elite)" value={trainees.filter((u: any) => u.averageScore >= 90).length} color="purple" total={trainees.length} />
            <DistributionRow label="80% - 89% (Proficient)" value={trainees.filter((u: any) => u.averageScore >= 80 && u.averageScore < 90).length} color="pink" total={trainees.length} />
            <DistributionRow label="Below 80% (Developing)" value={trainees.filter((u: any) => u.averageScore < 80).length} color="blue" total={trainees.length} />
            
            <div className="mt-10 pt-10 border-t border-white/10">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Pass Rate</p>
                  <p className="text-2xl font-black text-emerald-400">94.2%</p>
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Avg Score</p>
                  <p className="text-2xl font-black text-purple-400">86.5%</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DistributionRow({ label, value, color, total }: { label: string, value: number, color: string, total: number }) {
  const percentage = Math.round((value / (total || 1)) * 100);
  const colors: any = { 
    purple: 'from-purple-500 to-purple-600', 
    pink: 'from-pink-500 to-pink-600', 
    blue: 'from-blue-500 to-blue-600' 
  };
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
        <span className="text-gray-400">{label}</span>
        <span className="text-white bg-white/5 py-0.5 px-2 rounded-lg">{value} Pers.</span>
      </div>
      <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
        <div 
          className={`h-full bg-gradient-to-r ${colors[color]} rounded-full transition-all duration-1000 ease-out shadow-lg`} 
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
}

function ArrowRight(props: any) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}
