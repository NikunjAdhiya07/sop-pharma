'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, Search, Download, BookOpen, CheckCircle2,
  Clock, TrendingUp, Building2, Calendar, AlertCircle, Users,
  FileX, FileText, X, ChevronRight, Award,
  Wrench, Package, ShieldCheck, Microscope, UserCog, FlaskConical,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeptCapsule {
  department: string;
  month: number;
  monthName: string;
  year: number;
  sopCount: number;
  employeeCount: number;
  examsScheduled: number;
  examsCompleted: number;
  examsPending: number;
  completed: number;
  pending: number;
  notRequired: number;
  na: number;
  total: number;
  completionPct: number;
  topPendingSops: string[];
  topPendingEmployees: string[];
  missingDocx: number;
  missingPdf: number;
}

interface MonthGroup {
  month: number;
  monthName: string;
  year: number;
  capsules: DeptCapsule[];
}

interface EmpCapsule {
  employeeName: string;
  department: string;
  designation: string;
  month: number;
  monthName: string;
  year: number;
  totalScheduled: number;
  examsScheduled: number;
  examsCompleted: number;
  examsPending: number;
  completed: number;
  pending: number;
  notRequired: number;
  na: number;
  completionPct: number;
  pendingSopCodes: string[];
  completedSopCodes: string[];
  upcomingExamSops: string[];
  missingTraining: number;
}

interface FilterOptions {
  departments: string[];
  years: number[];
  months: { month: number; monthName: string; year: number }[];
  employees?: string[];
}

// ─── Dept Detail Modal ────────────────────────────────────────────────────────

function DeptSopDetailModal({ dept, month, year, monthName, onClose }: {
  dept: string; month: number; year: number; monthName: string; onClose: () => void;
}) {
  const [rows,    setRows]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/training-matrix/data?department=${encodeURIComponent(dept)}&month=${month}&year=${year}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const flat: any[] = [];
          for (const emp of d.employees)
            for (const [sopCode, t] of Object.entries(emp.trainings as Record<string, { status: string }>))
              flat.push({ sopCode, employeeName: emp.employeeName, status: (t as any).status });
          flat.sort((a, b) => a.sopCode.localeCompare(b.sopCode) || a.employeeName.localeCompare(b.employeeName));
          setRows(flat);
        }
      })
      .finally(() => setLoading(false));
  }, [dept, month, year]);

  const grouped = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const r of rows) { if (!m.has(r.sopCode)) m.set(r.sopCode, []); m.get(r.sopCode)!.push(r); }
    return m;
  }, [rows]);

  const SC: Record<string, string> = {
    completed: 'bg-emerald-100 text-emerald-800', pending: 'bg-amber-100 text-amber-800',
    not_required: 'bg-red-100 text-red-700', na: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 rounded-t-2xl flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">{dept} — {monthName} {year}</h2>
            <p className="text-xs text-gray-500 mt-0.5">SOP-wise training details · {grouped.size} SOPs</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : grouped.size === 0 ? (
            <p className="text-center text-gray-400 py-16">No records found.</p>
          ) : (
            [...grouped.entries()].map(([sopCode, empRows]) => {
              // pending = tick (√) = scheduled but exam not yet done
              // completed = explicitly marked trained/done
              const trained  = empRows.filter((r: any) => r.status === 'completed').length;
              const examPend = empRows.filter((r: any) => r.status === 'pending').length;
              const scheduled = trained + examPend;
              const pct = scheduled > 0 ? Math.round(trained / scheduled * 100) : 0;
              return (
                <div key={sopCode} className="border rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50">
                    <span className="font-mono text-sm font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded">{sopCode}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-emerald-700 font-semibold">{trained} trained</span>
                      {examPend > 0 && <span className="text-amber-700 font-semibold">{examPend} exam pending</span>}
                      <span className={`px-2 py-0.5 rounded-full font-bold ${pct >= 80 ? 'bg-emerald-100 text-emerald-800' : pct >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>{pct}%</span>
                    </div>
                  </div>
                  <div className="px-4 py-2 flex flex-wrap gap-1.5">
                    {empRows.map((r: any) => (
                      <span key={r.employeeName} className={`text-xs px-2 py-0.5 rounded-lg ${SC[r.status] || 'bg-gray-50 text-gray-600'}`}>
                        {r.employeeName}
                        {r.status === 'pending' && ' (√)'}
                        {r.status === 'completed' && ' ✓'}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Employee History Modal ───────────────────────────────────────────────────

function EmpHistoryModal({ emp, onClose }: { emp: EmpCapsule; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 rounded-t-2xl flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">{emp.employeeName}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{emp.designation || '—'} · {emp.department} · {emp.monthName} {emp.year}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { l: 'Scheduled',      v: emp.totalScheduled,  bg: 'bg-blue-50',    t: 'text-blue-800' },
              { l: 'Trained (Done)', v: emp.completed,       bg: 'bg-emerald-50', t: 'text-emerald-800' },
              { l: 'Exam Pending √', v: emp.pending,         bg: 'bg-amber-50',   t: 'text-amber-800' },
              { l: 'Not Required',   v: emp.notRequired,     bg: 'bg-red-50',     t: 'text-red-700' },
              { l: 'Trained %',      v: `${emp.completionPct}%`, bg: emp.completionPct >= 80 ? 'bg-emerald-50' : emp.completionPct >= 50 ? 'bg-amber-50' : 'bg-red-50', t: emp.completionPct >= 80 ? 'text-emerald-800' : emp.completionPct >= 50 ? 'text-amber-800' : 'text-red-800' },
              { l: 'Test Pending',   v: emp.examsPending,    bg: emp.examsPending > 0 ? 'bg-violet-50' : 'bg-gray-50', t: emp.examsPending > 0 ? 'text-violet-800' : 'text-gray-400' },
            ].map(s => (
              <div key={s.l} className={`${s.bg} rounded-xl p-3 text-center`}>
                <div className={`text-xl font-black ${s.t}`}>{s.v}</div>
                <div className="text-[10px] text-gray-500 mt-0.5 font-semibold">{s.l}</div>
              </div>
            ))}
          </div>
          {emp.pendingSopCodes.length > 0 && (
            <div>
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">√ Exam Pending — Not Yet Trained ({emp.pendingSopCodes.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {emp.pendingSopCodes.map(c => <span key={c} className="font-mono text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">{c}</span>)}
              </div>
            </div>
          )}
          {emp.completedSopCodes.length > 0 && (
            <div>
              <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2">✓ Training Done ({emp.completedSopCodes.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {emp.completedSopCodes.map(c => <span key={c} className="font-mono text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded">{c}</span>)}
              </div>
            </div>
          )}
          {emp.upcomingExamSops.length > 0 && (
            <div>
              <p className="text-xs font-bold text-violet-700 uppercase tracking-wider mb-2">📋 Upcoming Exams</p>
              <div className="flex flex-wrap gap-1.5">
                {emp.upcomingExamSops.map(c => <span key={c} className="font-mono text-xs bg-violet-50 text-violet-800 border border-violet-200 px-2 py-0.5 rounded">{c}</span>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Progress Ring ────────────────────────────────────────────────────────────

function ProgressRing({ pct, size = 52 }: { pct: number; size?: number }) {
  const r    = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const clr  = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
  const bg   = pct >= 80 ? '#d1fae5' : pct >= 50 ? '#fef3c7' : '#fee2e2';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={bg} strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={clr} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 11, fontWeight: 800, fill: clr, fontFamily: 'inherit' }}>
        {pct}%
      </text>
    </svg>
  );
}

// ─── Dept meta ────────────────────────────────────────────────────────────────

const DEPT_META: Record<string, { icon: React.ReactNode; color: string; bg: string; border: string; hdr: string }> = {
  'QA':                          { icon: <ShieldCheck className="w-4 h-4" />,  color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200',   hdr: 'bg-blue-600' },
  'QC':                          { icon: <FlaskConical className="w-4 h-4" />, color: 'text-cyan-700',    bg: 'bg-cyan-50',    border: 'border-cyan-200',   hdr: 'bg-cyan-600' },
  'Production':                  { icon: <Package className="w-4 h-4" />,      color: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-200', hdr: 'bg-orange-600' },
  'Engineering and Maintenance': { icon: <Wrench className="w-4 h-4" />,       color: 'text-slate-700',   bg: 'bg-slate-50',   border: 'border-slate-200',  hdr: 'bg-slate-600' },
  'Engineering':                 { icon: <Wrench className="w-4 h-4" />,       color: 'text-slate-700',   bg: 'bg-slate-50',   border: 'border-slate-200',  hdr: 'bg-slate-600' },
  'Store':                       { icon: <Package className="w-4 h-4" />,      color: 'text-yellow-700',  bg: 'bg-yellow-50',  border: 'border-yellow-200', hdr: 'bg-yellow-500' },
  'Personnel':                   { icon: <UserCog className="w-4 h-4" />,      color: 'text-pink-700',    bg: 'bg-pink-50',    border: 'border-pink-200',   hdr: 'bg-pink-600' },
  'Microbiology':                { icon: <Microscope className="w-4 h-4" />,   color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200',hdr: 'bg-emerald-600' },
};

function getDeptMeta(dept: string) {
  if (DEPT_META[dept]) return DEPT_META[dept];
  const lower = dept.toLowerCase();
  for (const [k, v] of Object.entries(DEPT_META))
    if (lower.includes(k.toLowerCase().split(' ')[0])) return v;
  return { icon: <Building2 className="w-4 h-4" />, color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200', hdr: 'bg-violet-600' };
}

// ─── Dept Capsule Card ────────────────────────────────────────────────────────

function DeptCapsuleCard({ cap, onClick }: { cap: DeptCapsule; onClick: () => void }) {
  const m = getDeptMeta(cap.department);
  return (
    <button onClick={onClick}
      className="group relative text-left w-full bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200 overflow-hidden focus:outline-none focus:ring-2 focus:ring-violet-400">
      {/* Coloured header strip */}
      <div className={`${m.hdr} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <div className="bg-white/20 text-white p-1.5 rounded-lg">{m.icon}</div>
          <span className="font-bold text-white text-sm">{cap.department}</span>
        </div>
        <div className="bg-white rounded-xl p-0.5">
          <ProgressRing pct={cap.completionPct} size={44} />
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Info */}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{cap.sopCount} Scheduled SOPs</span>
          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{cap.employeeCount} Employees</span>
        </div>

        {/* Stats grid — tick(√)=Exam Pending, done=Trained, X=Not Required */}
        <div className="grid grid-cols-3 gap-1.5">
          <div className="bg-emerald-50 rounded-xl p-2 text-center">
            <p className="text-lg font-black text-emerald-700 leading-none">{cap.completed}</p>
            <p className="text-[9px] text-emerald-600 font-bold uppercase mt-0.5">Trained</p>
          </div>
          <div className={`rounded-xl p-2 text-center ${cap.pending > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
            <p className={`text-lg font-black leading-none ${cap.pending > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{cap.pending}</p>
            <p className={`text-[9px] font-bold uppercase mt-0.5 ${cap.pending > 0 ? 'text-amber-600' : 'text-gray-400'}`}>Exam Pending</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-2 text-center">
            <p className="text-lg font-black text-gray-400 leading-none">{cap.notRequired}</p>
            <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">Not Required</p>
          </div>
        </div>

        {/* Exams */}
        {cap.examsScheduled > 0 && (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${cap.examsPending > 0 ? 'bg-red-50' : 'bg-violet-50'}`}>
            <Award className={`w-3.5 h-3.5 flex-shrink-0 ${cap.examsPending > 0 ? 'text-red-500' : 'text-violet-500'}`} />
            <span className={cap.examsPending > 0 ? 'text-red-700' : 'text-violet-700'}>
              {cap.examsScheduled} exams · {cap.examsCompleted} done
              {cap.examsPending > 0 && <strong className="ml-1"> · {cap.examsPending} pending ⚠</strong>}
            </span>
          </div>
        )}

        {/* SOPs where exam is still pending (tick not cleared) */}
        {cap.topPendingSops.length > 0 && (
          <div>
            <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1.5">SOPs — Exam Pending (√)</p>
            <div className="flex flex-wrap gap-1">
              {cap.topPendingSops.map(s => (
                <span key={s} className="font-mono text-[10px] bg-amber-50 text-amber-800 border border-amber-100 px-1.5 py-px rounded-md">{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Employees who still have pending ticks */}
        {cap.topPendingEmployees.length > 0 && (
          <div>
            <p className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1.5">Employees — Exam Pending</p>
            <div className="flex flex-wrap gap-1">
              {cap.topPendingEmployees.map(e => (
                <span key={e} className="text-[10px] bg-red-50 text-red-700 border border-red-100 px-1.5 py-px rounded-md">{e}</span>
              ))}
            </div>
          </div>
        )}

        {/* Missing files */}
        {(cap.missingDocx > 0 || cap.missingPdf > 0) && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-dashed border-gray-200">
            {cap.missingDocx > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-orange-600 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full">
                <FileX className="w-3 h-3" /> {cap.missingDocx} DOCX missing
              </span>
            )}
            {cap.missingPdf > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
                <FileText className="w-3 h-3" /> {cap.missingPdf} PDF missing
              </span>
            )}
          </div>
        )}
      </div>

      <div className="absolute top-3 right-12 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <ChevronRight className="w-4 h-4 text-white/60" />
      </div>
    </button>
  );
}

// ─── Employee Capsule Card ────────────────────────────────────────────────────

function EmpCapsuleCard({ cap, onClick }: { cap: EmpCapsule; onClick: () => void }) {
  const meta     = getDeptMeta(cap.department);
  const initials = cap.employeeName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <button onClick={onClick}
      className="group relative text-left w-full bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200 overflow-hidden focus:outline-none focus:ring-2 focus:ring-violet-400">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between bg-gray-50 border-b">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-xl ${meta.bg} ${meta.color} flex items-center justify-center text-xs font-black flex-shrink-0 border ${meta.border}`}>
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900 text-sm truncate">{cap.employeeName}</p>
            <p className="text-[10px] text-gray-400 truncate">{cap.designation || cap.department}</p>
          </div>
        </div>
        <ProgressRing pct={cap.completionPct} size={46} />
      </div>

      <div className="p-4 space-y-3">
        {/* Month + dept badge */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1 text-[10px] text-gray-500">
            <Calendar className="w-3 h-3" />{cap.monthName} {cap.year}
          </span>
          <span className={`text-[9px] font-bold px-1.5 py-px rounded-full ${meta.bg} ${meta.color} border ${meta.border}`}>
            {cap.department}
          </span>
          <span className="text-[10px] text-gray-400">{cap.totalScheduled} SOPs scheduled</span>
        </div>

        {/* Stats — tick(√)=Exam Pending, done/trained=Training Done, X=Not Required */}
        <div className="grid grid-cols-4 gap-1">
          <div className="bg-emerald-50 rounded-lg p-1.5 text-center">
            <p className="text-sm font-black text-emerald-700 leading-none">{cap.completed}</p>
            <p className="text-[8px] text-emerald-600 font-bold mt-0.5">Trained</p>
          </div>
          <div className={`rounded-lg p-1.5 text-center ${cap.pending > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
            <p className={`text-sm font-black leading-none ${cap.pending > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{cap.pending}</p>
            <p className={`text-[8px] font-bold mt-0.5 ${cap.pending > 0 ? 'text-amber-600' : 'text-gray-400'}`}>Exam Pend.</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-1.5 text-center">
            <p className="text-sm font-black text-gray-400 leading-none">{cap.notRequired}</p>
            <p className="text-[8px] text-gray-400 font-bold mt-0.5">Not Req</p>
          </div>
          <div className={`rounded-lg p-1.5 text-center ${cap.examsPending > 0 ? 'bg-violet-50' : 'bg-gray-50'}`}>
            <p className={`text-sm font-black leading-none ${cap.examsPending > 0 ? 'text-violet-700' : 'text-gray-400'}`}>{cap.examsPending}</p>
            <p className={`text-[8px] font-bold mt-0.5 ${cap.examsPending > 0 ? 'text-violet-600' : 'text-gray-400'}`}>Test Pend.</p>
          </div>
        </div>

        {/* SOPs where exam is still pending (still has tick) */}
        {cap.pendingSopCodes.length > 0 && (
          <div>
            <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1.5">SOPs — Exam Pending (√)</p>
            <div className="flex flex-wrap gap-1">
              {cap.pendingSopCodes.slice(0, 7).map(c => (
                <span key={c} className="font-mono text-[10px] bg-amber-50 text-amber-800 border border-amber-100 px-1.5 py-px rounded-md">{c}</span>
              ))}
              {cap.pendingSopCodes.length > 7 && (
                <span className="text-[10px] text-gray-400 px-1">+{cap.pendingSopCodes.length - 7}</span>
              )}
            </div>
          </div>
        )}

        {/* Upcoming exams */}
        {cap.upcomingExamSops.length > 0 && (
          <div>
            <p className="text-[9px] font-black text-violet-600 uppercase tracking-widest mb-1.5">Upcoming Exams</p>
            <div className="flex flex-wrap gap-1">
              {cap.upcomingExamSops.map(c => (
                <span key={c} className="font-mono text-[10px] bg-violet-50 text-violet-800 border border-violet-100 px-1.5 py-px rounded-md">{c}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </div>
    </button>
  );
}

// ─── Month Picker ─────────────────────────────────────────────────────────────

const MONTH_LABELS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 bg-violet-50 border-2 border-violet-300 rounded-xl px-3 py-2">
      <Calendar className="w-4 h-4 text-violet-600 flex-shrink-0" />
      <select value={value} onChange={e => onChange(e.target.value)}
        className="bg-transparent text-sm font-bold text-violet-800 focus:outline-none cursor-pointer">
        <option value="all">All Months</option>
        {MONTH_LABELS.map((ml, i) => <option key={ml} value={i + 1}>{ml}</option>)}
      </select>
    </div>
  );
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function KpiStrip({ items }: { items: { l: string; v: string | number; bg: string; ic: React.ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {items.map(k => (
        <div key={k.l} className="bg-white rounded-xl shadow-sm border p-3 flex items-center gap-3">
          <div className={`${k.bg} text-white p-2 rounded-lg flex-shrink-0`}>{k.ic}</div>
          <div>
            <div className="text-xl font-black text-gray-900">{k.v}</div>
            <div className="text-[10px] text-gray-500 font-semibold">{k.l}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Dept View ────────────────────────────────────────────────────────────────

function DeptView() {
  const [monthGroups, setMonthGroups] = useState<MonthGroup[]>([]);
  const [filters,     setFilters]     = useState<FilterOptions>({ departments: [], years: [], months: [] });
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');

  const [month,   setMonth]   = useState(String(new Date().getMonth() + 1));
  const [year,    setYear]    = useState(String(new Date().getFullYear()));
  const [dept,    setDept]    = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [examF,   setExamF]   = useState('false');

  const [modal, setModal] = useState<{ dept: string; month: number; year: number; monthName: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const p = new URLSearchParams({ view: 'dept', month, year, department: dept, status: statusF, examPending: examF });
      const res  = await fetch(`/api/training-matrix/capsule-data?${p}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMonthGroups(json.monthGroups);
      setFilters(json.filters);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [month, year, dept, statusF, examF]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const allCaps        = monthGroups.flatMap(m => m.capsules);
  const totalCompleted = allCaps.reduce((a, c) => a + c.completed, 0);
  const totalPending   = allCaps.reduce((a, c) => a + c.pending, 0);
  const totalSops      = allCaps.reduce((a, c) => a + c.sopCount, 0);
  const totalExamPend  = allCaps.reduce((a, c) => a + c.examsPending, 0);
  const req            = totalCompleted + totalPending;
  const overallPct     = req > 0 ? Math.round(totalCompleted / req * 100) : 0;

  const exportCSV = () => {
    const rows = allCaps.map(c => [
      c.monthName, String(c.year), c.department, String(c.sopCount), String(c.employeeCount),
      String(c.examsScheduled), String(c.examsCompleted), String(c.examsPending),
      String(c.completed), String(c.pending), String(c.notRequired), `${c.completionPct}%`,
      c.topPendingSops.join('; '), c.topPendingEmployees.join('; '),
      String(c.missingDocx), String(c.missingPdf),
    ]);
    const hdrs = ['Month','Year','Department','SOPs','Employees','Exams Total','Exams Done','Exams Pending','Completed','Pending','Not Required','Completion %','Top Pending SOPs','Top Pending Employees','Missing DOCX','Missing PDF'];
    const esc  = (v: string) => `"${String(v).replace(/"/g,'""')}"`;
    const csv  = [hdrs, ...rows].map(r => r.map(esc).join(',')).join('\n');
    Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download:`dept-training-${month}-${year}.csv` }).click();
  };

  return (
    <div className="space-y-5">
      <KpiStrip items={[
        { l: 'SOPs Scheduled',   v: totalSops,        bg: 'bg-blue-600',    ic: <BookOpen className="w-4 h-4" /> },
        { l: 'Training Done',    v: totalCompleted,   bg: 'bg-emerald-600', ic: <CheckCircle2 className="w-4 h-4" /> },
        { l: 'Exam Pending (√)', v: totalPending,     bg: 'bg-amber-500',   ic: <Clock className="w-4 h-4" /> },
        { l: 'Test Pending',     v: totalExamPend,    bg: totalExamPend > 0 ? 'bg-red-500' : 'bg-gray-400', ic: <Award className="w-4 h-4" /> },
        { l: 'Trained %',        v: `${overallPct}%`, bg: overallPct >= 80 ? 'bg-emerald-600' : overallPct >= 50 ? 'bg-amber-500' : 'bg-red-500', ic: <TrendingUp className="w-4 h-4" /> },
      ]} />

      <div className="bg-white rounded-xl shadow-sm border px-4 py-3 flex flex-wrap items-center gap-3">
        <MonthPicker value={month} onChange={setMonth} />
        <select value={year} onChange={e => setYear(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:border-violet-400 focus:outline-none">
          <option value="all">All Years</option>
          {filters.years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={dept} onChange={e => setDept(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:border-violet-400 focus:outline-none">
          <option value="all">All Departments</option>
          {filters.departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:border-violet-400 focus:outline-none">
          <option value="all">All Status</option>
          <option value="pending">Has Exam Pending (√)</option>
          <option value="completed">Has Training Done</option>
        </select>
        <select value={examF} onChange={e => setExamF(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:border-violet-400 focus:outline-none">
          <option value="false">All Exams</option>
          <option value="true">Exam Pending Only</option>
        </select>
        <button onClick={fetchData} title="Refresh" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
        <button onClick={exportCSV} className="flex items-center gap-1.5 text-xs px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 border border-emerald-200 ml-auto">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-28 text-gray-400"><RefreshCw className="w-6 h-6 animate-spin mr-3" /><span>Loading capsules…</span></div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center"><AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" /><p className="text-red-600 text-sm">{error}</p></div>
      ) : monthGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-28 text-gray-400"><Building2 className="w-12 h-12 mb-3 opacity-25" /><p className="text-sm font-medium">No training data for selected filters.</p></div>
      ) : (
        <div className="space-y-8">
          {monthGroups.map(mg => (
            <div key={`${mg.year}-${mg.month}`}>
              <div className="flex items-center gap-3 mb-4">
                <span className="bg-violet-600 text-white text-sm font-bold px-4 py-1.5 rounded-full shadow-sm whitespace-nowrap">
                  {mg.monthName} {mg.year}
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-violet-200 to-transparent" />
                <span className="text-[11px] text-gray-400 whitespace-nowrap">{mg.capsules.length} dept{mg.capsules.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {mg.capsules.map(cap => (
                  <DeptCapsuleCard key={cap.department} cap={cap}
                    onClick={() => setModal({ dept: cap.department, month: cap.month, year: cap.year, monthName: cap.monthName })} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <DeptSopDetailModal {...modal} onClose={() => setModal(null)} />}
    </div>
  );
}

// ─── Employee View ────────────────────────────────────────────────────────────

function EmpView() {
  const [capsules, setCapsules] = useState<EmpCapsule[]>([]);
  const [filters,  setFilters]  = useState<FilterOptions>({ departments: [], years: [], months: [], employees: [] });
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const [month,     setMonth]     = useState(String(new Date().getMonth() + 1));
  const [year,      setYear]      = useState(String(new Date().getFullYear()));
  const [dept,      setDept]      = useState('all');
  const [empSearch, setEmpSearch] = useState('');
  const [sopSearch, setSopSearch] = useState('');
  const [statusF,   setStatusF]   = useState('all');
  const [examF,     setExamF]     = useState('false');

  const [selectedEmp, setSelectedEmp] = useState<EmpCapsule | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const p = new URLSearchParams({ view: 'employee', month, year, department: dept, employee: empSearch, sop: sopSearch, status: statusF, examPending: examF });
      const res  = await fetch(`/api/training-matrix/capsule-data?${p}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setCapsules(json.capsules);
      setFilters(json.filters);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [month, year, dept, empSearch, sopSearch, statusF, examF]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalEmp       = new Set(capsules.map(c => c.employeeName)).size;
  const totalCompleted = capsules.reduce((a, c) => a + c.completed, 0);
  const totalPending   = capsules.reduce((a, c) => a + c.pending, 0);
  const totalExamPend  = capsules.reduce((a, c) => a + c.examsPending, 0);
  const req            = totalCompleted + totalPending;
  const overallPct     = req > 0 ? Math.round(totalCompleted / req * 100) : 0;

  const exportCSV = () => {
    const rows = capsules.map(c => [
      c.employeeName, c.department, c.designation, c.monthName, String(c.year),
      String(c.totalScheduled), String(c.completed), String(c.pending), String(c.notRequired),
      `${c.completionPct}%`, String(c.examsScheduled), String(c.examsCompleted), String(c.examsPending),
      c.pendingSopCodes.join('; '), c.upcomingExamSops.join('; '),
    ]);
    const hdrs = ['Employee','Department','Designation','Month','Year','Scheduled','Completed','Pending','Not Required','Completion %','Exams Total','Exams Done','Exams Pending','Pending SOPs','Upcoming Exam SOPs'];
    const esc  = (v: string) => `"${String(v).replace(/"/g,'""')}"`;
    const csv  = [hdrs, ...rows].map(r => r.map(esc).join(',')).join('\n');
    Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download:`emp-training-${month}-${year}.csv` }).click();
  };

  return (
    <div className="space-y-5">
      <KpiStrip items={[
        { l: 'Employees',        v: totalEmp,        bg: 'bg-blue-600',    ic: <Users className="w-4 h-4" /> },
        { l: 'Training Done',    v: totalCompleted,  bg: 'bg-emerald-600', ic: <CheckCircle2 className="w-4 h-4" /> },
        { l: 'Exam Pending (√)', v: totalPending,    bg: 'bg-amber-500',   ic: <Clock className="w-4 h-4" /> },
        { l: 'Test Pending',     v: totalExamPend,   bg: totalExamPend > 0 ? 'bg-red-500' : 'bg-gray-400', ic: <Award className="w-4 h-4" /> },
        { l: 'Trained %',        v: `${overallPct}%`,bg: overallPct >= 80 ? 'bg-emerald-600' : overallPct >= 50 ? 'bg-amber-500' : 'bg-red-500', ic: <TrendingUp className="w-4 h-4" /> },
      ]} />

      <div className="bg-white rounded-xl shadow-sm border px-4 py-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <MonthPicker value={month} onChange={setMonth} />
          <select value={year} onChange={e => setYear(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:border-violet-400 focus:outline-none">
            <option value="all">All Years</option>
            {filters.years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={dept} onChange={e => setDept(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:border-violet-400 focus:outline-none">
            <option value="all">All Departments</option>
            {filters.departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Employee name…"
              className="border rounded-lg pl-8 pr-3 py-2 text-sm w-44 focus:border-violet-400 focus:outline-none" />
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input value={sopSearch} onChange={e => setSopSearch(e.target.value)} placeholder="SOP code…"
              className="border rounded-lg pl-8 pr-3 py-2 text-sm w-36 focus:border-violet-400 focus:outline-none" />
          </div>
          <select value={statusF} onChange={e => setStatusF(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:border-violet-400 focus:outline-none">
            <option value="all">All Status</option>
            <option value="pending">Exam Pending (√ tick)</option>
            <option value="completed">Training Done</option>
          </select>
          <select value={examF} onChange={e => setExamF(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:border-violet-400 focus:outline-none">
            <option value="false">All Exams</option>
            <option value="true">Exam Pending</option>
          </select>
          <button onClick={fetchData} title="Refresh" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={exportCSV} className="flex items-center gap-1.5 text-xs px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 border border-emerald-200 ml-auto">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
        <p className="text-[11px] text-gray-400">{capsules.length} capsule{capsules.length !== 1 ? 's' : ''} · {totalEmp} employee{totalEmp !== 1 ? 's' : ''}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-28 text-gray-400"><RefreshCw className="w-6 h-6 animate-spin mr-3" /><span>Loading capsules…</span></div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center"><AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" /><p className="text-red-600 text-sm">{error}</p></div>
      ) : capsules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-28 text-gray-400"><Users className="w-12 h-12 mb-3 opacity-25" /><p className="text-sm font-medium">No employee data for selected filters.</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {capsules.map((cap, i) => (
            <EmpCapsuleCard
              key={`${cap.employeeName}|${cap.year}-${cap.month}-${i}`}
              cap={cap}
              onClick={() => setSelectedEmp(cap)}
            />
          ))}
        </div>
      )}

      {selectedEmp && <EmpHistoryModal emp={selectedEmp} onClose={() => setSelectedEmp(null)} />}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TrainingMatrixEnhanced() {
  useAuthGuard();
  const [tab, setTab] = useState<'dept' | 'employee'>('dept');

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <div className="max-w-[1600px] mx-auto px-4 py-5">
        <div className="flex items-center gap-4 mb-5">
          <Link href="/training-matrix" className="p-2 rounded-xl hover:bg-white hover:shadow-sm transition-all text-gray-500">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="bg-violet-600 text-white p-2 rounded-xl shadow-sm">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900">Training Matrix — Monthly Dashboard</h1>
              <p className="text-xs text-gray-500 mt-0.5">Department & employee-wise monthly SOP training overview</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mb-5 bg-white rounded-xl shadow-sm border p-1 w-fit">
          <button onClick={() => setTab('dept')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${tab === 'dept' ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
            <Building2 className="w-4 h-4" /> Department Wise
          </button>
          <button onClick={() => setTab('employee')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${tab === 'employee' ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
            <Users className="w-4 h-4" /> Employee Wise
          </button>
        </div>

        {tab === 'dept'     && <DeptView />}
        {tab === 'employee' && <EmpView />}
      </div>
    </div>
  );
}
