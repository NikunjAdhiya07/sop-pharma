'use client';

import { useState, useEffect } from 'react';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import {
  Users, BookOpen, Calendar, Filter,
  CheckCircle2, Clock, AlertCircle, PlayCircle,
  BarChart3, FileText, Search, RefreshCw, ChevronRight,
  TrendingUp, Activity, UserCheck, CheckSquare, Loader2
} from 'lucide-react';
import TrainingMatrixUploadModal from '@/components/TrainingMatrixUploadModal';

interface TrainingRecord {
  _id: string;
  employeeName: string;
  department: string;
  sopIdentifier: string;
  sopName?: string;
  trainerName?: string;
  scheduledWeek?: string;
  status: 'Pending' | 'In Progress' | 'Completed' | 'Trained';
  passStatus: 'Pass' | 'Fail' | 'Not Taken';
  score?: number;
  testSessionId?: string;
  trainingDate: string;
}

const formatMonthStr = (m: string) => {
  if (!m || m === 'all') return 'All Months';
  const d = new Date(m + '-01');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

export default function TrainingDashboard() {
  useAuthGuard();
  const [data, setData] = useState<TrainingRecord[]>([]);
  const [filters, setFilters] = useState({
    departments: [],
    trainers: [],
    sops: [],
    months: []
  });
  const [selectedFilters, setSelectedFilters] = useState({
    department: 'all',
    trainer: 'all',
    sop: 'all',
    month: 'all',
    status: 'all'
  });
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [search, setSearch] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(selectedFilters);
      const res = await fetch(`/api/training/matrix?${params}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setFilters(json.filters);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [selectedFilters]);

  const handleAssignTest = async (recordId: string) => {
    if (!confirm('Assign test to this employee?')) return;
    try {
      const res = await fetch('/api/training/matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrixId: recordId, questionCount: 10 })
      });
      const json = await res.json();
      if (json.success) {
        fetchData();
        alert('Test assigned successfully!');
      } else {
        alert(json.error || 'Failed to assign test');
      }
    } catch (e) {
      alert('Error assigning test');
    }
  };

  const [scheduling, setScheduling] = useState(false);

  const handleBulkAssign = async () => {
    const pendingCount = data.filter(r => r.status === 'Pending').length;
    if (pendingCount === 0) {
      alert("No pending records to schedule.");
      return;
    }
    
    if (!confirm(`Are you sure you want to attempt scheduling tests for ${pendingCount} pending records?\n\nRecords without an available MCQ Bank will be skipped.`)) return;
    
    setScheduling(true);
    try {
      const res = await fetch('/api/training/matrix/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          questionCount: 10,
          month: selectedFilters.month 
        })
      });
      const json = await res.json();
      if (json.success) {
        alert(json.message);
        fetchData();
      } else {
        alert(json.error || 'Failed to bulk schedule tests');
      }
    } catch (e) {
      alert('Error during bulk scheduling');
    } finally {
      setScheduling(false);
    }
  };

  const filteredData = data.filter(r => 
    r.employeeName.toLowerCase().includes(search.toLowerCase()) ||
    r.sopIdentifier.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: data.length,
    completed: data.filter(r => r.status === 'Completed').length,
    inProgress: data.filter(r => r.status === 'In Progress').length,
    pending: data.filter(r => r.status === 'Pending').length,
    passRate: data.length ? Math.round((data.filter(r => r.passStatus === 'Pass').length / data.length) * 100) : 0
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">
              Training Intelligence
            </h1>
            <p className="text-slate-400 font-medium">End-to-end training matrix & test management system</p>
          </div>
          
          <div className="flex gap-4">
            <button 
              onClick={handleBulkAssign}
              disabled={scheduling || stats.pending === 0}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-400 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:shadow-none whitespace-nowrap"
              title="Schedule tests for all Pending records"
            >
              {scheduling ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlayCircle className="h-5 w-5" />}
              {scheduling ? 'Scheduling...' : `Schedule Pending (${selectedFilters.month !== 'all' ? formatMonthStr(selectedFilters.month) : 'All'})`}
            </button>

            <button 
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20"
            >
              <FileText className="h-5 w-5" />
              Upload Matrix
            </button>
            <button 
              onClick={fetchData}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard title="Total Assigned" value={stats.total} icon={Users} color="blue" />
          <StatCard title="Tests Completed" value={stats.completed} icon={CheckCircle2} color="emerald" />
          <StatCard title="In Progress" value={stats.inProgress} icon={Activity} color="amber" />
          <StatCard title="Pass Rate" value={`${stats.passRate}%`} icon={TrendingUp} color="purple" />
        </div>

        {/* Filters */}
        <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-6 backdrop-blur-xl space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-black text-slate-500 ml-2">Department</label>
              <select 
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-2 ring-indigo-500/50 outline-none appearance-none"
                value={selectedFilters.department}
                onChange={e => setSelectedFilters(f => ({ ...f, department: e.target.value }))}
              >
                <option value="all">All Departments</option>
                {filters.departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-black text-slate-500 ml-2">Trainer</label>
              <select 
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-2 ring-indigo-500/50 outline-none appearance-none"
                value={selectedFilters.trainer}
                onChange={e => setSelectedFilters(f => ({ ...f, trainer: e.target.value }))}
              >
                <option value="all">All Trainers</option>
                {filters.trainers.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-black text-slate-500 ml-2">SOP</label>
              <select 
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-2 ring-indigo-500/50 outline-none appearance-none"
                value={selectedFilters.sop}
                onChange={e => setSelectedFilters(f => ({ ...f, sop: e.target.value }))}
              >
                <option value="all">All SOPs</option>
                {filters.sops.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-black text-slate-500 ml-2">Month</label>
              <select 
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-2 ring-indigo-500/50 outline-none appearance-none"
                value={selectedFilters.month}
                onChange={e => setSelectedFilters(f => ({ ...f, month: e.target.value }))}
              >
                <option value="all">All Months</option>
                {filters.months.map(m => (
                  <option key={m} value={m}>{formatMonthStr(m)}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-black text-slate-500 ml-2">Search</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input 
                  type="text"
                  placeholder="Employee name..."
                  className="w-full bg-black/40 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm font-bold focus:ring-2 ring-indigo-500/50 outline-none"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden backdrop-blur-xl shadow-2xl shadow-black/50">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="px-8 py-5 text-left text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">Employee</th>
                  <th className="px-6 py-5 text-left text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">Training Details</th>
                  <th className="px-6 py-5 text-left text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">Schedule</th>
                  <th className="px-6 py-5 text-left text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">Progress</th>
                  <th className="px-6 py-5 text-center text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">Result</th>
                  <th className="px-8 py-5 text-right text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <div className="h-10 w-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                        <p className="text-slate-400 font-bold">Analyzing matrix records...</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-8 py-20 text-center">
                       <p className="text-slate-500 font-bold">No records found matching filters.</p>
                    </td>
                  </tr>
                ) : (
                  filteredData.map((row) => (
                    <tr key={row._id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center font-black text-lg shadow-lg">
                            {row.employeeName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-white group-hover:text-indigo-400 transition-colors uppercase tracking-tight">{row.employeeName}</p>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">{row.department}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-6">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                             <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
                             <span className="font-mono text-xs font-bold text-indigo-300">{row.sopIdentifier}</span>
                          </div>
                          <p className="text-sm font-medium text-slate-300 line-clamp-1 flex items-center gap-2">
                             {row.sopName || 'Unknown SOP'}
                             {row.trainerName && (
                               <span className="px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-400">
                                 {row.trainerName}
                               </span>
                             )}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-6 font-bold text-sm">
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center gap-2 text-slate-400 uppercase tracking-widest">
                            <Calendar className="h-3 w-3" />
                            {row.scheduledWeek || 'TBD'}
                          </div>
                          <p className="text-slate-500 tracking-tighter">{new Date(row.trainingDate).toLocaleDateString()}</p>
                        </div>
                      </td>
                      <td className="px-6 py-6">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-6 py-6 text-center">
                        {row.passStatus !== 'Not Taken' ? (
                          <div className="space-y-1">
                            <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.15em] border ${
                              row.passStatus === 'Pass' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            }`}>
                              {row.passStatus}
                            </span>
                            <p className="text-xs font-black text-slate-400 mt-1">{row.score}%</p>
                          </div>
                        ) : (
                          <span className="text-slate-600 font-black text-[10px] uppercase tracking-widest italic">No Data</span>
                        )}
                      </td>
                      <td className="px-8 py-6 text-right">
                        {row.status === 'Pending' ? (
                          <button 
                            onClick={() => handleAssignTest(row._id)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-600/20 rounded-xl font-bold text-xs transition-all"
                          >
                            <PlayCircle className="h-4 w-4" />
                            Assign Test
                          </button>
                        ) : row.status === 'In Progress' && row.testSessionId ? (
                          <a 
                            href={`/training/test/${row.testSessionId}`}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-600/20 rounded-xl font-bold text-xs transition-all"
                          >
                            <ChevronRight className="h-4 w-4" />
                            Resume Test
                          </a>
                        ) : (
                          <button 
                             disabled
                             className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 text-slate-500 border border-white/5 rounded-xl font-bold text-xs cursor-not-allowed"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Completed
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <TrainingMatrixUploadModal 
        isOpen={showUpload}
        onClose={() => setShowUpload(false)}
        onSuccess={fetchData}
      />
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: any) {
  const colors: any = {
    blue: 'from-blue-600/20 to-indigo-600/20 border-blue-500/20 text-blue-400 icon-bg-blue-500/20',
    emerald: 'from-emerald-600/20 to-teal-600/20 border-emerald-500/20 text-emerald-400 icon-emerald-blue-500/20',
    amber: 'from-amber-600/20 to-orange-600/20 border-amber-500/20 text-amber-400 icon-amber-blue-500/20',
    purple: 'from-purple-600/20 to-pink-600/20 border-purple-500/20 text-purple-400 icon-purple-blue-500/20',
  };

  return (
    <div className={`bg-gradient-to-br border rounded-[2.5rem] p-7 backdrop-blur-xl ${colors[color]}`}>
      <div className="flex justify-between items-start">
        <div className="bg-white/10 p-3 rounded-2xl">
          <Icon className="h-7 w-7" />
        </div>
      </div>
      <div className="mt-4 space-y-1">
        <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/50">{title}</p>
        <p className="text-4xl font-black text-white tracking-tighter">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: any = {
    'Completed': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    'Trained': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    'In Progress': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    'Pending': 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };

  return (
    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${styles[status]}`}>
      {status}
    </span>
  );
}
