'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, CheckCircle2, AlertCircle, BookOpenCheck,
  Loader2, X, Calendar, Award, RotateCcw, ChevronDown, Trophy
} from 'lucide-react';

interface EmployeeOption {
  employeeName: string;
  departments: string[];
  designations: string[];
}

interface SopResultRecord {
  sopCode: string;
  sopName: string;
  department: string;
  month: number;
  monthName: string;
  year: number;
  totalAttempts: number;
  passed: boolean;
  maxedOut: boolean;
  bestScore: number;
  attemptsHistory: {
    attemptNumber: number;
    score: number;
    correctCount: number;
    wrongCount: number;
    totalQuestions: number;
    status: string;
    durationSeconds?: number;
  }[];
  certificate?: {
    certificateNumber: string;
    completedAt: string;
    attemptNumber: number;
  };
}

interface MonthGroup {
  month: number;
  monthName: string;
  year: number;
  sops: SopResultRecord[];
}

export default function MyResultsTab() {
  const [empSearch,    setEmpSearch]    = useState('');
  const [selectedEmp,  setSelectedEmp]  = useState('');
  const [allEmployees, setAllEmployees] = useState<EmployeeOption[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [monthWise,    setMonthWise]    = useState<MonthGroup[]>([]);
  const [totals,       setTotals]       = useState({ attempts: 0, passed: 0, certs: 0 });
  const [expandedSop,  setExpandedSop]  = useState<string | null>(null);
  const [error,        setError]        = useState('');

  useEffect(() => {
    fetch('/api/training/employees')
      .then(r => r.json())
      .then(d => { if (d.success) setAllEmployees(d.employees || []); })
      .catch(console.error);
  }, []);

  const filteredEmps = useMemo(() => {
    if (!empSearch) return allEmployees;
    const q = empSearch.toLowerCase();
    return allEmployees.filter(e => e.employeeName.toLowerCase().includes(q));
  }, [allEmployees, empSearch]);

  const fetchResults = useCallback(async (name: string) => {
    setLoading(true); setError('');
    try {
      const res  = await fetch(`/api/training/my-results?employeeName=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (!data.success) { setError(data.error || 'Failed to load results'); return; }
      setMonthWise(data.monthWise || []);
      setTotals({ attempts: data.totalAttempts, passed: data.totalPassed, certs: data.totalCertificates });
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (selectedEmp) fetchResults(selectedEmp); }, [selectedEmp, fetchResults]);

  const fmtDur = (s?: number | null) =>
    s == null ? '—' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-600/10 to-purple-600/5 border border-violet-500/20 rounded-3xl p-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-violet-500/20 rounded-2xl border border-violet-500/30">
            <Trophy className="h-6 w-6 text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white">My Exam Results</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              Month-wise exam history, attempt tracking, and auto-generated certificates.
            </p>
          </div>
        </div>
      </div>

      {/* Employee picker */}
      <div className="bg-white/[0.025] border border-white/5 rounded-3xl p-6 space-y-3">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Employee</label>
        <div className="relative max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={selectedEmp || empSearch}
            onChange={e => { setEmpSearch(e.target.value); setSelectedEmp(''); setMonthWise([]); }}
            placeholder="Search employee name…"
            className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm font-bold text-white placeholder-slate-600 outline-none focus:ring-2 ring-violet-500/40 transition-all"
          />
          {!selectedEmp && empSearch && filteredEmps.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[#0c0a1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
              {filteredEmps.map(emp => (
                <button key={emp.employeeName}
                  onClick={() => { setSelectedEmp(emp.employeeName); setEmpSearch(''); }}
                  className="w-full px-4 py-3 text-left hover:bg-white/5 transition-colors border-b border-white/[0.04] last:border-0">
                  <p className="text-sm font-bold text-white">{emp.employeeName}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{emp.departments.join(', ')}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        {selectedEmp && (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-violet-400" />
            <span className="text-xs font-bold text-violet-400">{selectedEmp}</span>
            <button onClick={() => { setSelectedEmp(''); setEmpSearch(''); setMonthWise([]); }}
              className="text-slate-600 hover:text-white ml-1">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-slate-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading results…
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* KPI strip */}
      {selectedEmp && !loading && monthWise.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Attempts', value: totals.attempts, color: 'text-indigo-300'  },
            { label: 'SOPs Passed',    value: totals.passed,   color: 'text-emerald-300' },
            { label: 'Certificates',   value: totals.certs,    color: 'text-violet-300'  },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 text-center">
              <p className={`text-3xl font-black ${color}`}>{value}</p>
              <p className="text-[9px] text-slate-600 uppercase tracking-widest mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {selectedEmp && !loading && monthWise.length === 0 && !error && (
        <div className="text-center py-12 bg-white/[0.02] border border-white/5 rounded-3xl">
          <Trophy className="h-8 w-8 text-slate-700 mx-auto mb-2" />
          <p className="text-slate-500 font-bold">No exam attempt history found.</p>
          <p className="text-slate-700 text-xs mt-1">Start exams from the "Start Training" tab to see results here.</p>
        </div>
      )}

      {/* Month groups */}
      {monthWise.map(group => (
        <div key={`${group.year}-${group.month}`} className="space-y-3">
          {/* Month divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/5" />
            <span className="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <Calendar className="h-3 w-3" />
              {group.monthName} {group.year}
            </span>
            <div className="h-px flex-1 bg-white/5" />
          </div>

          {group.sops.map(sop => {
            const key   = `${sop.sopCode}-${group.month}-${group.year}`;
            const isExp = expandedSop === key;
            return (
              <div key={key} className={`bg-white/[0.02] border rounded-2xl overflow-hidden transition-all ${
                sop.passed   ? 'border-emerald-500/20' :
                sop.maxedOut ? 'border-rose-500/20'    : 'border-white/5'
              }`}>
                {/* Row */}
                <div className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-white/[0.02]"
                  onClick={() => setExpandedSop(isExp ? null : key)}>
                  <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                    sop.passed   ? 'bg-emerald-500/20 border border-emerald-500/30' :
                    sop.maxedOut ? 'bg-rose-500/20 border border-rose-500/30'       :
                                   'bg-amber-500/10 border border-amber-500/20'
                  }`}>
                    {sop.passed
                      ? <Award       className="h-4 w-4 text-emerald-400" />
                      : sop.maxedOut
                        ? <AlertCircle className="h-4 w-4 text-rose-400" />
                        : <RotateCcw   className="h-4 w-4 text-amber-400" />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded-md text-indigo-300 font-mono font-black text-[11px]">
                        {sop.sopCode}
                      </span>
                      {sop.sopName && sop.sopName !== sop.sopCode && (
                        <span className="text-sm font-bold text-white truncate max-w-[200px]">{sop.sopName}</span>
                      )}
                      <span className="text-[10px] text-slate-500 font-bold">{sop.department}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-500">{sop.totalAttempts} / 5 attempts used</span>
                      <span className={`text-[10px] font-black ${
                        sop.passed ? 'text-emerald-400' : sop.maxedOut ? 'text-rose-400' : 'text-amber-400'
                      }`}>Best: {sop.bestScore}%</span>
                    </div>
                  </div>

                  {sop.certificate && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg shrink-0">
                      <BookOpenCheck className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-[10px] font-black text-emerald-400 font-mono">{sop.certificate.certificateNumber}</span>
                    </div>
                  )}

                  <ChevronDown className={`h-4 w-4 text-slate-500 shrink-0 transition-transform ${isExp ? 'rotate-180' : ''}`} />
                </div>

                {/* Attempt history */}
                {isExp && (
                  <div className="border-t border-white/[0.04] px-5 py-4 space-y-3 bg-black/20">
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Attempt History</p>
                    {sop.attemptsHistory.map(att => (
                      <div key={att.attemptNumber} className={`flex items-center gap-4 p-3 rounded-xl border text-xs ${
                        att.status === 'passed'    ? 'bg-emerald-500/5 border-emerald-500/20' :
                        att.status === 'maxed_out' ? 'bg-rose-500/5 border-rose-500/20'      :
                                                      'bg-white/[0.02] border-white/[0.04]'
                      }`}>
                        <span className={`shrink-0 font-black text-[10px] h-6 w-6 flex items-center justify-center rounded-full ${
                          att.status === 'passed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-slate-400'
                        }`}>{att.attemptNumber}</span>
                        <div className="flex-1 grid grid-cols-4 gap-2">
                          <div>
                            <p className="text-slate-500 text-[9px] uppercase">Score</p>
                            <p className="font-black text-white">{att.score}%</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-[9px] uppercase">Correct</p>
                            <p className="font-black text-emerald-400">{att.correctCount}/{att.totalQuestions}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-[9px] uppercase">Duration</p>
                            <p className="font-black text-slate-300">{fmtDur(att.durationSeconds)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-[9px] uppercase">Status</p>
                            <p className={`font-black capitalize text-[10px] ${
                              att.status === 'passed' ? 'text-emerald-400' :
                              att.status === 'failed' ? 'text-amber-400'  : 'text-rose-400'
                            }`}>{att.status.replace('_', ' ')}</p>
                          </div>
                        </div>
                      </div>
                    ))}

                    {sop.certificate && (
                      <div className="mt-2 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center gap-3">
                        <BookOpenCheck className="h-5 w-5 text-emerald-400 shrink-0" />
                        <div>
                          <p className="text-[10px] font-black text-emerald-400">Certificate Issued</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">{sop.certificate.certificateNumber}</p>
                          <p className="text-[9px] text-slate-600 mt-0.5">
                            Completed {new Date(sop.certificate.completedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
