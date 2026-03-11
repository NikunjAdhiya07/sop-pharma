'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, CalendarClock, CheckCircle2, CalendarDays, Search, Calendar, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

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
}

export type SortCol = 'trainerName' | 'sopDetails' | 'department' | 'date' | 'result';

export default function ExamSchedulesTab() {
  const [activeSubTab, setActiveSubTab] = useState<'today' | 'upcoming' | 'completed'>('today');
  const [loading, setLoading] = useState(true);
  
  const [todayExams, setTodayExams] = useState<ExamRecord[]>([]);
  const [upcomingExams, setUpcomingExams] = useState<ExamRecord[]>([]);
  const [completedExams, setCompletedExams] = useState<ExamRecord[]>([]);
  const [search, setSearch] = useState('');
  
  const [sortCol, setSortCol] = useState<SortCol>('trainerName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/training/exam-schedules');
      const data = await res.json();
      if (data.success) {
        setTodayExams(data.todayExams || []);
        setUpcomingExams(data.upcomingExams || []);
        setCompletedExams(data.completedExams || []);
      }
    } catch (err) {
      console.error('Error fetching schedules:', err);
    } finally {
      setLoading(false);
    }
  };

  const currentRecords = 
    activeSubTab === 'today' ? todayExams :
    activeSubTab === 'upcoming' ? upcomingExams : 
    completedExams;

  const filtered = currentRecords.filter(r => 
    r.trainerName.toLowerCase().includes(search.toLowerCase()) ||
    r.sopName.toLowerCase().includes(search.toLowerCase()) ||
    r.sopCode.toLowerCase().includes(search.toLowerCase()) ||
    r.department.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortCol === 'trainerName') {
        const vA = String(a.trainerName || '').toLowerCase();
        const vB = String(b.trainerName || '').toLowerCase();
        return sortDir === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
      }
      if (sortCol === 'sopDetails') {
        const vA = String(a.sopCode || '').toLowerCase();
        const vB = String(b.sopCode || '').toLowerCase();
        return sortDir === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
      }
      if (sortCol === 'department') {
        const vA = String(a.department || '').toLowerCase();
        const vB = String(b.department || '').toLowerCase();
        return sortDir === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
      }
      if (sortCol === 'result') {
        const vA = String(a.status || '').toLowerCase();
        const vB = String(b.status || '').toLowerCase();
        return sortDir === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
      }
      if (sortCol === 'date') {
        let nA = 0;
        let nB = 0;
        if (activeSubTab === 'completed') {
          nA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
          nB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        } else {
          nA = (a.matrixYear || 0) * 100 + (a.matrixMonthIndex || 0);
          nB = (b.matrixYear || 0) * 100 + (b.matrixMonthIndex || 0);
        }
        return sortDir === 'asc' ? nA - nB : nB - nA;
      }
      return 0;
    });
  }, [filtered, sortCol, sortDir, activeSubTab]);

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const renderSortIcon = (col: SortCol) => {
    if (sortCol !== col) return <ArrowUpDown className="h-3 w-3 inline ml-1 opacity-40 group-hover:opacity-100 transition-opacity" />;
    return sortDir === 'asc' 
      ? <ArrowUp className="h-3 w-3 inline ml-1 text-indigo-400" /> 
      : <ArrowDown className="h-3 w-3 inline ml-1 text-indigo-400" />;
  };

  return (
    <div className="space-y-6">
      {/* Header & SubTabs */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white/[0.025] border border-white/5 rounded-3xl p-6">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-indigo-400" />
            Exam Scheduling & Tracking
          </h2>
          <p className="text-slate-400 text-sm mt-1">Live tracking of active, upcoming, and completed SOP exams from the matrix.</p>
        </div>
        
        <div className="flex bg-black/40 border border-white/10 rounded-xl p-1">
          <button 
            onClick={() => setActiveSubTab('today')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${activeSubTab === 'today' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/20' : 'text-slate-400 hover:text-white'}`}
          >
            <Calendar className="h-3.5 w-3.5" /> Due / Today ({todayExams.length})
          </button>
          <button 
            onClick={() => setActiveSubTab('completed')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${activeSubTab === 'completed' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:text-white'}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Completed ({completedExams.length})
          </button>
          <button 
            onClick={() => setActiveSubTab('upcoming')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${activeSubTab === 'upcoming' ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/20' : 'text-slate-400 hover:text-white'}`}
          >
            <CalendarDays className="h-3.5 w-3.5" /> Upcoming ({upcomingExams.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
        </div>
      ) : (
        <div className="bg-white/[0.02] border border-white/5 rounded-3xl overflow-hidden animation-fade-in">
          <div className="px-6 py-4 border-b border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{activeSubTab} Exams - {filtered.length} Records</span>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search trainer, SOP code, dept..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
               />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.02] border-b border-white/5">
                <tr>
                  <th onClick={() => handleSort('trainerName')} className="px-6 py-4 font-black text-[9px] text-slate-500 uppercase tracking-[0.2em] cursor-pointer hover:bg-white/5 transition-colors group">
                    Trainer Name {renderSortIcon('trainerName')}
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
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-slate-600 font-bold text-sm">
                      No matching records found.
                    </td>
                  </tr>
                ) : sorted.map((row, i) => (
                  <tr key={`${row._id}-${i}`} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center font-black text-xs text-white shrink-0">
                          {row.trainerName.charAt(0)}
                        </div>
                        <span className="font-bold text-white text-sm">{row.trainerName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 max-w-[300px]">
                        <span className="text-indigo-400 font-mono font-black text-[10px] tracking-widest">{row.sopCode}</span>
                        <span className="text-slate-300 text-xs font-medium truncate" title={row.sopName}>{row.sopName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-slate-800/80 border border-white/5 rounded-md text-slate-400 font-bold text-[10px] uppercase">
                        {row.department}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                       {activeSubTab === 'completed' ? (
                          <div className="flex flex-col">
                            <span className="text-slate-300 font-bold">{new Date(row.completedAt!).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            <span className="text-slate-500 text-[10px]">Orig. Sch: {row.matrixMonth} {row.matrixYear}</span>
                          </div>
                       ) : (
                          <div className="flex items-center gap-2">
                             <Calendar className={`h-4 w-4 ${activeSubTab === 'today' ? 'text-indigo-400' : 'text-cyan-400'}`} />
                             <span className="text-slate-300 font-bold text-sm">{row.matrixMonth} {row.matrixYear}</span>
                          </div>
                       )}
                    </td>
                    {activeSubTab === 'completed' && (
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-widest border ${
                          row.status === 'Passed' 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                    )}
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
