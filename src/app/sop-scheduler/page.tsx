'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Users, CheckCircle2, Clock, AlertTriangle,
  RotateCcw, PlayCircle, Loader2, Search, RefreshCw,
  ChevronDown, ChevronUp, Building2, BookOpen, X,
  Zap, TrendingUp, ArrowRight, GraduationCap, Filter
} from 'lucide-react';

/* ─── Types ─────────────────────────────── */
interface ExamEvent {
  _id: { trainer: string; sop: string };
  trainerName: string;
  sopIdentifier: string;
  sopName: string;
  department: string;
  scheduledDate: string;
  scheduledWeek?: string;
  employees: string[];
  employeeCount: number;
  pending: number;
  inProgress: number;
  completed: number;
  passed: number;
  failed: number;
  retests: number;
  examStatus: string;
  passRate: number;
}
interface Stats {
  totalExams: number; scheduled: number; pending: number;
  completed: number; passed: number; failed: number;
  retests: number; passRate: number;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const NOW = new Date();
const CURRENT_MONTH = MONTHS[NOW.getMonth()];
const CURRENT_YEAR = NOW.getFullYear();

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  'Pending':        { label:'Pending',        color:'text-amber-300',  bg:'bg-amber-500/10',    border:'border-amber-500/25',   dot:'bg-amber-400' },
  'In Progress':    { label:'In Progress',    color:'text-sky-300',    bg:'bg-sky-500/10',      border:'border-sky-500/25',     dot:'bg-sky-400' },
  'Completed':      { label:'Completed',      color:'text-emerald-300',bg:'bg-emerald-500/10',  border:'border-emerald-500/25', dot:'bg-emerald-400' },
  'Retest Required':{ label:'Retest',         color:'text-rose-300',   bg:'bg-rose-500/10',     border:'border-rose-500/25',    dot:'bg-rose-400' },
  'Scheduled':      { label:'Scheduled',      color:'text-violet-300', bg:'bg-violet-500/10',   border:'border-violet-500/25',  dot:'bg-violet-400' },
  'Trained':        { label:'Trained',        color:'text-emerald-300',bg:'bg-emerald-500/10',  border:'border-emerald-500/25', dot:'bg-emerald-400' },
};

const DEPT_COLORS: Record<string, string> = {
  'Quality Assurance':'from-violet-600 to-purple-700',
  'Production':       'from-orange-600 to-rose-700',
  'Personnel':        'from-cyan-600 to-teal-700',
  'Engineering':      'from-blue-600 to-indigo-700',
  'Quality Control':  'from-fuchsia-600 to-pink-700',
  'Store':            'from-amber-600 to-yellow-700',
  'Microbiology':     'from-green-600 to-emerald-700',
};
const getDeptColor = (dept: string) => DEPT_COLORS[dept] ?? 'from-slate-600 to-slate-700';

/* ─── Main Page ─────────────────────────── */
export default function SOPSchedulerPage() {
  useAuthGuard();
  const [events, setEvents]         = useState<ExamEvent[]>([]);
  const [stats, setStats]           = useState<Stats>({ totalExams:0,scheduled:0,pending:0,completed:0,passed:0,failed:0,retests:0,passRate:0 });
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatus]   = useState('all');
  const [depts, setDepts]           = useState<string[]>([]);
  const [scheduling, setScheduling] = useState<string|null>(null);
  const [expanded, setExpanded]     = useState<string|null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const r  = await fetch(`/api/training/current-month-exams?department=${deptFilter}`);
      const j  = await r.json();
      if (j.success) {
        setEvents(j.examEvents ?? []);
        setStats(j.stats ?? {});
        setDepts(j.filters?.departments ?? []);
      }
    } finally { setLoading(false); }
  }, [deptFilter]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const schedule = async (trainer: string, sop: string) => {
    const key = `${trainer}::${sop}`;
    setScheduling(key);
    try {
      const r = await fetch('/api/training/scheduler/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainer, sopIdentifier: sop, questionCount: 10 }),
      });
      const j = await r.json();
      if (j.success) fetch_();
      else alert(j.error ?? 'Failed to schedule');
    } finally { setScheduling(null); }
  };

  const filtered = events.filter(e => {
    const matchSearch = !search ||
      e.sopIdentifier?.toLowerCase().includes(search.toLowerCase()) ||
      e.sopName?.toLowerCase().includes(search.toLowerCase()) ||
      (e.trainerName ?? '').toLowerCase().includes(search.toLowerCase()) ||
      e.department?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || e.examStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  // Group by department for the visual board
  const byDept: Record<string, ExamEvent[]> = {};
  for (const ev of filtered) {
    const d = ev.department || 'General';
    if (!byDept[d]) byDept[d] = [];
    byDept[d].push(ev);
  }

  const statusCounts = {
    Pending:     events.filter(e => e.examStatus==='Pending').length,
    InProgress:  events.filter(e => e.examStatus==='In Progress').length,
    Completed:   events.filter(e => ['Completed','Trained'].includes(e.examStatus)).length,
    Retest:      events.filter(e => e.examStatus==='Retest Required').length,
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg,#050918 0%,#0a0f2e 40%,#07111e 100%)' }}>

      {/* ── HERO HEADER ── */}
      <div className="relative overflow-hidden border-b border-white/5">
        {/* Glow layers */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[500px] h-[300px] rounded-full blur-[120px]" style={{ background:'radial-gradient(circle,rgba(124,58,237,0.18) 0%,transparent 70%)' }}/>
          <div className="absolute top-0 right-1/4 w-[400px] h-[200px] rounded-full blur-[100px]" style={{ background:'radial-gradient(circle,rgba(14,165,233,0.12) 0%,transparent 70%)' }}/>
        </div>

        <div className="relative max-w-[1600px] mx-auto px-8 pt-8 pb-0">
          {/* Title row */}
          <div className="flex flex-wrap items-start justify-between gap-5 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em]" style={{ background:'rgba(124,58,237,0.15)', border:'1px solid rgba(124,58,237,0.3)', color:'#a78bfa' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse inline-block"/>
                  Live Matrix Data
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em]" style={{ background:'rgba(14,165,233,0.1)', border:'1px solid rgba(14,165,233,0.2)', color:'#38bdf8' }}>
                  <Calendar className="h-3 w-3"/> {CURRENT_MONTH} {CURRENT_YEAR}
                </div>
              </div>
              <h1 className="text-4xl font-black text-white tracking-tight">
                SOP Exam Schedule
              </h1>
              <p className="text-slate-400 mt-1.5 text-sm">
                {CURRENT_MONTH} {CURRENT_YEAR} · All scheduled SOP exams from training matrix · <span className="text-violet-400 font-bold">{events.length} exam sessions</span>
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <a href="/sop-training" className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-white transition-all" style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}>
                Training Matrix <ArrowRight className="h-4 w-4"/>
              </a>
              <button onClick={fetch_} className="p-2.5 rounded-xl transition-all hover:text-white text-slate-400" style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}>
                <RefreshCw className="h-4 w-4"/>
              </button>
            </div>
          </div>

          {/* ── STAT CARDS ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-8">
            {[
              { l:'Total Records', v: stats.totalExams, c:'text-white',           glow:'rgba(255,255,255,0.05)' },
              { l:'Exam Sessions',  v: events.length,   c:'text-violet-300',      glow:'rgba(124,58,237,0.1)' },
              { l:'Pending',        v: stats.pending,   c:'text-amber-300',       glow:'rgba(245,158,11,0.08)' },
              { l:'In Progress',    v: stats.scheduled, c:'text-sky-300',         glow:'rgba(14,165,233,0.08)' },
              { l:'Completed',      v: stats.completed, c:'text-emerald-300',     glow:'rgba(16,185,129,0.08)' },
              { l:'Passed',         v: stats.passed,    c:'text-emerald-400',     glow:'rgba(16,185,129,0.06)' },
              { l:'Retests',        v: stats.retests,   c:'text-rose-300',        glow:'rgba(244,63,94,0.08)' },
              { l:'Pass Rate',      v:`${stats.passRate??0}%`, c: (stats.passRate??0)>=80?'text-emerald-300':(stats.passRate??0)>=60?'text-amber-300':'text-slate-400', glow:'rgba(255,255,255,0.04)' },
            ].map(({ l, v, c, glow }) => (
              <div key={l} className="text-center rounded-2xl px-3 py-4" style={{ background: glow, border:'1px solid rgba(255,255,255,0.06)' }}>
                <p className={`text-xl font-black ${c} leading-none`}>{v}</p>
                <p className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.15em] mt-1.5">{l}</p>
              </div>
            ))}
          </div>

          {/* ── STATUS BAR ── */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { s:'all',          label:'All Exams',    count:events.length,       c:'text-white',       act:'bg-white/10 border-white/20' },
              { s:'Pending',      label:'Pending',      count:statusCounts.Pending, c:'text-amber-300',   act:'bg-amber-500/15 border-amber-500/30' },
              { s:'In Progress',  label:'In Progress',  count:statusCounts.InProgress,c:'text-sky-300',   act:'bg-sky-500/15 border-sky-500/30' },
              { s:'Completed',    label:'Completed',    count:statusCounts.Completed,c:'text-emerald-300',act:'bg-emerald-500/15 border-emerald-500/30' },
            ].map(({ s, label, count, c, act }) => (
              <button key={s} onClick={() => setStatus(s)}
                className={`rounded-xl px-4 py-3 text-left transition-all border ${statusFilter===s ? act : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'}`}>
                <p className={`text-lg font-black ${c}`}>{count}</p>
                <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold mt-0.5">{label}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="max-w-[1600px] mx-auto px-8 py-7">

        {/* Filter + Search bar */}
        <div className="flex flex-wrap items-center gap-3 mb-7">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600"/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search SOP code, name, trainer, department…"
                className="w-full pl-10 pr-4 py-2.5 text-sm font-medium text-white placeholder-slate-700 rounded-xl outline-none"
                style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}/>
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="h-3.5 w-3.5 text-slate-600 hover:text-white"/>
                </button>
              )}
            </div>
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              className="py-2.5 px-4 text-sm font-bold text-white rounded-xl outline-none"
              style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}>
              <option value="all">All Departments</option>
              {depts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <p className="text-slate-600 text-xs font-bold">{filtered.length} of {events.length} exam sessions</p>
        </div>

        {/* ── MAIN CONTENT ── */}
        {loading ? (
          <div className="flex flex-col items-center gap-4 py-32">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background:'rgba(124,58,237,0.2)', border:'1px solid rgba(124,58,237,0.3)' }}>
              <Loader2 className="h-7 w-7 text-violet-400 animate-spin"/>
            </div>
            <p className="text-slate-500 font-bold text-sm">Loading {CURRENT_MONTH} exam schedule from matrix…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-32">
            <div className="w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
              <Calendar className="h-9 w-9 text-slate-700"/>
            </div>
            <p className="text-white font-black text-xl mb-2">No Exams Found for {CURRENT_MONTH}</p>
            <p className="text-slate-600 text-sm">Upload a Training Matrix with dates in {CURRENT_MONTH} {CURRENT_YEAR} to populate this board.</p>
          </div>
        ) : (
          /* ── DEPARTMENT-GROUPED EXAM BOARD ── */
          <div className="space-y-8">
            {Object.entries(byDept).sort(([a],[b])=>a.localeCompare(b)).map(([dept, examList]) => (
              <DeptSection key={dept} dept={dept} examList={examList} scheduling={scheduling} expanded={expanded} setExpanded={setExpanded} onSchedule={schedule}/>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Department Section ─────────────────── */
function DeptSection({ dept, examList, scheduling, expanded, setExpanded, onSchedule }: {
  dept: string; examList: ExamEvent[]; scheduling: string|null;
  expanded: string|null; setExpanded: (v:string|null)=>void;
  onSchedule: (t:string,s:string)=>void;
}) {
  const pending   = examList.filter(e=>e.examStatus==='Pending').length;
  const completed = examList.filter(e=>['Completed','Trained'].includes(e.examStatus)).length;
  const inProg    = examList.filter(e=>e.examStatus==='In Progress').length;
  const pct       = examList.length ? Math.round((completed/examList.length)*100) : 0;
  const grad      = getDeptColor(dept);

  return (
    <div className="rounded-3xl overflow-hidden" style={{ background:'rgba(255,255,255,0.018)', border:'1px solid rgba(255,255,255,0.05)' }}>
      {/* Dept header */}
      <div className={`bg-gradient-to-r ${grad} px-6 py-5`} style={{ opacity:0.95 }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
              <Building2 className="h-5 w-5 text-white"/>
            </div>
            <div>
              <p className="text-[10px] font-black text-white/60 uppercase tracking-[0.25em]">Department</p>
              <h2 className="text-xl font-black text-white tracking-tight">{dept}</h2>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 text-white/80">
              <div className="text-center">
                <p className="text-xl font-black text-white">{examList.length}</p>
                <p className="text-[8px] uppercase tracking-widest text-white/50">Exams</p>
              </div>
              <div className="w-px h-8 bg-white/20"/>
              <div className="text-center">
                <p className="text-xl font-black text-amber-200">{pending}</p>
                <p className="text-[8px] uppercase tracking-widest text-white/50">Pending</p>
              </div>
              <div className="w-px h-8 bg-white/20"/>
              <div className="text-center">
                <p className="text-xl font-black text-emerald-200">{completed}</p>
                <p className="text-[8px] uppercase tracking-widest text-white/50">Done</p>
              </div>
            </div>
            {/* Mini progress */}
            <div className="flex flex-col items-end gap-1.5">
              <span className="text-white font-black text-sm">{pct}%</span>
              <div className="w-24 h-2 bg-white/15 rounded-full overflow-hidden">
                <div className="h-full bg-white/70 rounded-full transition-all" style={{ width:`${pct}%` }}/>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Exam cards grid */}
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {examList.map((ev, i) => {
          const meta  = STATUS_META[ev.examStatus] ?? STATUS_META['Pending'];
          const key   = `${ev.trainerName??''}::${ev.sopIdentifier}`;
          const isExp = expanded === `${dept}::${i}`;
          const empKey= `${dept}::${i}`;

          return (
            <div key={i} className={`rounded-2xl overflow-hidden transition-all hover:translate-y-[-1px] ${meta.bg} ${meta.border} border`}>
              {/* Card top bar */}
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-start justify-between gap-2 mb-3">
                  {/* SOP badge */}
                  <div>
                    <span className="inline-block font-mono font-black text-[11px] px-2 py-0.5 rounded-lg mb-1.5" style={{ background:'rgba(255,255,255,0.07)', color:'#c4b5fd' }}>
                      {ev.sopIdentifier}
                    </span>
                    <p className="font-bold text-white text-sm leading-snug line-clamp-2">
                      {ev.sopName || 'SOP Exam'}
                    </p>
                  </div>
                  {/* Status pill */}
                  <span className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-xl border text-[9px] font-black uppercase tracking-widest ${meta.bg} ${meta.border} ${meta.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} shrink-0`}/>
                    {meta.label}
                  </span>
                </div>

                {/* Trainer */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-6 w-6 rounded-lg flex items-center justify-center font-black text-[10px] shrink-0 text-white"
                    style={{ background:'rgba(124,58,237,0.4)' }}>
                    {ev.trainerName ? ev.trainerName.charAt(0) : '?'}
                  </div>
                  <span className="text-xs font-bold text-slate-300 truncate">
                    {ev.trainerName || <span className="text-slate-600 italic">No trainer assigned</span>}
                  </span>
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-slate-600"/>
                    {ev.scheduledDate ? new Date(ev.scheduledDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) : 'Mar'}
                  </span>
                  {ev.scheduledWeek && <>
                    <span className="text-slate-700">·</span>
                    <span>{ev.scheduledWeek}</span>
                  </>}
                </div>
              </div>

              {/* Stats strip */}
              <div className="grid grid-cols-3 border-t border-white/[0.06]">
                {[
                  { l:'Employees', v:ev.employeeCount, c:'text-white' },
                  { l:'Pending',   v:ev.pending,       c: ev.pending>0?'text-amber-300':'text-slate-600' },
                  { l:'Done',      v:ev.completed,     c:'text-emerald-300' },
                ].map(({l,v,c})=>(
                  <div key={l} className="py-2.5 text-center border-r border-white/[0.06] last:border-r-0">
                    <p className={`text-sm font-black ${c}`}>{v}</p>
                    <p className="text-[8px] text-slate-700 uppercase tracking-widest mt-0.5">{l}</p>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              {ev.employeeCount > 0 && (
                <div className="px-4 py-2 border-t border-white/[0.04]">
                  <div className="flex justify-between text-[9px] text-slate-700 mb-1">
                    <span>Progress</span>
                    <span className={meta.color}>{Math.round((ev.completed/ev.employeeCount)*100)}%</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background:'rgba(255,255,255,0.05)' }}>
                    <div className={`h-full rounded-full ${meta.dot}`} style={{ width:`${Math.round((ev.completed/ev.employeeCount)*100)}%`, transition:'width 1s ease' }}/>
                  </div>
                </div>
              )}

              {/* Employee list toggle + Action */}
              <div className="border-t border-white/[0.06] flex items-center">
                <button onClick={() => setExpanded(isExp ? null : empKey)}
                  className="flex-1 flex items-center justify-between px-4 py-2.5 text-[10px] font-bold text-slate-600 hover:text-slate-400 transition-colors">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3 w-3"/> View {ev.employeeCount} employees
                  </span>
                  {isExp ? <ChevronUp className="h-3.5 w-3.5"/> : <ChevronDown className="h-3.5 w-3.5"/>}
                </button>
                {ev.pending > 0 && ev.trainerName && (
                  <button onClick={() => onSchedule(ev.trainerName, ev.sopIdentifier)}
                    disabled={scheduling === key}
                    className="flex items-center gap-1.5 px-3 py-2.5 border-l border-white/[0.06] text-[9px] font-black uppercase tracking-widest transition-all hover:opacity-80 disabled:opacity-40"
                    style={{ color:'#a78bfa' }}>
                    {scheduling===key ? <Loader2 className="h-3 w-3 animate-spin"/> : <PlayCircle className="h-3 w-3"/>}
                    Schedule
                  </button>
                )}
              </div>

              {/* Employee dropdown */}
              {isExp && (
                <div className="border-t border-white/[0.06] max-h-40 overflow-y-auto">
                  {ev.employees.map((emp, j) => (
                    <div key={j} className="flex items-center gap-2.5 px-4 py-2 border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02]">
                      <div className="h-5 w-5 rounded-lg flex items-center justify-center font-black text-[9px] shrink-0 text-white" style={{ background:'rgba(99,102,241,0.3)' }}>
                        {emp.charAt(0)}
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 truncate">{emp}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
