'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { X, Download, Search, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { ManageSOPViewResponse, SOPViewRow } from '@/app/api/training-matrix/manage-sop-view/route';

const DEFAULT_DEPARTMENTS = ['QA', 'QC', 'Microbiology', 'Production', 'Store', 'Engineering', 'Personnel'] as const;

const DEPT_ABBR: Record<string, string> = {
  QA: 'QA',
  QC: 'QC',
  Microbiology: 'MICR',
  Production: 'PROD',
  Store: 'STOR',
  Engineering: 'ENGI',
  Personnel: 'PERS'
};

const DEPT_COLORS: Record<string, string> = {
  QA: '#7c3aed',
  QC: '#059669',
  Microbiology: '#2563eb',
  Production: '#d97706',
  Store: '#ea580c',
  Engineering: '#0891b2',
  Personnel: '#db2777',
};

const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

type FilterType = 'all' | 'assigned' | 'unassigned';

interface ManageSOPModalProps {
  departments?: string[];
  onClose: () => void;
  onRefresh?: () => void;
}

export default function ManageSOPModal({ onClose }: ManageSOPModalProps) {
  const [viewData, setViewData] = useState<ManageSOPViewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [activeDepts, setActiveDepts] = useState<Set<string>>(new Set(DEFAULT_DEPARTMENTS));
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/training-matrix/manage-sop-view?year=all`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setViewData(data);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredSops = useMemo(() => {
    if (!viewData) return [];
    return viewData.sops.filter(sop => {
      const matchSearch = !search ||
        sop.sopCode.toLowerCase().includes(search.toLowerCase()) ||
        sop.sopName.toLowerCase().includes(search.toLowerCase());

      // Match the main training-matrix page: an SOP is "assigned" when it has
      // a scheduled month in any dept (from TrainingMatrixUpload snapshot).
      const isScheduled = sop.deptStats.some(ds => ds.scheduledMonth);
      let matchFilter = true;

      if (filterType === 'assigned') matchFilter = isScheduled;
      if (filterType === 'unassigned') matchFilter = !isScheduled;

      return matchSearch && matchFilter;
    });
  }, [viewData, search, filterType]);

  const paginatedSops = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return filteredSops.slice(start, start + rowsPerPage);
  }, [filteredSops, page, rowsPerPage]);

  const totalPages = Math.ceil(filteredSops.length / rowsPerPage);

  const stats = useMemo(() => {
    if (!viewData) return { all: 0, assigned: 0, unassigned: 0 };
    // Use the server's pre-computed counts so the cards match the main
    // training-matrix page (e.g. 702 assigned / 43 unassigned).
    return {
      all: viewData.stats.total,
      assigned: viewData.stats.assigned,
      unassigned: viewData.stats.unassigned,
    };
  }, [viewData]);

  const visibleDepartments = useMemo(
    () => (viewData?.departments || []).filter(d => activeDepts.has(d)),
    [viewData, activeDepts]
  );

  const toggleDept = (dept: string) => {
    const newDepts = new Set(activeDepts);
    if (newDepts.has(dept)) {
      newDepts.delete(dept);
    } else {
      newDepts.add(dept);
    }
    setActiveDepts(newDepts);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-lg p-12 shadow-2xl">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading Training Matrix...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-lg p-8 max-w-sm shadow-2xl">
          <p className="text-red-600 font-medium mb-4">{error}</p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-900 text-white rounded hover:bg-black"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 overflow-hidden">
      <div className="absolute inset-0 bg-white flex flex-col rounded-lg m-2 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Manage SOPs</h1>
            <p className="text-xs text-gray-500 mt-0.5">Enterprise Training Matrix Dashboard</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded transition"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Summary Cards */}
        <div className="border-b border-gray-200 bg-white px-6 py-3 flex-shrink-0">
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="All SOPs"
              value={stats.all}
              onClick={() => { setFilterType('all'); setPage(1); }}
              active={filterType === 'all'}
              icon="📊"
            />
            <StatCard
              label="Assigned SOPs"
              value={stats.assigned}
              onClick={() => { setFilterType('assigned'); setPage(1); }}
              active={filterType === 'assigned'}
              icon="✓"
            />
            <StatCard
              label="Unassigned SOPs"
              value={stats.unassigned}
              onClick={() => { setFilterType('unassigned'); setPage(1); }}
              active={filterType === 'unassigned'}
              icon="!"
            />
          </div>
        </div>

        {/* Controls */}
        <div className="border-b border-gray-200 bg-white px-6 py-3 flex items-center gap-2 flex-shrink-0">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search SOP code or name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>
          <button className="p-2 border border-gray-300 rounded hover:bg-gray-50 text-gray-600">
            <Filter className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              const exportData = filteredSops.map((sop, idx) => {
                const row: any = {
                  'SR NO': idx + 1,
                  'SOP NO': sop.sopCode,
                  'SOP NAME': sop.sopName,
                };

                // Add department totals
                viewData?.departments.forEach(dept => {
                  const stat = sop.deptStats.find(ds => ds.department === dept);
                  row[DEPT_ABBR[dept]] = stat?.total || 0;
                });

                // Add monthly data
                MONTH_SHORT.forEach((month, monthIdx) => {
                  const monthTotal = viewData?.departments.reduce((sum, dept) => {
                    const stat = sop.deptStats.find(d => d.department === dept);
                    return sum + (stat?.monthlyCounts[monthIdx + 1] || 0);
                  }, 0) || 0;
                  row[month] = monthTotal;
                });

                row['TOTAL'] = sop.grandTotal;
                return row;
              });

              const ws = XLSX.utils.json_to_sheet(exportData);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, 'Manage SOPs');
              XLSX.writeFile(wb, `manage-sop-${new Date().toISOString().split('T')[0]}.xlsx`);
            }}
            className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-2 text-xs font-medium"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>

        {/* Main Table */}
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
          {filteredSops.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-gray-500 text-sm font-medium">No SOPs found</p>
                <p className="text-gray-400 text-xs mt-1">Try adjusting your search or filters</p>
              </div>
            </div>
          ) : (
            <>
              {/* Department filter chips */}
              <div className="bg-white border-b border-gray-200 px-6 py-2 flex flex-wrap items-center gap-2 flex-shrink-0">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Departments:</span>
                {viewData?.departments.map(dept => {
                  const active = activeDepts.has(dept);
                  return (
                    <button
                      key={`chip-${dept}`}
                      onClick={() => toggleDept(dept)}
                      className={`px-2 py-1 rounded text-[11px] font-bold border transition ${
                        active ? 'bg-white' : 'bg-gray-50 opacity-50'
                      }`}
                      style={{
                        borderColor: DEPT_COLORS[dept],
                        color: DEPT_COLORS[dept]
                      }}
                    >
                      {DEPT_ABBR[dept]}
                    </button>
                  );
                })}
              </div>

              <div className="flex-1 overflow-auto">
                <table className="w-full bg-white border-collapse">
                  <thead className="sticky top-0 z-20 bg-white">
                    <tr className="border-b border-gray-300">
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 sticky left-0 z-30 bg-gray-50 border-r border-gray-300 w-[50px]">
                        SR NO
                      </th>
                      <th
                        className="px-3 py-2 text-left text-xs font-bold text-gray-600 sticky bg-gray-50 border-r border-gray-300 w-[110px]"
                        style={{ left: '50px', zIndex: 29 }}
                      >
                        SOP NO
                      </th>
                      <th
                        className="px-3 py-2 text-left text-xs font-bold text-gray-600 sticky bg-gray-50 border-r border-gray-300 w-[240px]"
                        style={{ left: '160px', zIndex: 28 }}
                      >
                        SOP NAME
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 bg-gray-50 border-r border-gray-300 w-[120px] align-top">
                        DEPARTMENTS
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 bg-gray-50 border-r border-gray-300 w-[260px] align-top">
                        DEPARTMENT WITH DESIGNATION
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 bg-gray-50 border-r border-gray-300 w-[220px] align-top">
                        MONTHS
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-bold text-white bg-purple-600 w-[70px] align-top">
                        TOTAL
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedSops.map((sop, rowIdx) => {
                      const assignedDepts = visibleDepartments.filter(dept => {
                        const ds = sop.deptStats.find(s => s.department === dept);
                        return ds?.isAssigned;
                      });

                      const monthBlocks = MONTH_SHORT.map((month, mIdx) => {
                        const monthNum = mIdx + 1;
                        const deptEntries = visibleDepartments
                          .map(dept => {
                            const ds = sop.deptStats.find(s => s.department === dept);
                            return { dept, count: ds?.monthlyCounts[monthNum] || 0 };
                          })
                          .filter(e => e.count > 0);
                        return { month, entries: deptEntries };
                      }).filter(b => b.entries.length > 0);

                      // Assigned = SOP has at least one scheduled month in any dept
                      // (same definition as the assigned/unassigned filter cards above).
                      const isAssignedRow = sop.deptStats.some(ds => ds.scheduledMonth);
                      const rowBg = isAssignedRow ? 'bg-green-50' : 'bg-red-50';
                      const rowHover = isAssignedRow ? 'hover:bg-green-100' : 'hover:bg-red-100';
                      const totalBg = isAssignedRow ? 'bg-green-100' : 'bg-red-100';

                      return (
                        <tr key={sop.sopCode} className={`border-b border-gray-200 ${rowHover} align-top`}>
                          {/* SR NO */}
                          <td className={`px-3 py-3 text-xs text-gray-700 sticky left-0 z-10 ${rowBg} border-r border-gray-200 font-medium w-[50px] align-top`}>
                            {(page - 1) * rowsPerPage + rowIdx + 1}
                          </td>

                          {/* SOP NO */}
                          <td
                            className={`px-3 py-3 text-xs font-bold sticky ${rowBg} border-r border-gray-200 w-[110px] align-top`}
                            style={{ left: '50px', zIndex: 9, color: DEPT_COLORS.QA }}
                          >
                            {sop.sopCode}
                          </td>

                          {/* SOP NAME */}
                          <td
                            className={`px-3 py-3 text-xs font-semibold text-gray-900 sticky ${rowBg} border-r border-gray-200 w-[240px] align-top`}
                            style={{ left: '160px', zIndex: 8 }}
                          >
                            <div className="whitespace-normal break-words leading-snug" title={sop.sopName}>
                              {sop.sopName || '—'}
                            </div>
                          </td>

                          {/* DEPARTMENTS — vertical list */}
                          <td className={`px-3 py-3 border-r border-gray-200 align-top w-[120px] ${rowBg}`}>
                            {assignedDepts.length === 0 ? (
                              <span className="text-xs text-gray-400">—</span>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                {assignedDepts.map(dept => (
                                  <span
                                    key={`dep-${sop.sopCode}-${dept}`}
                                    className="text-xs font-bold leading-tight"
                                    style={{ color: DEPT_COLORS[dept] }}
                                  >
                                    {DEPT_ABBR[dept]}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          {/* DEPARTMENT WITH DESIGNATION — nested vertical */}
                          <td className={`px-3 py-3 border-r border-gray-200 align-top w-[260px] ${rowBg}`}>
                            {assignedDepts.length === 0 ? (
                              <span className="text-xs text-gray-400">—</span>
                            ) : (
                              <div className="flex flex-col gap-2">
                                {assignedDepts.map(dept => {
                                  const ds = sop.deptStats.find(s => s.department === dept);
                                  const desigs = (ds?.designations || []).filter(d => d.isAssigned);
                                  if (desigs.length === 0) return null;
                                  return (
                                    <div key={`dwd-${sop.sopCode}-${dept}`} className="leading-tight">
                                      <div
                                        className="text-xs font-bold mb-0.5"
                                        style={{ color: DEPT_COLORS[dept] }}
                                      >
                                        {DEPT_ABBR[dept]}
                                      </div>
                                      <div className="flex flex-col gap-0.5 pl-2 border-l-2" style={{ borderColor: DEPT_COLORS[dept] }}>
                                        {desigs.map(d => {
                                          const empCount = viewData?.employeeCountsByDeptDesig[dept]?.[d.designation] || 0;
                                          return (
                                            <div
                                              key={`dwd-${sop.sopCode}-${dept}-${d.designation}`}
                                              className="text-[11px] text-gray-700 flex items-baseline gap-1"
                                            >
                                              <span className="font-medium">{d.designation}</span>
                                              <span className="text-gray-400">→</span>
                                              <span className="font-semibold text-gray-900">{empCount} emp</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>

                          {/* MONTHS — nested month → depts */}
                          <td className={`px-3 py-3 border-r border-gray-200 align-top w-[220px] ${rowBg}`}>
                            {monthBlocks.length === 0 ? (
                              <span className="text-xs text-gray-400">—</span>
                            ) : (
                              <div className="flex flex-col gap-2">
                                {monthBlocks.map(block => (
                                  <div key={`mo-${sop.sopCode}-${block.month}`} className="leading-tight">
                                    <div className="text-xs font-bold text-blue-700 mb-0.5">
                                      {block.month}
                                    </div>
                                    <div className="flex flex-col gap-0.5 pl-2 border-l-2 border-blue-200">
                                      {block.entries.map(e => (
                                        <div
                                          key={`mo-${sop.sopCode}-${block.month}-${e.dept}`}
                                          className="text-[11px] flex items-baseline gap-1"
                                        >
                                          <span className="font-medium" style={{ color: DEPT_COLORS[e.dept] }}>
                                            {DEPT_ABBR[e.dept]}
                                          </span>
                                          <span className="text-gray-400">→</span>
                                          <span className="font-semibold text-gray-900">{e.count}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>

                          {/* TOTAL */}
                          <td className={`px-3 py-3 text-center ${totalBg} align-top w-[70px]`}>
                            <span className={`text-sm font-bold ${isAssignedRow ? 'text-green-700' : 'text-red-700'}`}>
                              {sop.grandTotal > 0 ? sop.grandTotal : '—'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              <div className="bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between text-xs flex-shrink-0">
                <div className="text-gray-600">
                  Showing {filteredSops.length === 0 ? 0 : (page - 1) * rowsPerPage + 1}–{Math.min(page * rowsPerPage, filteredSops.length)} of {filteredSops.length}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={rowsPerPage}
                    onChange={(e) => {
                      setRowsPerPage(parseInt(e.target.value));
                      setPage(1);
                    }}
                    className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    <option value={10}>10 rows</option>
                    <option value={20}>20 rows</option>
                    <option value={25}>25 rows</option>
                    <option value={50}>50 rows</option>
                  </select>
                  <button
                    onClick={() => setPage(p => Math.max(p - 1, 1))}
                    disabled={page === 1}
                    className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <span className="text-xs text-gray-600 px-2 min-w-16 text-center">
                    {totalPages === 0 ? 0 : page}/{totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                    disabled={page === totalPages || totalPages === 0}
                    className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  onClick: () => void;
  active: boolean;
  icon: string;
}

function StatCard({ label, value, onClick, active, icon }: StatCardProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-medium transition ${
        active
          ? 'bg-purple-50 border-purple-300 text-purple-700'
          : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
      }`}
    >
      <span className="text-base">{icon}</span>
      <div className="text-left">
        <div className="font-bold text-sm">{value}</div>
        <div className="text-xs opacity-75">{label}</div>
      </div>
    </button>
  );
}
