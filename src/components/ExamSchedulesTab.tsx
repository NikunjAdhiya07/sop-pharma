'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Loader2, CalendarClock, CheckCircle2, CalendarDays, Search,
  Calendar, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw,
  AlertTriangle, Clock, Users, AlertCircle, TrendingUp,
} from 'lucide-react';

interface ExamRecord {
  _id: string;
  trainerName: string;
  department: string;
  sopName: string;
  sopCode: string;
  matrixMonth: string;
  matrixMonthIndex: number;
  matrixYear: number;
  completedAt?: string;
  status?: string;
  score?: number;
  urgency?: 'due' | 'overdue';
  hasBank?: boolean;
  totalBankQuestions?: number;
  hasUserLink?: boolean;
}

interface Meta {
  totalMatrix: number;
  unmappedEmployees: string[];
  generatedAt: string;
}

export type SortCol = 'trainerName' | 'sopDetails' | 'department' | 'date' | 'result' | 'status';
type SubTab = 'due' | 'overdue' | 'upcoming' | 'completed';

export default function ExamSchedulesTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('due');
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [dueThisMonth, setDueThisMonth] = useState<ExamRecord[]>([]);
  const [overdueExams, setOverdueExams] = useState<ExamRecord[]>([]);
  const [upcomingExams, setUpcomingExams] = useState<ExamRecord[]>([]);
  const [completedExams, setCompletedExams] = useState<ExamRecord[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);

  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [sortCol, setSortCol] = useState<SortCol>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/training/exam-schedules');
      const data = await res.json();
      if (data.success) {
        setDueThisMonth(data.dueThisMonth || data.todayExams || []);
        setOverdueExams(data.overdueExams || []);
        setUpcomingExams(data.upcomingExams || []);
        setCompletedExams(data.completedExams || []);
        setMeta(data.meta || null);
        setLastRefreshed(new Date());
      }
    } catch (err) {
      console.error('Error fetching schedules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const currentRecords: ExamRecord[] =
    activeSubTab === 'due'       ? dueThisMonth :
    activeSubTab === 'overdue'   ? overdueExams :
    activeSubTab === 'upcoming'  ? upcomingExams :
    completedExams;

  useEffect(() => {
    setSelectedUser('');
  }, [activeSubTab]);

  const uniqueUsers = useMemo(() => {
    const users = new Set(currentRecords.map(r => r.trainerName).filter(Boolean));
    return Array.from(users).sort((a, b) => a.localeCompare(b));
  }, [currentRecords]);

  const filtered = useMemo(() => {
    return currentRecords.filter(r => {
      const matchesSearch = [r.trainerName, r.sopName, r.sopCode, r.department]
        .some(v => v?.toLowerCase().includes(search.toLowerCase()));
      const matchesUser = selectedUser ? r.trainerName === selectedUser : true;
      return matchesSearch && matchesUser;
    });
  }, [currentRecords, search, selectedUser]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortCol === 'trainerName') return dir * (a.trainerName || '').localeCompare(b.trainerName || '');
      if (sortCol === 'sopDetails')  return dir * (a.sopCode || '').localeCompare(b.sopCode || '');
      if (sortCol === 'department')  return dir * (a.department || '').localeCompare(b.department || '');
      if (sortCol === 'result')      return dir * (a.status || '').localeCompare(b.status || '');
      if (sortCol === 'status')      return dir * ((a.urgency || a.status || '').localeCompare(b.urgency || b.status || ''));
      if (sortCol === 'date') {
        const nA = activeSubTab === 'completed'
          ? (a.completedAt ? new Date(a.completedAt).getTime() : 0)
          : (a.matrixYear || 0) * 100 + (a.matrixMonthIndex || 0);
        const nB = activeSubTab === 'completed'
          ? (b.completedAt ? new Date(b.completedAt).getTime() : 0)
          : (b.matrixYear || 0) * 100 + (b.matrixMonthIndex || 0);
        return dir * (nA - nB);
      }
      return 0;
    });
  }, [filtered, sortCol, sortDir, activeSubTab]);

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const renderSortIcon = (col: SortCol) => {
    if (sortCol !== col) return <ArrowUpDown className="h-3 w-3 inline ml-1 opacity-30 group-hover:opacity-100 transition-opacity" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 inline ml-1 text-indigo-400" />
      : <ArrowDown className="h-3 w-3 inline ml-1 text-indigo-400" />;
  };

  const TABS: { id: SubTab; label: string; count: number; icon: React.ReactNode; color: string }[] = [
    { id: 'due',      label: 'Due This Month',  count: dueThisMonth.length,  icon: <Calendar className="h-3.5 w-3.5" />,     color: 'indigo'  },
    { id: 'overdue',  label: 'Overdue',         count: overdueExams.length,  icon: <AlertTriangle className="h-3.5 w-3.5" />, color: 'red'     },
    { id: 'upcoming', label: 'Upcoming',        count: upcomingExams.length, icon: <CalendarDays className="h-3.5 w-3.5" />,  color: 'cyan'    },
    { id: 'completed',label: 'Completed',       count: completedExams.length,icon: <CheckCircle2 className="h-3.5 w-3.5" />,  color: 'emerald' },
  ];

  const TAB_COLOR: Record<string, string> = {
    indigo:  'bg-indigo-600/20 text-indigo-400 border-indigo-500/20',
    red:     'bg-red-600/20 text-red-400 border-red-500/20',
    cyan:    'bg-cyan-600/20 text-cyan-400 border-cyan-500/20',
    emerald: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/20',
  };

  return (
    <div className="space-y-5">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="bg-white/[0.025] border border-white/5 rounded-3xl p-6">
        <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <CalendarClock className="h-6 w-6 text-indigo-400" />
              Exam Scheduling &amp; Tracking
            </h2>
            <p className="text-slate-500 text-xs mt-1">
              Live tracking of all SOP exams derived from the uploaded training matrix.
            </p>
            {lastRefreshed && (
              <p className="text-slate-600 text-[10px] mt-0.5">
                Last refreshed: {lastRefreshed.toLocaleTimeString()}
              </p>
            )}
          </div>

          {/* KPI strip */}
          <div className="flex items-center gap-4 flex-wrap">
            {meta && (
              <>
                <div className="text-center">
                  <p className="text-lg font-black text-white">{meta.totalMatrix}</p>
                  <p className="text-[9px] text-slate-600 uppercase tracking-wide">Total Entries</p>
                </div>
                <div className="text-center">
                  <p className={`text-lg font-black ${meta.unmappedEmployees.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {meta.unmappedEmployees.length}
                  </p>
                  <p className="text-[9px] text-slate-600 uppercase tracking-wide">Unmapped Users</p>
                </div>
              </>
            )}
            <button
              onClick={fetchSchedules}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Unmapped employees warning */}
        {meta && meta.unmappedEmployees.length > 0 && (
          <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-400 text-xs font-bold">
                {meta.unmappedEmployees.length} employee{meta.unmappedEmployees.length !== 1 ? 's' : ''} in the matrix have no matching User account — their exams cannot be marked complete.
              </p>
              <p className="text-amber-600 text-[10px] mt-0.5 font-mono">
                {meta.unmappedEmployees.slice(0, 5).join(' · ')}
                {meta.unmappedEmployees.length > 5 ? ` +${meta.unmappedEmployees.length - 5} more` : ''}
              </p>
            </div>
          </div>
        )}

        {/* Sub-tabs */}
        <div className="flex flex-wrap gap-1.5 mt-5">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveSubTab(t.id)}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 border ${
                activeSubTab === t.id
                  ? TAB_COLOR[t.color]
                  : 'border-transparent text-slate-500 hover:text-white hover:bg-white/5'
              }`}
            >
              {t.icon}
              {t.label}
              <span className="px-1.5 py-0.5 rounded-md bg-black/30 font-mono">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Table ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
        </div>
      ) : (
        <div className="bg-white/[0.02] border border-white/5 rounded-3xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              {TABS.find(t => t.id === activeSubTab)?.label} — {sorted.length} Records
            </span>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              {/* User Dropdown Filter */}
              <div className="relative w-full sm:w-auto">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <select
                  value={selectedUser}
                  onChange={e => setSelectedUser(e.target.value)}
                  className="w-full sm:w-auto appearance-none bg-black/40 border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="">All Employees</option>
                  {uniqueUsers.map(u => {
                    const count = currentRecords.filter(r => r.trainerName === u).length;
                    return (
                      <option key={u} value={u}>
                        {u} ({count} {count === 1 ? 'exam' : 'exams'})
                      </option>
                    );
                  })}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <ArrowDown className="h-3 w-3 text-slate-500" />
                </div>
              </div>

              {/* Search */}
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search employee, SOP code, department..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.02] border-b border-white/5">
                <tr>
                  <th onClick={() => handleSort('trainerName')} className="px-6 py-4 font-black text-[9px] text-slate-500 uppercase tracking-[0.2em] cursor-pointer hover:bg-white/5 transition-colors group">
                    Employee {renderSortIcon('trainerName')}
                  </th>
                  <th onClick={() => handleSort('sopDetails')} className="px-6 py-4 font-black text-[9px] text-slate-500 uppercase tracking-[0.2em] cursor-pointer hover:bg-white/5 transition-colors group">
                    SOP Details {renderSortIcon('sopDetails')}
                  </th>
                  <th onClick={() => handleSort('department')} className="px-6 py-4 font-black text-[9px] text-slate-500 uppercase tracking-[0.2em] cursor-pointer hover:bg-white/5 transition-colors group">
                    Department {renderSortIcon('department')}
                  </th>
                  <th onClick={() => handleSort('date')} className="px-6 py-4 font-black text-[9px] text-slate-500 uppercase tracking-[0.2em] cursor-pointer hover:bg-white/5 transition-colors group">
                    {activeSubTab === 'completed' ? 'Completion Date' : 'Scheduled Term'} {renderSortIcon('date')}
                  </th>
                  {activeSubTab === 'completed' && (
                    <th onClick={() => handleSort('result')} className="px-6 py-4 font-black text-[9px] text-slate-500 uppercase tracking-[0.2em] cursor-pointer hover:bg-white/5 transition-colors group">
                      Result {renderSortIcon('result')}
                    </th>
                  )}
                  <th onClick={() => handleSort('status')} className="px-6 py-4 font-black text-[9px] text-slate-500 uppercase tracking-[0.2em] cursor-pointer hover:bg-white/5 transition-colors group">
                    Status {renderSortIcon('status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-20 text-center text-slate-600 font-bold text-sm">
                      No records found for this category.
                    </td>
                  </tr>
                ) : sorted.map((row, i) => (
                  <tr key={`${row._id}-${i}`} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    {/* Employee */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center font-black text-xs text-white shrink-0">
                          {row.trainerName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-white text-sm">{row.trainerName}</span>
                          {!row.hasUserLink && (
                            <span className="text-[9px] text-amber-500 font-bold uppercase tracking-wide flex items-center gap-1">
                              <AlertTriangle className="h-2.5 w-2.5" /> No account
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* SOP */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-0.5 max-w-[280px]">
                        <span className="text-indigo-400 font-mono font-black text-[10px] tracking-widest">{row.sopCode}</span>
                        <span className="text-slate-300 text-xs font-medium truncate" title={row.sopName}>{row.sopName}</span>
                        {!row.hasBank && (
                          <span className="text-[9px] text-amber-600 font-bold">No MCQ bank</span>
                        )}
                        {row.hasBank && row.totalBankQuestions !== undefined && (
                          <span className="text-[9px] text-slate-600">{row.totalBankQuestions} questions in bank</span>
                        )}
                      </div>
                    </td>

                    {/* Department */}
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-slate-800/80 border border-white/5 rounded-md text-slate-400 font-bold text-[10px] uppercase">
                        {row.department}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-6 py-4">
                      {activeSubTab === 'completed' ? (
                        <div className="flex flex-col">
                          <span className="text-slate-300 font-bold">
                            {new Date(row.completedAt!).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          <span className="text-slate-600 text-[10px]">Scheduled: {row.matrixMonth} {row.matrixYear}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Calendar className={`h-4 w-4 shrink-0 ${
                            row.urgency === 'overdue' ? 'text-red-400' :
                            activeSubTab === 'due'    ? 'text-indigo-400' : 'text-cyan-400'
                          }`} />
                          <span className="text-slate-300 font-bold">{row.matrixMonth} {row.matrixYear}</span>
                        </div>
                      )}
                    </td>

                    {/* Score (completed only) */}
                    {activeSubTab === 'completed' && (
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-widest border ${
                            row.status === 'Passed'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                            {row.status}
                          </span>
                          {row.score !== undefined && (
                            <span className="text-[10px] text-slate-500 font-bold">{row.score}%</span>
                          )}
                        </div>
                      </td>
                    )}

                    {/* Status indicators */}
                    <td className="px-6 py-4">
                      {activeSubTab === 'overdue' && (
                        <span className="flex items-center gap-1 text-[10px] font-black text-red-400 uppercase tracking-wide">
                          <AlertTriangle className="h-3 w-3" /> Overdue
                        </span>
                      )}
                      {activeSubTab === 'due' && (
                        <span className="flex items-center gap-1 text-[10px] font-black text-indigo-400 uppercase tracking-wide">
                          <Clock className="h-3 w-3" /> Due Now
                        </span>
                      )}
                      {activeSubTab === 'upcoming' && (
                        <span className="flex items-center gap-1 text-[10px] font-black text-cyan-400 uppercase tracking-wide">
                          <CalendarDays className="h-3 w-3" /> Upcoming
                        </span>
                      )}
                      {activeSubTab === 'completed' && (
                        <span className="flex items-center gap-1 text-[10px] font-black text-emerald-400 uppercase tracking-wide">
                          <CheckCircle2 className="h-3 w-3" /> Done
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
