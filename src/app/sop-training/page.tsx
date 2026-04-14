'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Upload, RefreshCw, BarChart3, Users,
  Loader2, Search, Calendar, Building2, GraduationCap,
  FileText, ChevronDown, ChevronUp,
  ClipboardList, Hash, ArrowUpDown, ArrowUp, ArrowDown,
  PlayCircle, CheckCircle2, AlertCircle, BookOpen, X, ChevronRight,
  Award, BookOpenCheck, BarChart2, RotateCcw, Trophy, Shield, CalendarClock
} from 'lucide-react';
import Link from 'next/link';
import TrainingMatrixUploadModal from '@/components/TrainingMatrixUploadModal';
import MyResultsTab from '@/components/MyResultsTab';
import RolesTab from '@/components/RolesTab';
import ExamSchedulesTab from '@/components/ExamSchedulesTab';

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

type ActiveTab = 'dashboard' | 'matrix' | 'schedules' | 'profiles' | 'start' | 'results' | 'roles';

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
  const [sopNamesMap, setSopNamesMap] = useState<Record<string, { id: string, name: string }>>({});
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
        setSopNamesMap(json.sopNamesMap || {});
        setFilters(json.filters || { departments: [], years: [], availableMonths: [] });

        // Auto-select current month if data exists for it (ONLY on first load)
        // We'll skip forcing it so that "All Months" actually works.
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedMonth, selectedDept, selectedYear]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const TABS = [
    { id: 'dashboard', label: 'Dashboard',       icon: BarChart3   },
    { id: 'matrix',    label: 'Training Matrix',  icon: FileText    },
    { id: 'schedules', label: 'Exam Tracking',    icon: CalendarClock },
    { id: 'profiles',  label: 'Trainer Profiles', icon: Users       },
    { id: 'start',     label: 'Start Training',   icon: PlayCircle  },
    { id: 'roles',     label: 'Manage Roles',     icon: Shield      },
    { id: 'results',   label: 'My Results',       icon: Trophy      },
  ] as const;

  // ── KPI Cards ──────────────────────────────────────────────────────────────
  const kpiCards = [
    { label: 'Total SOP Trainings',  value: kpi.totalSopExams,  color: 'text-violet-300',  bg: 'from-violet-600/20 to-violet-600/5',   icon: ClipboardList, targetTab: 'dashboard' as ActiveTab },
    { label: 'Employees',            value: kpi.totalEmployees, color: 'text-indigo-300',  bg: 'from-indigo-600/20 to-indigo-600/5',   icon: Users,         targetTab: 'profiles' as ActiveTab },
    { label: 'Departments',          value: kpi.totalDepts,     color: 'text-cyan-300',    bg: 'from-cyan-600/20 to-cyan-600/5',       icon: Building2,     targetTab: 'dashboard' as ActiveTab },
    { label: 'Unique SOP Codes',     value: kpi.totalSopCodes,  color: 'text-emerald-300', bg: 'from-emerald-600/20 to-emerald-600/5', icon: Hash,          targetTab: 'matrix' as ActiveTab },
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
                {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((mName, i) => (
                  <option key={i + 1} value={i + 1}>{mName}</option>
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
            {kpiCards.map(({ label, value, color, bg, icon: Icon, targetTab }) => (
              <button key={label}
                onClick={() => setActiveTab(targetTab)}
                className={`relative group overflow-hidden bg-gradient-to-br ${bg} border border-white/5 rounded-2xl px-5 py-4 text-left transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-white/5`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-2xl font-black ${color} group-hover:brightness-125 transition-all`}>{value}</p>
                    <p className="text-[9px] font-bold text-slate-600 group-hover:text-slate-400 uppercase tracking-widest mt-1 transition-all">{label}</p>
                  </div>
                  <Icon className={`h-8 w-8 ${color} opacity-20 group-hover:opacity-40 group-hover:scale-110 transition-all`} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="max-w-[1600px] mx-auto px-8 py-6 space-y-6">

        {/* Tabs */}
        <div className="flex gap-1 bg-white/[0.03] p-1 rounded-2xl border border-white/5 w-fit flex-wrap">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as ActiveTab)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${
                activeTab === id
                  ? id === 'start'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/30'
                    : id === 'results'
                      ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/30'
                      : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30'
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
            sopNamesMap={sopNamesMap}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
          />
        )}

        {/* ═══════════════════ MATRIX TAB ═══════════════════════════════════ */}
        {activeTab === 'matrix' && (
          <MatrixTab
            employeeTable={employeeTable}
            sopNamesMap={sopNamesMap}
            search={matrixSearch}
            setSearch={setMatrixSearch}
          />
        )}

        {/* ═══════════════════ SCHEDULES TAB ═══════════════════════════════ */}
        {activeTab === 'schedules' && (
          <div className="animation-fade-in">
            <ExamSchedulesTab />
          </div>
        )}

        {/* ═══════════════════ PROFILES TAB ════════════════════════════════ */}
        {activeTab === 'profiles' && (
          <ProfilesTab
            employeeTable={employeeTable}
            sopNamesMap={sopNamesMap}
            search={empSearch}
            setSearch={setEmpSearch}
            expanded={expandedEmp}
            setExpanded={setExpandedEmp}
          />
        )}

        {/* ═══════════════════ START TRAINING TAB ═════════════════════════ */}
        {activeTab === 'start' && (
          <StartTrainingTab />
        )}

        {/* ═══════════════════ MY RESULTS TAB ══════════════════════════════ */}
        {activeTab === 'results' && (
          <MyResultsTab />
        )}

        {/* ═══════════════════ ROLES TAB ═══════════════════════════════════ */}
        {activeTab === 'roles' && (
          <RolesTab />
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

// ─── Sort helper ──────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc' | null;

function SortableHeader({
  label, sortKey, currentKey, dir, onSort
}: {
  label: string;
  sortKey: string;
  currentKey: string;
  dir: SortDir;
  onSort: (key: string) => void;
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className="px-5 py-3.5 text-left cursor-pointer select-none group whitespace-nowrap"
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1.5">
        <span className={`font-black text-[9px] uppercase tracking-[0.15em] transition-colors ${
          active ? 'text-indigo-300' : 'text-slate-500 group-hover:text-slate-300'
        }`}>{label}</span>
        <span className={`transition-colors ${
          active ? 'text-indigo-400' : 'text-slate-700 group-hover:text-slate-500'
        }`}>
          {!active || dir === null ? <ArrowUpDown className="h-3 w-3" /> :
           dir === 'asc' ? <ArrowUp className="h-3 w-3" /> :
           <ArrowDown className="h-3 w-3" />}
        </span>
      </div>
    </th>
  );
}

function useSortState<T>(items: T[], key: keyof T | null, dir: SortDir) {
  return useMemo(() => {
    if (!key || !dir) return items;
    return [...items].sort((a, b) => {
      const av = a[key]; const bv = b[key];
      const n = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return dir === 'asc' ? n : -n;
    });
  }, [items, key, dir]);
}

// ─── Dashboard Tab ─────────────────────────────────────────────────────────────

function DashboardTab({
  loading, monthlySummary, deptBreakdown, employeeTable, sopNamesMap, selectedMonth, setSelectedMonth
}: {
  loading: boolean;
  monthlySummary: MonthSummary[];
  deptBreakdown: DeptBreakdown[];
  employeeTable: EmployeeRow[];
  sopNamesMap: Record<string, { id: string, name: string }>;
  selectedMonth: number | 'all';
  setSelectedMonth: (m: number | 'all') => void;
}) {
  const maxExams = Math.max(...monthlySummary.map(m => m.totalSopExams), 1);

  // Dept table sort
  const [deptSortKey, setDeptSortKey] = useState<keyof DeptBreakdown | null>(null);
  const [deptSortDir, setDeptSortDir] = useState<SortDir>(null);
  const [expandedDept, setExpandedDept] = useState<string | null>(null);

  // Employee table sort
  const [empSortKey, setEmpSortKey] = useState<keyof EmployeeRow | null>(null);
  const [empSortDir, setEmpSortDir] = useState<SortDir>(null);
  const [expandedEmpRow, setExpandedEmpRow] = useState<string | null>(null);

  // Month table sort
  const [monSortKey, setMonSortKey] = useState<keyof MonthSummary | null>(null);
  const [monSortDir, setMonSortDir] = useState<SortDir>(null);

  function cycleSort<K extends string>(key: K, cur: K | null, dir: SortDir,
    setKey: (k: K | null) => void, setDir: (d: SortDir) => void) {
    if (cur !== key) { setKey(key); setDir('asc'); }
    else if (dir === 'asc') setDir('desc');
    else { setKey(null); setDir(null); }
  }

  const sortedDepts    = useSortState(deptBreakdown, deptSortKey, deptSortDir);
  const sortedEmpRows  = useSortState(employeeTable, empSortKey, empSortDir);
  const sortedMonths   = useSortState(monthlySummary, monSortKey, monSortDir);

  // Build a lookup: dept → employees with their SOP codes (for expanded rows)
  const deptEmployeesMap = useMemo(() => {
    const map = new Map<string, Map<string, string[]>>();
    for (const row of employeeTable) {
      if (!map.has(row.department)) map.set(row.department, new Map());
      const empMap = map.get(row.department)!;
      const existing = empMap.get(row.employeeName) || [];
      empMap.set(row.employeeName, [...new Set([...existing, ...row.sopCodes])]);
    }
    return map;
  }, [employeeTable]);

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
                    <p className="text-[9px] text-slate-700 mt-0.5">SOPs scheduled</p>
                  </div>
                  {isSelected && (
                    <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-indigo-400 shadow-[0_0_6px_#818cf8]" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Month-wise sortable table */}
        {monthlySummary.length > 0 && (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.03] border-b border-white/5">
                <tr>
                  <SortableHeader label="Month" sortKey="monthName" currentKey={monSortKey||''} dir={monSortDir}
                    onSort={k => cycleSort(k as keyof MonthSummary, monSortKey, monSortDir, setMonSortKey, setMonSortDir)} />
                  <SortableHeader label="Year" sortKey="year" currentKey={monSortKey||''} dir={monSortDir}
                    onSort={k => cycleSort(k as keyof MonthSummary, monSortKey, monSortDir, setMonSortKey, setMonSortDir)} />
                  <SortableHeader label="Total SOPs" sortKey="totalSopExams" currentKey={monSortKey||''} dir={monSortDir}
                    onSort={k => cycleSort(k as keyof MonthSummary, monSortKey, monSortDir, setMonSortKey, setMonSortDir)} />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {sortedMonths.map(m => (
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
                          <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                            style={{ width: `${(m.totalSopExams / maxExams) * 100}%` }} />
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

      {/* ── Section 2: Department SOP Table (sortable + expandable) ────────── */}
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
            <span className="ml-auto text-[10px] normal-case text-slate-600 font-medium">Click row to expand · Click header to sort</span>
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-5 items-start">
            {deptBreakdown.map(d => (
              <DeptCard 
                key={d.department} 
                dept={d} 
                employees={deptEmployeesMap.has(d.department) ? Array.from(deptEmployeesMap.get(d.department)!.entries()) : []}
                sopNamesMap={sopNamesMap}
              />
            ))}
          </div>
          <div className="overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.03] border-b border-white/5">
                <tr>
                  {/* expand toggle column */}
                  <th className="w-10 px-3 py-3.5" />
                  <SortableHeader label="Department" sortKey="department" currentKey={deptSortKey||''} dir={deptSortDir}
                    onSort={k => cycleSort(k as keyof DeptBreakdown, deptSortKey, deptSortDir, setDeptSortKey, setDeptSortDir)} />
                  <SortableHeader label="Employees" sortKey="employeeCount" currentKey={deptSortKey||''} dir={deptSortDir}
                    onSort={k => cycleSort(k as keyof DeptBreakdown, deptSortKey, deptSortDir, setDeptSortKey, setDeptSortDir)} />
                  <SortableHeader label="SOP Exams" sortKey="totalSopExams" currentKey={deptSortKey||''} dir={deptSortDir}
                    onSort={k => cycleSort(k as keyof DeptBreakdown, deptSortKey, deptSortDir, setDeptSortKey, setDeptSortDir)} />
                  <SortableHeader label="Unique SOP Codes" sortKey="uniqueSops" currentKey={deptSortKey||''} dir={deptSortDir}
                    onSort={k => cycleSort(k as keyof DeptBreakdown, deptSortKey, deptSortDir, setDeptSortKey, setDeptSortDir)} />
                </tr>
              </thead>
              <tbody>
                {sortedDepts.map(d => {
                  const isExp = expandedDept === d.department;
                  const empMap = deptEmployeesMap.get(d.department);
                  const empEntries = empMap ? Array.from(empMap.entries()) : [];
                  return (
                    <React.Fragment key={d.department}>
                      <tr
                        className={`border-b border-white/[0.04] cursor-pointer transition-colors ${
                          isExp ? 'bg-cyan-500/5 border-cyan-500/10' : 'hover:bg-white/[0.015]'
                        }`}
                        onClick={() => setExpandedDept(isExp ? null : d.department)}
                      >
                        <td className="pl-4 pr-2 py-3.5">
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                            isExp ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-slate-500'
                          }`}>
                            {isExp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                              <Building2 className="h-3 w-3 text-cyan-400" />
                            </div>
                            <span className="font-bold text-white">{d.department}</span>
                          </div>
                        </td>
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
                      {/* Expanded employee details */}
                      {isExp && (
                        <tr key={`${d.department}-exp`} className="border-b border-cyan-500/10">
                          <td colSpan={5} className="px-4 pb-4 pt-2 bg-cyan-500/[0.03]">
                            <div className="ml-8 space-y-2">
                              <p className="text-[9px] font-black text-cyan-600 uppercase tracking-widest mb-3">
                                {empEntries.length} employees in {d.department}
                              </p>
                              {empEntries.map(([name, sops]) => (
                                <div key={name} className="flex items-start gap-3 p-3 bg-black/20 rounded-xl border border-white/[0.04]">
                                  <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center font-black text-xs shrink-0">
                                    {name.charAt(0)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-bold text-white text-xs">{name}</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                                      {sops.map(sop => {
                                        const sopData = sopNamesMap[sop] || { id: sop, name: "Unknown SOP" };
                                        return (
                                          <Link href={`/mcq-bank?search=${sopData.id}`} key={sop}
                                            className="group flex flex-col p-2.5 bg-black/40 hover:bg-indigo-600/10 border border-white/5 hover:border-indigo-500/30 rounded-xl transition-all"
                                          >
                                            <span className="text-indigo-400 group-hover:text-indigo-300 font-mono font-black text-[10px] tracking-widest">{sopData.id}</span>
                                            <span className="text-slate-400 group-hover:text-slate-300 text-[10px] truncate mt-0.5" title={sopData.name}>{sopData.name}</span>
                                          </Link>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <span className="shrink-0 text-[10px] font-black text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded-lg px-2 py-1">
                                    {sops.length} SOPs
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Section 3: Employee-Level SOP Training Table (sortable + expandable) */}
      {employeeTable.length > 0 && (
        <div className="bg-white/[0.025] border border-white/5 rounded-3xl p-6">
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-5 flex items-center gap-2">
            <ClipboardList className="h-3.5 w-3.5 text-violet-400" />
            Employee SOP Training Details
            <span className="ml-auto text-[10px] normal-case text-slate-600 font-medium">Click row to expand all SOP codes · Click header to sort</span>
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.03] border-b border-white/5">
                <tr>
                  <th className="w-10 px-3 py-3.5" />
                  <SortableHeader label="Employee Name" sortKey="employeeName" currentKey={empSortKey||''} dir={empSortDir}
                    onSort={k => cycleSort(k as keyof EmployeeRow, empSortKey, empSortDir, setEmpSortKey, setEmpSortDir)} />
                  <SortableHeader label="Department" sortKey="department" currentKey={empSortKey||''} dir={empSortDir}
                    onSort={k => cycleSort(k as keyof EmployeeRow, empSortKey, empSortDir, setEmpSortKey, setEmpSortDir)} />
                  <SortableHeader label="Month" sortKey="month" currentKey={empSortKey||''} dir={empSortDir}
                    onSort={k => cycleSort(k as keyof EmployeeRow, empSortKey, empSortDir, setEmpSortKey, setEmpSortDir)} />
                  <th className="px-5 py-3.5 text-left font-black text-[9px] text-slate-500 uppercase tracking-[0.15em]">SOP Codes (preview)</th>
                  <SortableHeader label="Total" sortKey="totalSopExams" currentKey={empSortKey||''} dir={empSortDir}
                    onSort={k => cycleSort(k as keyof EmployeeRow, empSortKey, empSortDir, setEmpSortKey, setEmpSortDir)} />
                </tr>
              </thead>
              <tbody>
                {sortedEmpRows.map((row, i) => {
                  const rowKey = `${row.employeeName}-${row.department}-${row.month}-${i}`;
                  const isExp = expandedEmpRow === rowKey;
                  return (
                    <React.Fragment key={rowKey}>
                      <tr
                        className={`border-b border-white/[0.04] cursor-pointer transition-colors ${
                          isExp ? 'bg-violet-500/5 border-violet-500/10' : 'hover:bg-white/[0.015]'
                        }`}
                        onClick={() => setExpandedEmpRow(isExp ? null : rowKey)}
                      >
                        <td className="pl-4 pr-2 py-3.5">
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                            isExp ? 'bg-violet-500/20 text-violet-400' : 'bg-white/5 text-slate-500'
                          }`}>
                            {isExp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </div>
                        </td>
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
                        <td className="px-5 py-3.5 font-bold text-slate-300 whitespace-nowrap">
                          {row.monthName} {row.year}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-col gap-1.5 max-w-[400px]">
                            {row.sopCodes.slice(0, 4).map(sop => {
                              const sopData = sopNamesMap[sop] || { id: sop, name: "Unknown SOP" };
                              return (
                                <Link href={`/mcq-bank?search=${sopData.id}`} key={sop}
                                  className="group flex flex-col px-2.5 py-1.5 bg-black/40 hover:bg-indigo-600/10 border border-white/5 hover:border-indigo-500/30 rounded-lg transition-all"
                                >
                                  <span className="text-indigo-400 group-hover:text-indigo-300 font-mono font-black text-[10px] tracking-widest">{sopData.id}</span>
                                  <span className="text-slate-400 group-hover:text-slate-300 text-[10px] truncate max-w-[250px]" title={sopData.name}>{sopData.name}</span>
                                </Link>
                              );
                            })}
                            {row.sopCodes.length > 4 && (
                              <span className="px-1.5 py-0.5 bg-violet-500/10 border border-violet-500/20 rounded w-fit text-violet-400 text-[9px] font-bold">
                                +{row.sopCodes.length - 4} more ↓
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
                      {/* Expanded: full SOP list */}
                      {isExp && (
                        <tr key={`${rowKey}-exp`} className="border-b border-violet-500/10">
                          <td colSpan={6} className="px-4 pb-4 pt-2 bg-violet-500/[0.03]">
                            <div className="ml-8">
                              <p className="text-[9px] font-black text-violet-600 uppercase tracking-widest mb-2">
                                All {row.sopCodes.length} SOP codes for {row.employeeName} — {row.monthName} {row.year}
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mt-2">
                                {row.sopCodes.map((sop, si) => {
                                  const sopData = sopNamesMap[sop] || { id: sop, name: "Unknown SOP" };
                                  return (
                                    <Link href={`/mcq-bank?search=${sopData.id}`} key={sop}
                                      className="group relative flex flex-col p-3 pl-8 bg-black/40 hover:bg-indigo-600/10 border border-white/5 hover:border-indigo-500/30 rounded-xl transition-all"
                                    >
                                      <span className="absolute left-3 top-3 text-[10px] text-slate-600 font-bold group-hover:text-indigo-400">{si + 1}.</span>
                                      <span className="text-indigo-400 group-hover:text-indigo-300 font-mono font-black text-[11px] tracking-widest">{sopData.id}</span>
                                      <span className="text-slate-400 group-hover:text-slate-300 text-xs truncate mt-1" title={sopData.name}>{sopData.name}</span>
                                    </Link>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
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

function DeptCard({ dept, employees = [], sopNamesMap }: { dept: DeptBreakdown, employees?: [string, string[]][], sopNamesMap: Record<string, { id: string, name: string }> }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`bg-white/[0.03] border rounded-2xl flex flex-col transition-all ${
      expanded ? 'border-cyan-500/30 bg-cyan-500/[0.02] shadow-xl shadow-cyan-900/10' : 'border-white/5 hover:border-cyan-500/20'
    }`}>
      {/* Clickable Header */}
      <div className="p-5 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-black text-white text-sm leading-tight group-hover:text-cyan-400 transition-colors">{dept.department}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{dept.employeeCount} employee{dept.employeeCount !== 1 ? 's' : ''}</p>
          </div>
          <div className={`p-2 rounded-lg transition-colors ${
            expanded ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-500/10 text-cyan-400'
          }`}>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center mt-4">
          <div className="bg-indigo-500/5 rounded-xl py-2 border border-indigo-500/10">
            <p className="text-sm font-black text-indigo-300">{dept.totalSopExams}</p>
            <p className="text-[9px] text-slate-600 uppercase">SOP Exams</p>
          </div>
          <div className="bg-cyan-500/5 rounded-xl py-2 border border-cyan-500/10">
            <p className="text-sm font-black text-cyan-300">{dept.uniqueSops}</p>
            <p className="text-[9px] text-slate-600 uppercase">Unique SOPs</p>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && employees.length > 0 && (
        <div className="px-5 pb-5 pt-1 border-t border-white/[0.04] max-h-72 overflow-y-auto">
          <p className="text-[9px] font-black text-cyan-600 uppercase tracking-widest mb-3 mt-3 sticky flex items-center gap-2">
            <Users className="h-3 w-3" />
            {employees.length} employees
          </p>
          <div className="space-y-2">
            {employees.map(([name, sops]) => (
              <div key={name} className="flex items-start gap-3 p-3 bg-black/40 rounded-xl border border-white/[0.04]">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center font-black text-xs shrink-0 text-white">
                  {name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-xs">{name}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {sops.map(sop => {
                      const sopData = sopNamesMap[sop] || { id: sop, name: "Unknown SOP" };
                      return (
                        <Link href={`/mcq-bank?search=${sopData.id}`} key={sop} className="flex flex-col px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded text-indigo-400 hover:text-indigo-200 hover:bg-indigo-500/30 transition-colors group">
                          <span className="font-mono font-black text-[10px] group-hover:text-indigo-300">{sopData.id}</span>
                          <span className="text-[10px] text-slate-500 truncate max-w-[200px] group-hover:text-indigo-400/80 mt-0.5">{sopData.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
                <span className="shrink-0 text-[10px] font-black text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded-lg px-2 py-1">
                  {sops.length}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Matrix Tab ───────────────────────────────────────────────────────────────

function MatrixTab({
  employeeTable, sopNamesMap, search, setSearch
}: {
  employeeTable: EmployeeRow[];
  sopNamesMap: Record<string, { id: string, name: string }>;
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
                    <div className="flex flex-col gap-1.5 max-w-[400px]">
                      {row.sopCodes.slice(0, 5).map(sop => {
                        const sopData = sopNamesMap[sop] || { id: sop, name: "Unknown SOP" };
                        return (
                          <Link href={`/mcq-bank?search=${sopData.id}`} key={sop}
                            className="group flex flex-col px-2.5 py-1.5 bg-black/40 hover:bg-indigo-600/10 border border-white/5 hover:border-indigo-500/30 rounded-lg transition-all"
                          >
                            <span className="text-indigo-400 group-hover:text-indigo-300 font-mono font-black text-[10px] tracking-widest">{sopData.id}</span>
                            <span className="text-slate-400 group-hover:text-slate-300 text-[10px] truncate max-w-[300px]" title={sopData.name}>{sopData.name}</span>
                          </Link>
                        );
                      })}
                      {row.sopCodes.length > 5 && (
                        <span className="text-slate-500 text-[9px] font-bold uppercase tracking-widest mt-1">
                          + {row.sopCodes.length - 5} More SOPs
                        </span>
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
  employeeTable, sopNamesMap, search, setSearch, expanded, setExpanded
}: {
  employeeTable: EmployeeRow[];
  sopNamesMap: Record<string, { id: string, name: string }>;
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                          {bm.sopCodes.map(sop => {
                            const sopData = sopNamesMap[sop] || { id: sop, name: "Unknown SOP" };
                            return (
                              <Link href={`/mcq-bank?search=${sopData.id}`} key={sop}
                                className="group flex flex-col p-3 bg-black/40 hover:bg-indigo-600/10 border border-white/5 hover:border-indigo-500/30 rounded-xl transition-all"
                              >
                                <span className="text-indigo-400 group-hover:text-indigo-300 font-mono font-black text-[11px] tracking-widest">{sopData.id}</span>
                                <span className="text-slate-400 group-hover:text-slate-300 text-xs truncate mt-1" title={sopData.name}>{sopData.name}</span>
                              </Link>
                            );
                          })}
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
// ─── Start Training Tab ────────────────────────────────────────────────────────

interface EmployeeOption {
  employeeName: string;
  departments: string[];
  designations: string[];
}

interface SopResult {
  sopCode: string;
  monthName: string;
  month: number;
  year: number;
  designation?: string;
  hasExam: boolean;
  examId?: string;
  sopName?: string;
  questionCount?: number;
}

function StartTrainingTab() {
  // Form state
  const [empSearch, setEmpSearch] = useState('');
  const [selectedEmp,  setSelectedEmp]  = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedRole, setSelectedRole] = useState('');

  // Data from API
  const [allEmployees, setAllEmployees] = useState<EmployeeOption[]>([]);
  const [roles, setRoles]               = useState<string[]>([]);
  const [sopResults, setSopResults]     = useState<SopResult[] | null>(null);

  // Loading states
  const [loadingEmps,  setLoadingEmps]  = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [loadingSops,  setLoadingSops]  = useState(false);
  const [error, setError] = useState('');

  // Fetch all employees once
  useEffect(() => {
    setLoadingEmps(true);
    fetch('/api/training/employees')
      .then(r => r.json())
      .then(d => { if (d.success) setAllEmployees(d.employees || []); })
      .catch(console.error)
      .finally(() => setLoadingEmps(false));
  }, []);

  // Filter employees by search
  const filteredEmployees = useMemo(() => {
    if (!empSearch) return allEmployees;
    const q = empSearch.toLowerCase();
    return allEmployees.filter(e => e.employeeName.toLowerCase().includes(q));
  }, [allEmployees, empSearch]);

  // Departments for the selected employee
  const availableDepts = useMemo(() => {
    const emp = allEmployees.find(e => e.employeeName === selectedEmp);
    return emp ? emp.departments : [];
  }, [allEmployees, selectedEmp]);

  // Fetch roles when employee + dept selected
  useEffect(() => {
    if (!selectedEmp || !selectedDept) { setRoles([]); return; }
    setLoadingRoles(true);
    fetch(`/api/training/roles?employeeName=${encodeURIComponent(selectedEmp)}&department=${encodeURIComponent(selectedDept)}`)
      .then(r => r.json())
      .then(d => { if (d.success) setRoles(d.roles || []); })
      .catch(console.error)
      .finally(() => setLoadingRoles(false));
  }, [selectedEmp, selectedDept]);

  // Auto-select dept if only one
  useEffect(() => {
    if (availableDepts.length === 1) setSelectedDept(availableDepts[0]);
    else setSelectedDept('');
    setSopResults(null);
    setSelectedRole('');
  }, [selectedEmp, availableDepts.length]);

  const handleFindSOPs = async () => {
    if (!selectedEmp || !selectedDept) return;
    setLoadingSops(true);
    setError('');
    setSopResults(null);
    try {
      const params = new URLSearchParams({
        employeeName: selectedEmp,
        department: selectedDept,
      });
      const res  = await fetch(`/api/training/employee-sops?${params}`);
      const data = await res.json();
      if (data.success) {
        setSopResults(data.sops || []);
      } else {
        setError(data.error || 'Failed to fetch SOPs');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingSops(false);
    }
  };

  const reset = () => {
    setSelectedEmp(''); setSelectedDept(''); setSelectedRole('');
    setSopResults(null); setError(''); setEmpSearch('');
  };

  const sopWithExam    = sopResults?.filter(s => s.hasExam) ?? [];
  const sopWithoutExam = sopResults?.filter(s => !s.hasExam) ?? [];

  return (
    <div className="space-y-6 max-w-4xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-emerald-600/10 to-teal-600/5 border border-emerald-500/20 rounded-3xl p-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-500/20 rounded-2xl border border-emerald-500/30">
            <PlayCircle className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white">Start Your Training</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              Enter your details below. The system will automatically fetch all SOPs assigned to you,
              and show which exams you can take right now.
            </p>
          </div>
        </div>
      </div>

      {/* ── Step 1: Form ───────────────────────────────────────────────────── */}
      <div className="bg-white/[0.025] border border-white/5 rounded-3xl p-6 space-y-5">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <span className="inline-flex h-5 w-5 rounded-full bg-emerald-600/20 text-emerald-400 text-[10px] items-center justify-center font-black">1</span>
          Your Details
        </p>

        {/* Employee Name */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Employee Name *</label>
          {loadingEmps ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading employees...
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={selectedEmp || empSearch}
                onChange={e => { setEmpSearch(e.target.value); setSelectedEmp(''); setSopResults(null); }}
                placeholder="Search your name…"
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm font-bold text-white placeholder-slate-600 outline-none focus:ring-2 ring-emerald-500/40 transition-all"
              />
              {selectedEmp && (
                <button onClick={reset} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {/* Dropdown */}
              {!selectedEmp && empSearch && filteredEmployees.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[#0c0a1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-52 overflow-y-auto">
                  {filteredEmployees.map(emp => (
                    <button
                      key={emp.employeeName}
                      onClick={() => { setSelectedEmp(emp.employeeName); setEmpSearch(''); }}
                      className="w-full px-4 py-3 text-left hover:bg-white/5 transition-colors border-b border-white/[0.04] last:border-0"
                    >
                      <p className="text-sm font-bold text-white">{emp.employeeName}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{emp.departments.join(', ')}</p>
                    </button>
                  ))}
                </div>
              )}
              {!selectedEmp && empSearch && filteredEmployees.length === 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[#0c0a1e] border border-white/10 rounded-xl p-4 text-center">
                  <p className="text-xs text-slate-500">No employee found for "{empSearch}"</p>
                </div>
              )}
            </div>
          )}
          {selectedEmp && (
            <div className="flex items-center gap-2 mt-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-400">{selectedEmp}</span>
            </div>
          )}
        </div>

        {/* Department */}
        {selectedEmp && (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Department *</label>
            {availableDepts.length === 1 ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-sm font-bold text-emerald-400">{availableDepts[0]}</span>
                <span className="text-[10px] text-slate-600">(auto-selected)</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableDepts.map(dept => (
                  <button
                    key={dept}
                    onClick={() => { setSelectedDept(dept === selectedDept ? '' : dept); setSopResults(null); }}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all text-xs font-bold ${
                      selectedDept === dept
                        ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                        : 'bg-white/[0.03] border-white/10 text-slate-400 hover:border-emerald-500/30 hover:text-white'
                    }`}
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    {dept}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Role / Designation */}
        {selectedEmp && selectedDept && (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Role / Designation <span className="text-slate-600 normal-case font-medium">(optional)</span>
            </label>
            {loadingRoles ? (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading roles...
              </div>
            ) : roles.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {roles.map(role => (
                  <button
                    key={role}
                    onClick={() => setSelectedRole(role === selectedRole ? '' : role)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                      selectedRole === role
                        ? 'bg-violet-600/20 border-violet-500/40 text-violet-300'
                        : 'bg-white/[0.03] border-white/10 text-slate-400 hover:border-violet-500/30 hover:text-white'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-600">No specific designation data found in matrix.</p>
            )}
          </div>
        )}

        {/* Submit Button */}
        <button
          disabled={!selectedEmp || !selectedDept || loadingSops}
          onClick={handleFindSOPs}
          className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 text-sm"
        >
          {loadingSops
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Fetching your SOPs…</>
            : <><BookOpen className="h-4 w-4" /> Find My Required SOPs</>
          }
        </button>
      </div>

      {/* ── Step 2: Results ────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {sopResults !== null && (
        <div className="space-y-4">
          {/* Summary badge */}
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <span className="inline-flex h-5 w-5 rounded-full bg-emerald-600/20 text-emerald-400 text-[10px] items-center justify-center font-black">2</span>
              Required SOPs for {selectedEmp} — {selectedDept}
            </p>
            <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-[10px] font-black">
              {sopResults.length} total
            </span>
            <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-[10px] font-black">
              {sopWithExam.length} exam{sopWithExam.length !== 1 ? 's' : ''} available
            </span>
            {sopWithoutExam.length > 0 && (
              <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400 text-[10px] font-black">
                {sopWithoutExam.length} pending exam generation
              </span>
            )}
          </div>

          {sopResults.length === 0 ? (
            <div className="text-center py-12 bg-white/[0.02] border border-white/5 rounded-2xl">
              <BookOpen className="h-8 w-8 text-slate-700 mx-auto mb-2" />
              <p className="text-slate-500 font-bold text-sm">No SOPs found for this employee + department combination.</p>
              <p className="text-slate-700 text-xs mt-1">Check that the training matrix was uploaded correctly.</p>
            </div>
          ) : (
            <div className="bg-white/[0.02] border border-white/5 rounded-3xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-white/[0.03] border-b border-white/5">
                  <tr>
                    <th className="px-5 py-3.5 text-left font-black text-[9px] text-slate-500 uppercase tracking-[0.15em]">SOP Code</th>
                    <th className="px-5 py-3.5 text-left font-black text-[9px] text-slate-500 uppercase tracking-[0.15em]">SOP Name</th>
                    <th className="px-5 py-3.5 text-left font-black text-[9px] text-slate-500 uppercase tracking-[0.15em]">Month</th>
                    <th className="px-5 py-3.5 text-left font-black text-[9px] text-slate-500 uppercase tracking-[0.15em]">Exam</th>
                    <th className="px-5 py-3.5 text-left font-black text-[9px] text-slate-500 uppercase tracking-[0.15em]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sopResults.map((sop, i) => (
                    <tr
                      key={`${sop.sopCode}-${sop.month}-${i}`}
                      className="border-b border-white/[0.04] hover:bg-white/[0.015] transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-300 font-mono font-black text-[11px]">
                          {sop.sopCode}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-300 font-medium max-w-[220px]">
                        {sop.sopName
                          ? <span className="font-bold text-white">{sop.sopName}</span>
                          : <span className="text-slate-600 italic">Name not found</span>
                        }
                      </td>
                      <td className="px-5 py-3.5 text-slate-400 font-bold whitespace-nowrap">
                        {sop.monthName} {sop.year}
                      </td>
                      <td className="px-5 py-3.5">
                        {sop.hasExam ? (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="text-emerald-400 font-bold text-[10px]">
                              {sop.questionCount} Qs
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                            <span className="text-amber-500/80 font-bold text-[10px]">No exam yet</span>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {sop.hasExam ? (
                          <a
                            href={`/sop-training/exam?sopCode=${encodeURIComponent(sop.sopCode)}&employee=${encodeURIComponent(selectedEmp)}&department=${encodeURIComponent(selectedDept)}&month=${sop.month}&year=${sop.year}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg font-bold text-[10px] transition-all shadow-md shadow-emerald-500/20"
                          >
                            <PlayCircle className="h-3 w-3" />
                            Start Exam
                          </a>
                        ) : (
                          <span className="px-3 py-1.5 bg-white/5 text-slate-600 rounded-lg font-bold text-[10px] cursor-not-allowed border border-white/5">
                            Unavailable
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
