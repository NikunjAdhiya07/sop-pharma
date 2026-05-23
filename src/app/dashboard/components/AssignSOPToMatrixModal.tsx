"use client";

import { useState, useEffect, useMemo } from "react";
import {
  X,
  Search,
  CheckCircle,
  AlertTriangle,
  ClipboardList,
  ChevronDown,
} from "lucide-react";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function stripVersion(code: string): string {
  return String(code || "").toUpperCase().replace(/-\d+$/, "").trim();
}

type MasterEmployee = { name: string; designation: string; department: string };
type UploadContext  = { month: number; year: number; monthName: string } | null;

// ─── Main Export: single-screen Assign SOP to Matrix ─────────────────────────
export default function AssignSOPToMatrixModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess?: () => void;
}) {
  // ── SOP search/selection ──────────────────────────────────────────────────
  const [dept,         setDept]         = useState("QA");
  const [search,       setSearch]       = useState("");
  const [sopList,      setSopList]      = useState<any[]>([]);
  const [sopLoading,   setSopLoading]   = useState(false);
  const [selectedSop,  setSelectedSop]  = useState<any | null>(null);
  const [uploadContext, setUploadContext] = useState<UploadContext>(null);

  // ── Employee & department data ────────────────────────────────────────────
  const [allEmployees,    setAllEmployees]    = useState<MasterEmployee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [allDepts,        setAllDepts]        = useState<string[]>([]);

  // ── Hierarchy selection (flat composite-key sets) ─────────────────────────
  const [selectedDepts,  setSelectedDepts]  = useState<Set<string>>(new Set());
  const [selectedDesigs, setSelectedDesigs] = useState<Set<string>>(new Set());
  const [selectedEmps,   setSelectedEmps]   = useState<Set<string>>(new Set());

  // ── Monthly schedule ──────────────────────────────────────────────────────
  const [schedule,       setSchedule]       = useState<Record<string, number>>({});
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [effectiveMonth, setEffectiveMonth] = useState(new Date().getMonth() + 1);
  const [effectiveYear,  setEffectiveYear]  = useState(new Date().getFullYear());

  // ── Submit state ──────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const dk = (d: string, desig: string) => `${d}::${desig}`;
  const ek = (d: string, name: string)  => `${d}::${name}`;
  const sk = (m: number, y: number)     => `${m}-${y}`;

  // Build dept → designation → employees hierarchy
  const deptGroups = useMemo(() => {
    const map = new Map<string, Map<string, MasterEmployee[]>>();
    for (const emp of allEmployees) {
      if (!map.has(emp.department)) map.set(emp.department, new Map());
      const dm = map.get(emp.department)!;
      const desig = emp.designation || "Unassigned";
      if (!dm.has(desig)) dm.set(desig, []);
      dm.get(desig)!.push(emp);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([department, dm]) => ({
        department,
        designations: Array.from(dm.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([designation, employees]) => ({ designation, employees })),
        allEmployees: Array.from(dm.values()).flat(),
      }));
  }, [allEmployees]);

  // ── Load unassigned SOPs ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setSopLoading(true);
    const t = setTimeout(async () => {
      try {
        const url = `/api/training-matrix/unassigned-sops?department=${encodeURIComponent(dept)}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
        const res  = await fetch(url);
        const json = await res.json();
        if (cancelled) return;
        setSopList(json.unassigned || []);
        setUploadContext(json.uploadContext || null);
        if (json.uploadContext) {
          setEffectiveMonth(json.uploadContext.month);
          setEffectiveYear(json.uploadContext.year);
        }
      } finally {
        if (!cancelled) setSopLoading(false);
      }
    }, search ? 300 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [dept, search]);

  // ── Load employees & departments (once) ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setEmployeesLoading(true);
    (async () => {
      try {
        const res  = await fetch("/api/employees");
        const json = await res.json();
        if (cancelled) return;
        const emps: MasterEmployee[] = (json.employees || [])
          .filter((e: any) => e.name && e.isActive !== false && e.department)
          .map((e: any) => ({
            name:        e.name,
            designation: e.designation || "Unassigned",
            department:  e.department,
          }));
        setAllEmployees(emps);
        const depts = Array.from(new Set(emps.map((e) => e.department))).sort();
        setAllDepts(depts.length ? depts : ["QA","QC","Microbiology","Production","Store","Engineering","Personnel"]);
      } finally {
        if (!cancelled) setEmployeesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── When a SOP is selected, pre-select default dept + its employees ───────
  useEffect(() => {
    if (!selectedSop || allEmployees.length === 0) return;
    const actualDept = allEmployees.find((e) => e.department.toLowerCase() === dept.toLowerCase())?.department || dept;
    const targetEmps = allEmployees.filter((e) => e.department.toLowerCase() === dept.toLowerCase());
    setSelectedDepts(new Set([actualDept]));
    setSelectedDesigs(new Set(targetEmps.map((e) => dk(e.department, e.designation))));
    setSelectedEmps(new Set(targetEmps.map((e) => ek(e.department, e.name))));
  }, [selectedSop, allEmployees, dept]);

  // ── Load monthly schedule when SOP is selected ────────────────────────────
  useEffect(() => {
    if (!selectedSop) { setSchedule({}); return; }
    let cancelled = false;
    setScheduleLoading(true);
    (async () => {
      try {
        const code = stripVersion(String(selectedSop.identifier || ""));
        const res  = await fetch(`/api/training-matrix/monthly-schedule?sopCode=${encodeURIComponent(code)}`);
        const json = await res.json();
        if (cancelled) return;
        const init: Record<string, number> = {};
        for (const item of (json.schedule || [])) init[sk(item.month, item.year)] = item.count;
        setSchedule(init);
      } finally {
        if (!cancelled) setScheduleLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedSop]);

  // ── Toggle handlers ───────────────────────────────────────────────────────
  const toggleDept = (d: string) => {
    const group = deptGroups.find((g) => g.department === d);
    if (!group) return;
    if (selectedDepts.has(d)) {
      setSelectedDepts((p)  => { const s = new Set(p); s.delete(d); return s; });
      setSelectedDesigs((p) => { const s = new Set(p); group.designations.forEach((dg) => s.delete(dk(d, dg.designation))); return s; });
      setSelectedEmps((p)   => { const s = new Set(p); group.allEmployees.forEach((e) => s.delete(ek(d, e.name))); return s; });
    } else {
      setSelectedDepts((p)  => { const s = new Set(p); s.add(d); return s; });
      setSelectedDesigs((p) => { const s = new Set(p); group.designations.forEach((dg) => s.add(dk(d, dg.designation))); return s; });
      setSelectedEmps((p)   => { const s = new Set(p); group.allEmployees.forEach((e) => s.add(ek(d, e.name))); return s; });
    }
  };

  const toggleDesig = (d: string, designation: string) => {
    const group      = deptGroups.find((g) => g.department === d);
    const desigGroup = group?.designations.find((dg) => dg.designation === designation);
    if (!desigGroup) return;
    const key = dk(d, designation);
    if (selectedDesigs.has(key)) {
      setSelectedDesigs((p) => { const s = new Set(p); s.delete(key); return s; });
      setSelectedEmps((p)   => { const s = new Set(p); desigGroup.employees.forEach((e) => s.delete(ek(d, e.name))); return s; });
    } else {
      setSelectedDesigs((p) => { const s = new Set(p); s.add(key); return s; });
      setSelectedEmps((p)   => { const s = new Set(p); desigGroup.employees.forEach((e) => s.add(ek(d, e.name))); return s; });
    }
  };

  const toggleEmp = (d: string, name: string) => {
    const key = ek(d, name);
    setSelectedEmps((p) => { const s = new Set(p); if (s.has(key)) s.delete(key); else s.add(key); return s; });
  };

  const selectedEmpCount  = selectedEmps.size;
  const selectedDeptCount = selectedDepts.size;

  const monthsGrid = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => {
      const m = ((effectiveMonth - 1 + i) % 12) + 1;
      const y = effectiveYear + Math.floor((effectiveMonth - 1 + i) / 12);
      return { month: m, year: y, key: sk(m, y), label: MONTHS[m - 1].slice(0, 3), yr: String(y).slice(2) };
    }),
  [effectiveMonth, effectiveYear]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedSop) { setError("Select a SOP first."); return; }
    const byDept = new Map<string, Array<{ name: string; designation: string; trainingStatus: string }>>();
    for (const emp of allEmployees) {
      if (!selectedEmps.has(ek(emp.department, emp.name))) continue;
      if (!byDept.has(emp.department)) byDept.set(emp.department, []);
      byDept.get(emp.department)!.push({ name: emp.name, designation: emp.designation, trainingStatus: "pending" });
    }
    if (byDept.size === 0) { setError("Select at least one employee."); return; }
    setSaving(true);
    setError("");
    try {
      const results = await Promise.all(
        Array.from(byDept.entries()).map(async ([department, employees]) => {
          const res  = await fetch("/api/training-matrix/assign-sop-to-matrix", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ department, sopId: selectedSop._id, month: effectiveMonth, year: effectiveYear, employees, createdBy: "admin" }),
          });
          const json = await res.json();
          return { department, ok: res.ok, error: json?.error };
        }),
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length) {
        setError(`Failed for: ${failed.map((f) => `${f.department} (${f.error || "unknown"})`).join(", ")}`);
        setSaving(false);
        return;
      }
      onSuccess?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-purple-300 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl" style={{ maxHeight: "92vh" }}>

        {/* ── Modal Header ── */}
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow">
              <ClipboardList className="h-5 w-5 text-white" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Assign SOP to Training Matrix</h2>
              <p className="text-[11px] text-gray-400">Select a SOP, then configure departments, employees &amp; schedule</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto divide-y divide-gray-100">

          {/* ── SECTION 1: SOP Selection ── */}
          <div className="px-5 py-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-[10px] font-bold text-white">1</span>
              <p className="text-xs font-bold text-gray-800">Select SOP</p>
              {selectedSop && (
                <button
                  onClick={() => setSelectedSop(null)}
                  className="ml-auto text-[10px] font-medium text-purple-600 hover:text-purple-800 underline"
                >
                  Change SOP
                </button>
              )}
            </div>

            {selectedSop ? (
              /* Selected SOP pill */
              <div className="flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm font-bold text-purple-700">{selectedSop.identifier}</p>
                  <p className="mt-0.5 text-xs text-gray-600 truncate">{selectedSop.name}</p>
                </div>
                <span className="rounded-full bg-purple-200 px-2.5 py-0.5 text-[10px] font-bold text-purple-800">Selected</span>
              </div>
            ) : (
              /* SOP search UI */
              <>
                <div className="flex items-center gap-2 mb-3">
                  <select
                    value={dept}
                    onChange={(e) => setDept(e.target.value)}
                    className={`${inputCls} min-w-[100px]`}
                  >
                    {allDepts.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search SOP code or name…"
                      className={`w-full py-1.5 pl-8 pr-3 ${inputCls}`}
                    />
                  </div>
                  <span className="shrink-0 text-[11px] text-gray-400">
                    {sopLoading ? "searching…" : `${sopList.length} found`}
                  </span>
                </div>

                {sopLoading ? (
                  <div className="flex items-center justify-center py-8 text-xs text-gray-400">Loading SOPs…</div>
                ) : sopList.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-xs text-gray-400">
                    {search ? "No SOPs match your search." : "All SOPs are already in the matrix for this department."}
                  </div>
                ) : (
                  <div className="max-h-52 overflow-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                    {sopList.map((s: any) => (
                      <button
                        key={s._id}
                        type="button"
                        onClick={() => { setSelectedSop(s); setSearch(""); }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-purple-50/60 transition-colors"
                      >
                        <span className="shrink-0 font-mono text-xs font-bold text-purple-600">{s.identifier}</span>
                        <span className="flex-1 truncate text-xs text-gray-700">{s.name}</span>
                        <span className="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                          + Select
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Sections 2–6 only shown after SOP is selected ── */}
          {selectedSop && (
            <>
              {/* ── SECTION 2: Departments ── */}
              <div className="px-5 py-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-[10px] font-bold text-white">2</span>
                  <p className="text-xs font-bold text-gray-800">Departments</p>
                  <span className="ml-auto text-[10px] text-gray-400">{selectedDeptCount} selected</span>
                </div>
                {employeesLoading ? (
                  <p className="text-xs text-gray-400">Loading departments…</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {deptGroups.map(({ department: d }) => {
                      const checked   = selectedDepts.has(d);
                      const isDefault = d.toLowerCase() === dept.toLowerCase();
                      return (
                        <label
                          key={d}
                          className={`flex cursor-pointer select-none items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${
                            checked
                              ? "border-purple-400 bg-purple-100 text-purple-800 shadow-sm"
                              : "border-gray-200 bg-white text-gray-500 hover:border-purple-200 hover:bg-purple-50/60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleDept(d)}
                            className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          />
                          {d}
                          {isDefault && (
                            <span className="rounded-full bg-purple-300/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-purple-700">
                              default
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── SECTION 3: Designations ── */}
              {selectedDepts.size > 0 && (
                <div className="px-5 py-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white">3</span>
                    <p className="text-xs font-bold text-gray-800">Designations</p>
                    <span className="ml-auto text-[10px] text-gray-400">auto-selected per department</span>
                  </div>
                  <div className="space-y-3">
                    {deptGroups
                      .filter((g) => selectedDepts.has(g.department))
                      .map((g) => (
                        <div key={g.department}>
                          <p className="mb-1.5 text-[11px] font-bold text-gray-600">{g.department}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {g.designations.map(({ designation }) => {
                              const key     = dk(g.department, designation);
                              const checked = selectedDesigs.has(key);
                              return (
                                <label
                                  key={key}
                                  className={`flex cursor-pointer select-none items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-all ${
                                    checked
                                      ? "border-indigo-300 bg-indigo-100 text-indigo-800"
                                      : "border-gray-200 bg-gray-50 text-gray-500 hover:border-indigo-200"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleDesig(g.department, designation)}
                                    className="h-3 w-3 cursor-pointer rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                  />
                                  {designation}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* ── SECTION 4: Employees ── */}
              {selectedDepts.size > 0 && (
                <div className="px-5 py-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500 text-[10px] font-bold text-white">4</span>
                    <p className="text-xs font-bold text-gray-800">Employees</p>
                    <span className="ml-auto rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-700">
                      {selectedEmpCount} selected
                    </span>
                  </div>
                  <div className="space-y-4">
                    {deptGroups
                      .filter((g) => selectedDepts.has(g.department))
                      .map((g) => {
                        const visibleDesigs = g.designations.filter((dg) => selectedDesigs.has(dk(g.department, dg.designation)));
                        if (visibleDesigs.length === 0) return null;
                        return (
                          <div key={g.department}>
                            <p className="mb-2 text-xs font-bold text-gray-700">{g.department}</p>
                            <div className="space-y-2">
                              {visibleDesigs.map(({ designation, employees }) => {
                                const selCount = employees.filter((e) => selectedEmps.has(ek(g.department, e.name))).length;
                                return (
                                  <div key={designation} className="overflow-hidden rounded-xl border border-gray-100">
                                    <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50/80 px-3 py-1.5">
                                      <span className="text-[11px] font-semibold text-gray-600">{designation}</span>
                                      <span className="ml-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] text-gray-500">
                                        {selCount}/{employees.length}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-x-5 gap-y-1.5 px-3 py-2.5">
                                      {employees.map((emp) => {
                                        const eKey   = ek(g.department, emp.name);
                                        const empSel = selectedEmps.has(eKey);
                                        return (
                                          <label key={eKey} className="flex cursor-pointer items-center gap-1.5 hover:text-purple-700">
                                            <input
                                              type="checkbox"
                                              checked={empSel}
                                              onChange={() => toggleEmp(g.department, emp.name)}
                                              className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                            />
                                            <span className={`text-xs ${empSel ? "text-gray-900 font-medium" : "text-gray-400"}`}>
                                              {emp.name}
                                            </span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* ── SECTION 5: Effective Date ── */}
              <div className="px-5 py-3 bg-gray-50/50">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-400 text-[10px] font-bold text-white">5</span>
                    <p className="text-xs font-bold text-gray-800">Effective From</p>
                  </div>
                  <select
                    value={effectiveMonth}
                    onChange={(e) => setEffectiveMonth(Number(e.target.value))}
                    className={inputCls}
                  >
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                  <input
                    type="number"
                    value={effectiveYear}
                    onChange={(e) => setEffectiveYear(Number(e.target.value))}
                    className={`w-20 ${inputCls}`}
                    min={2020}
                    max={2099}
                  />
                  {uploadContext && (
                    <span className="text-[10px] text-gray-400">
                      Latest upload: {uploadContext.monthName} {uploadContext.year}
                    </span>
                  )}
                </div>
              </div>

              {/* ── SECTION 6: Monthly Training Schedule ── */}
              <div className="px-5 py-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">6</span>
                  <p className="text-xs font-bold text-gray-800">Monthly Training Schedule</p>
                  {scheduleLoading && <span className="ml-1 text-[10px] text-gray-400">loading…</span>}
                </div>
                <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
                  {monthsGrid.map(({ month: m, year: y, key, label, yr }) => (
                    <div key={key} className="text-center">
                      <p className="mb-1 text-[10px] font-semibold text-gray-500">
                        {label}<span className="text-[8px] text-gray-400"> &apos;{yr}</span>
                      </p>
                      <input
                        type="number"
                        value={schedule[key] ?? 0}
                        onChange={(e) =>
                          setSchedule((prev) => ({ ...prev, [key]: Math.max(0, Number(e.target.value)) }))
                        }
                        className="w-full rounded-lg border border-gray-200 px-1 py-1.5 text-center text-xs font-semibold text-gray-800 focus:border-purple-400 focus:outline-none"
                        min={0}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-gray-400">
                  Auto-fetched from Training Matrix. Editable for future planning.
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 border-t bg-white px-5 py-3">
          {error && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-gray-400">
              {selectedSop
                ? `${selectedSop.identifier} → ${selectedDeptCount} dept${selectedDeptCount !== 1 ? "s" : ""} · ${selectedEmpCount} employee${selectedEmpCount !== 1 ? "s" : ""}`
                : "Select a SOP above to continue"
              }
            </p>
            <div className="flex gap-2">
              <button onClick={onClose} className="rounded-lg border px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !selectedSop || selectedEmpCount === 0}
                className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white shadow hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                {saving ? "Saving…" : `Add to Matrix${selectedEmpCount > 0 ? ` (${selectedEmpCount})` : ""}`}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
