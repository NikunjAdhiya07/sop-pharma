'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Upload, RefreshCw, BarChart3, Users,
  Loader2, Search, Calendar, Building2, GraduationCap,
  FileText, ChevronDown, ChevronUp,
  ClipboardList, Hash
} from 'lucide-react';
import TrainingMatrixUploadModal from '@/components/TrainingMatrixUploadModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KPI {
  totalSopExams: number;
  totalEmployees: number;
  totalDepts: number;
  totalSopCodes: number;
}

interface MonthSummary {
  month: number;
  monthName: string;
  year: number;
  totalSopExams: number;
}

interface DeptBreakdown {
  department: string;
  employeeCount: number;
  totalSopExams: number;
  uniqueSops: number;
}

interface EmployeeRow {
  employeeName: string;
  department: string;
  month: number;
  monthName: string;
  year: number;
  sopCodes: string[];
  totalSopExams: number;
}

interface Filters {
  departments: string[];
  years: number[];
  availableMonths: Array<{ month: number; monthName: string }>;
}

type ActiveTab = 'dashboard' | 'matrix' | 'profiles';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentMonthNum(): number {
  return new Date().getMonth() + 1;
}

function fmtMonth(m: number, y: number) {
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[m - 1]} ${y}`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SOPTrainingPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(false);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');

  // Data
  const [kpi, setKpi] = useState<KPI>({ totalSopExams: 0, totalEmployees: 0, totalDepts: 0, totalSopCodes: 0 });
  const [monthlySummary, setMonthlySummary] = useState<MonthSummary[]>([]);
  const [deptBreakdown, setDeptBreakdown] = useState<DeptBreakdown[]>([]);
  const [employeeTable, setEmployeeTable] = useState<EmployeeRow[]>([]);
  const [filters, setFilters] = useState<Filters>({ departments: [], years: [], availableMonths: [] });

  // Profile/matrix tab states
  const [empSearch, setEmpSearch] = useState('');
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [matrixSearch, setMatrixSearch] = useState('');

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedMonth !== 'all') params.set('month', String(selectedMonth));
      if (selectedDept !== 'all') params.set('department', selectedDept);
      if (selectedYear !== 'all') params.set('year', String(selectedYear));

      const res = await fetch(`/api/training/dashboard?${params}`);
      const json = await res.json();

      if (json.success) {
        setKpi(json.kpi);
        setMonthlySummary(json.monthlySummary || []);
        setDeptBreakdown(json.deptBreakdown || []);
        setEmployeeTable(json.employeeTable || []);
        setFilters(json.filters || { departments: [], years: [], availableMonths: [] });

        // Auto-select current month if data exists for it
        if (selectedMonth === 'all' && json.monthlySummary?.length > 0) {
          const cur = currentMonthNum();
          const hasCur = json.monthlySummary.some((m: MonthSummary) => m.month === cur);
          if (hasCur) setSelectedMonth(cur);
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedMonth, selectedDept, selectedYear]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const TABS = [
    { id: 'dashboard', label: 'Dashboard',        icon: BarChart3      },
    { id: 'matrix',    label: 'Training Matrix',   icon: FileText       },
    { id: 'profiles',  label: 'Trainer Profiles',  icon: Users          },
  ] as const;

  // ── KPI Cards ──────────────────────────────────────────────────────────────
  const kpiCards = [
    { label: 'Total SOP Trainings',  value: kpi.totalSopExams,  color: 'text-violet-300',  bg: 'from-violet-600/20 to-violet-600/5',   icon: ClipboardList },
    { label: 'Employees',            value: kpi.totalEmployees, color: 'text-indigo-300',  bg: 'from-indigo-600/20 to-indigo-600/5',   icon: Users         },
    { label: 'Departments',          value: kpi.totalDepts,     color: 'text-cyan-300',    bg: 'from-cyan-600/20 to-cyan-600/5',       icon: Building2     },
    { label: 'Unique SOP Codes',     value: kpi.totalSopCodes,  color: 'text-emerald-300', bg: 'from-emerald-600/20 to-emerald-600/5', icon: Hash          },
  ];

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-white/5"
        style={{ background: 'linear-gradient(135deg, #06011a 0%, #0c0a1e 50%, #04011a 100%)' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[600px] h-[250px] bg-indigo-600/8 rounded-full blur-[100px]" />
          <div className="absolute top-0 right-1/4 w-[400px] h-[200px] bg-violet-600/8 rounded-full blur-[80px]" />
        </div>

        <div className="relative max-w-[1600px] mx-auto px-8 py-7">
          {/* Title + Actions */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-5">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl shadow-lg shadow-indigo-500/30">
                <GraduationCap className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-violet-300 to-pink-300">
                  SOP Training Dashboard
                </h1>
                <p className="text-slate-500 text-xs font-medium mt-0.5">
                  Matrix-based · √ marks only · Monthly Overview
                </p>
              </div>
            </div>

            {/* Filter + Actions */}
            <div className="flex items-center flex-wrap gap-3">
              {/* Year */}
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                className="bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none cursor-pointer"
              >
                <option value="all">All Years</option>
                {filters.years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>

              {/* Month */}
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                className="bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none cursor-pointer"
              >
                <option value="all">All Months</option>
                {filters.availableMonths.map(m => (
                  <option key={m.month} value={m.month}>{m.monthName}</option>
                ))}
              </select>

              {/* Department */}
              <select
                value={selectedDept}
                onChange={e => setSelectedDept(e.target.value)}
                className="bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none cursor-pointer"
              >
                <option value="all">All Departments</option>
                {filters.departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>

              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 rounded-xl font-bold text-xs transition-all shadow-lg shadow-teal-500/20"
              >
                <Upload className="h-3.5 w-3.5" /> Upload Matrix
              </button>

              <button
                onClick={fetchDashboard}
                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            {kpiCards.map(({ label, value, color, bg, icon: Icon }) => (
              <div key={label}
                className={`relative overflow-hidden bg-gradient-to-br ${bg} border border-white/5 rounded-2xl px-5 py-4`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-2xl font-black ${color}`}>{value}</p>
                    <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-1">{label}</p>
                  </div>
                  <Icon className={`h-8 w-8 ${color} opacity-20`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="max-w-[1600px] mx-auto px-8 py-6 space-y-6">

        {/* Tabs */}
        <div className="flex gap-1 bg-white/[0.03] p-1 rounded-2xl border border-white/5 w-fit">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as ActiveTab)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${
                activeTab === id
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30'
                  : 'text-slate-500 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* ═══════════════════ DASHBOARD TAB ════════════════════════════════ */}
        {activeTab === 'dashboard' && (
          <DashboardTab
            loading={loading}
            monthlySummary={monthlySummary}
            deptBreakdown={deptBreakdown}
            employeeTable={employeeTable}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
          />
        )}

        {/* ═══════════════════ MATRIX TAB ═══════════════════════════════════ */}
        {activeTab === 'matrix' && (
          <MatrixTab
            employeeTable={employeeTable}
            search={matrixSearch}
            setSearch={setMatrixSearch}
          />
        )}

        {/* ═══════════════════ PROFILES TAB ════════════════════════════════ */}
        {activeTab === 'profiles' && (
          <ProfilesTab
            employeeTable={employeeTable}
            search={empSearch}
            setSearch={setEmpSearch}
            expanded={expandedEmp}
            setExpanded={setExpandedEmp}
          />
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <TrainingMatrixUploadModal
          isOpen={showUpload}
          onClose={() => setShowUpload(false)}
          onSuccess={() => { setShowUpload(false); fetchDashboard(); }}
        />
      )}
    </div>
  );
}

// ─── Dashboard Tab ─────────────────────────────────────────────────────────────

function DashboardTab({
  loading, monthlySummary, deptBreakdown, employeeTable, selectedMonth, setSelectedMonth
}: {
  loading: boolean;
  monthlySummary: MonthSummary[];
  deptBreakdown: DeptBreakdown[];
  employeeTable: EmployeeRow[];
  selectedMonth: number | 'all';
  setSelectedMonth: (m: number | 'all') => void;
}) {
  const maxExams = Math.max(...monthlySummary.map(m => m.totalSopExams), 1);

  return (
    <div className="space-y-6">
      {/* ── Section 1: Monthly SOP Training Overview ───────────────────────── */}
      <div className="bg-white/[0.025] border border-white/5 rounded-3xl p-6">
        <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-indigo-400" />
          Monthly SOP Training Overview
          <span className="ml-auto text-[10px] normal-case text-slate-600 font-medium">
            Click a month to filter
          </span>
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 text-indigo-400 animate-spin" />
          </div>
        ) : monthlySummary.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {monthlySummary.map(m => {
              const barH = Math.round((m.totalSopExams / maxExams) * 100);
              const isSelected = selectedMonth === m.month;
              return (
                <button
                  key={`${m.year}-${m.month}`}
                  onClick={() => setSelectedMonth(isSelected ? 'all' : m.month)}
                  className={`group relative flex flex-col items-center justify-between p-4 rounded-2xl border transition-all duration-200 cursor-pointer text-left ${
                    isSelected
                      ? 'bg-indigo-600/20 border-indigo-500/50 shadow-lg shadow-indigo-500/10'
                      : 'bg-black/20 border-white/5 hover:border-indigo-500/30 hover:bg-indigo-600/5'
                  }`}
                >
                  {/* Mini bar chart */}
                  <div className="w-full h-12 flex items-end justify-center mb-3">
                    <div
                      className={`w-6 rounded-t-md transition-all duration-500 ${
                        isSelected ? 'bg-indigo-400' : 'bg-indigo-600/40 group-hover:bg-indigo-500/60'
                      }`}
                      style={{ height: `${Math.max(barH, 8)}%` }}
                    />
                  </div>
                  <div className="text-center">
                    <p className={`text-2xl font-black ${isSelected ? 'text-indigo-300' : 'text-white'}`}>
                      {m.totalSopExams}
                    </p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                      {m.monthName.substring(0, 3)} {m.year}
                    </p>
                    <p className="text-[9px] text-slate-700 mt-0.5">SOP trainings</p>
                  </div>
                  {isSelected && (
                    <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-indigo-400 shadow-[0_0_6px_#818cf8]" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Month-wise table */}
        {monthlySummary.length > 0 && (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.03] border-b border-white/5">
                <tr>
                  {['Month', 'Year', 'Total SOP Trainings'].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left font-black text-[9px] text-slate-500 uppercase tracking-[0.15em]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {monthlySummary.map(m => (
                  <tr
                    key={`${m.year}-${m.month}`}
                    className={`hover:bg-white/[0.02] cursor-pointer transition-colors ${selectedMonth === m.month ? 'bg-indigo-600/5' : ''}`}
                    onClick={() => setSelectedMonth(selectedMonth === m.month ? 'all' : m.month)}
                  >
                    <td className="px-5 py-3.5 font-bold text-white">{m.monthName}</td>
                    <td className="px-5 py-3.5 text-slate-400">{m.year}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 max-w-[120px] h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                            style={{ width: `${(m.totalSopExams / maxExams) * 100}%` }}
                          />
                        </div>
                        <span className="font-black text-indigo-300">{m.totalSopExams}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 2: Department SOP Table ────────────────────────────────── */}
      {deptBreakdown.length > 0 && (
        <div className="bg-white/[0.025] border border-white/5 rounded-3xl p-6">
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-5 flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-cyan-400" />
            Department SOP Table
            {selectedMonth !== 'all' && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-400 text-[9px] font-bold border border-indigo-500/30">
                Filtered by selected month
              </span>
            )}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mb-5">
            {deptBreakdown.map(d => (
              <DeptCard key={d.department} dept={d} />
            ))}
          </div>
          {/* Dept table */}
          <div className="overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.03] border-b border-white/5">
                <tr>
                  {['Department', 'Employees', 'SOP Exams This Month', 'Unique SOP Codes'].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left font-black text-[9px] text-slate-500 uppercase tracking-[0.15em]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {deptBreakdown.map(d => (
                  <tr key={d.department} className="hover:bg-white/[0.015] transition-colors">
                    <td className="px-5 py-3.5 font-bold text-white">{d.department}</td>
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3 w-3 text-slate-600" />
                        <span className="font-bold text-slate-300">{d.employeeCount}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-black text-indigo-300">{d.totalSopExams}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded-md text-cyan-400 font-bold">{d.uniqueSops}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Section 3: Employee-Level SOP Training Table ─────────────────── */}
      {employeeTable.length > 0 && (
        <div className="bg-white/[0.025] border border-white/5 rounded-3xl p-6">
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-5 flex items-center gap-2">
            <ClipboardList className="h-3.5 w-3.5 text-violet-400" />
            Employee SOP Training Details
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.03] border-b border-white/5">
                <tr>
                  {['Employee Name', 'Department', 'Month', 'SOP Codes', 'Total SOP Exams'].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left font-black text-[9px] text-slate-500 uppercase tracking-[0.15em] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {employeeTable.map((row, i) => (
                  <tr key={`${row.employeeName}-${row.month}-${i}`}
                    className="hover:bg-white/[0.015] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center font-black text-xs shrink-0">
                          {row.employeeName.charAt(0)}
                        </div>
                        <span className="font-bold text-white">{row.employeeName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 bg-slate-800/50 rounded-md text-slate-400 font-bold text-[10px]">{row.department}</span>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-slate-300">
                      {row.monthName} {row.year}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1 max-w-[320px]">
                        {row.sopCodes.slice(0, 6).map(sop => (
                          <span key={sop}
                            className="px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded text-indigo-400 font-mono font-black text-[9px]">
                            {sop}
                          </span>
                        ))}
                        {row.sopCodes.length > 6 && (
                          <span className="px-1.5 py-0.5 bg-white/5 rounded text-slate-500 text-[9px] font-bold">
                            +{row.sopCodes.length - 6} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center justify-center min-w-[36px] h-7 bg-violet-500/10 text-violet-300 border border-violet-500/20 rounded-lg font-black text-sm">
                        {row.totalSopExams}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state when no data at all */}
      {!loading && monthlySummary.length === 0 && deptBreakdown.length === 0 && (
        <EmptyState />
      )}
    </div>
  );
}

// ─── Dept Card ─────────────────────────────────────────────────────────────────

function DeptCard({ dept }: { dept: DeptBreakdown }) {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 space-y-3 hover:border-cyan-500/20 transition-all">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-black text-white text-sm leading-tight">{dept.department}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{dept.employeeCount} employee{dept.employeeCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="p-2 bg-cyan-500/10 rounded-lg">
          <Building2 className="h-3.5 w-3.5 text-cyan-400" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="bg-indigo-500/5 rounded-xl py-2">
          <p className="text-sm font-black text-indigo-300">{dept.totalSopExams}</p>
          <p className="text-[9px] text-slate-600 uppercase">SOP Exams</p>
        </div>
        <div className="bg-cyan-500/5 rounded-xl py-2">
          <p className="text-sm font-black text-cyan-300">{dept.uniqueSops}</p>
          <p className="text-[9px] text-slate-600 uppercase">Unique SOPs</p>
        </div>
      </div>
    </div>
  );
}

// ─── Matrix Tab ───────────────────────────────────────────────────────────────

function MatrixTab({
  employeeTable, search, setSearch
}: {
  employeeTable: EmployeeRow[];
  search: string;
  setSearch: (s: string) => void;
}) {
  const filtered = useMemo(() => {
    if (!search) return employeeTable;
    const q = search.toLowerCase();
    return employeeTable.filter(r =>
      r.employeeName.toLowerCase().includes(q) ||
      r.department.toLowerCase().includes(q) ||
      r.sopCodes.some(s => s.toLowerCase().includes(q))
    );
  }, [employeeTable, search]);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employee, department, SOP…"
            className="w-full bg-black/50 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs font-bold text-white placeholder-slate-600 outline-none focus:ring-2 ring-indigo-500/50"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white/[0.02] border border-white/5 rounded-3xl overflow-hidden">
        <div className="px-6 py-3 border-b border-white/5">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{filtered.length} Records (√-marked only)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-white/[0.02] border-b border-white/5">
              <tr>
                {['Employee', 'Department', 'Month', 'Year', 'SOP Codes', 'Count'].map(h => (
                  <th key={h} className="px-5 py-4 text-left font-black text-[9px] text-slate-500 uppercase tracking-[0.2em]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-600 font-bold text-sm">
                    {employeeTable.length === 0 ? 'No matrix data. Upload a training matrix to begin.' : 'No records match your search.'}
                  </td>
                </tr>
              ) : filtered.map((row, i) => (
                <tr key={`${row.employeeName}-${row.month}-${i}`}
                  className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center font-black text-xs shrink-0">
                        {row.employeeName.charAt(0)}
                      </div>
                      <span className="font-bold text-white">{row.employeeName}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="px-2 py-0.5 bg-slate-800/50 rounded-md text-slate-400 font-bold text-[10px]">{row.department}</span>
                  </td>
                  <td className="px-5 py-4 text-slate-400 font-bold">{row.monthName}</td>
                  <td className="px-5 py-4 text-slate-500">{row.year}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1 max-w-[300px]">
                      {row.sopCodes.slice(0, 5).map(sop => (
                        <span key={sop}
                          className="px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded text-indigo-400 font-mono font-black text-[9px]">
                          {sop}
                        </span>
                      ))}
                      {row.sopCodes.length > 5 && (
                        <span className="text-slate-600 text-[9px] font-bold">+{row.sopCodes.length - 5}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-black text-violet-300">{row.totalSopExams}</span>
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

// ─── Profiles Tab ─────────────────────────────────────────────────────────────

function ProfilesTab({
  employeeTable, search, setSearch, expanded, setExpanded
}: {
  employeeTable: EmployeeRow[];
  search: string;
  setSearch: (s: string) => void;
  expanded: string | null;
  setExpanded: (k: string | null) => void;
}) {
  // Group by employee → aggregate all their SOPs across months
  const profiles = useMemo(() => {
    const map = new Map<string, {
      employeeName: string;
      department: string;
      totalSopExams: number;
      months: string[];
      allSops: string[];
      byMonth: Array<{ monthName: string; year: number; sopCodes: string[] }>;
    }>();

    for (const row of employeeTable) {
      const key = `${row.employeeName}__${row.department}`;
      if (!map.has(key)) {
        map.set(key, {
          employeeName: row.employeeName,
          department: row.department,
          totalSopExams: 0,
          months: [],
          allSops: [],
          byMonth: [],
        });
      }
      const p = map.get(key)!;
      p.totalSopExams += row.totalSopExams;
      p.allSops.push(...row.sopCodes.filter(s => !p.allSops.includes(s)));
      p.months.push(`${row.monthName} ${row.year}`);
      p.byMonth.push({ monthName: row.monthName, year: row.year, sopCodes: row.sopCodes });
    }

    return Array.from(map.values()).filter(p => {
      if (!search) return true;
      const q = search.toLowerCase();
      return p.employeeName.toLowerCase().includes(q) || p.department.toLowerCase().includes(q);
    }).sort((a, b) => b.totalSopExams - a.totalSopExams);
  }, [employeeTable, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-violet-400" /> Trainer Profiles ({profiles.length})
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employee…"
            className="bg-black/50 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-white placeholder-slate-600 outline-none focus:ring-2 ring-indigo-500/50 w-56"
          />
        </div>
      </div>

      {profiles.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {profiles.map(p => {
            const key = `${p.employeeName}__${p.department}`;
            const isExp = expanded === key;
            return (
              <div key={key} className="bg-white/[0.025] border border-white/[0.06] rounded-2xl overflow-hidden hover:border-indigo-500/20 transition-all">
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer"
                  onClick={() => setExpanded(isExp ? null : key)}
                >
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center font-black text-sm shadow-md shrink-0">
                    {p.employeeName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3">
                      <p className="font-black text-white text-sm">{p.employeeName}</p>
                      <span className="px-2 py-0.5 bg-slate-800/60 rounded-md text-[10px] font-bold text-slate-400 uppercase">
                        {p.department}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      {[...new Set(p.months)].slice(0, 4).join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-6 shrink-0">
                    <div className="text-center">
                      <p className="text-lg font-black text-violet-300">{p.totalSopExams}</p>
                      <p className="text-[9px] text-slate-600 uppercase tracking-wide">SOP Exams</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-black text-indigo-300">{p.allSops.length}</p>
                      <p className="text-[9px] text-slate-600 uppercase tracking-wide">Unique SOPs</p>
                    </div>
                    {isExp ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                  </div>
                </div>

                {isExp && (
                  <div className="border-t border-white/5 px-6 pb-5 pt-4 space-y-4">
                    {p.byMonth.map((bm, bi) => (
                      <div key={bi}>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                          {bm.monthName} {bm.year} · {bm.sopCodes.length} SOPs
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {bm.sopCodes.map(sop => (
                            <span key={sop}
                              className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded-md text-indigo-400 font-mono font-black text-[10px]">
                              {sop}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="text-center py-20 bg-white/[0.02] border border-white/5 rounded-3xl">
      <GraduationCap className="h-10 w-10 text-slate-700 mx-auto mb-3" />
      <p className="text-slate-500 font-bold">No training matrix data found.</p>
      <p className="text-slate-700 text-xs mt-1">Upload a training matrix (.docx or .xlsx) to get started.</p>
    </div>
  );
}


