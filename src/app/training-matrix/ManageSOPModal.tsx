'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { X, Download, Search, Filter, ChevronDown } from 'lucide-react';
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

// Generate 2-letter abbreviations for designations
function getDesignationAbbr(designation: string): string {
  const parts = designation.split(' ').filter(p => p.length > 0);
  if (parts.length === 0) return '--';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

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
        const year = new Date().getFullYear();
        const res = await fetch(`/api/training-matrix/manage-sop-view?year=${year}`);
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

      const hasAssignments = sop.deptStats.some(ds => ds.isAssigned);
      let matchFilter = true;

      if (filterType === 'assigned') matchFilter = hasAssignments;
      if (filterType === 'unassigned') matchFilter = !hasAssignments;

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
    const assigned = viewData.sops.filter(s => s.deptStats.some(ds => ds.isAssigned)).length;
    return {
      all: viewData.sops.length,
      assigned,
      unassigned: viewData.sops.length - assigned
    };
  }, [viewData]);

  // Build all designation columns: dept → designations
  const allDesigCols = useMemo(() =>
    viewData?.departments.flatMap(dept =>
      (viewData.designationsByDept[dept] || []).map(desig => ({ dept, desig }))
    ) || [],
    [viewData]
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

  const toggleAllDepts = () => {
    if (activeDepts.size === DEFAULT_DEPARTMENTS.length) {
      setActiveDepts(new Set());
    } else {
      setActiveDepts(new Set(DEFAULT_DEPARTMENTS));
    }
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
              <div className="flex-1 overflow-auto">
                <table className="w-full bg-white border-collapse">
                  <thead className="sticky top-0 z-20 bg-white">
                    {/* Row 1: Section Headers */}
                    <tr className="border-b border-gray-300">
                      <th rowSpan={3} className="px-3 py-2 text-left text-xs font-bold text-gray-600 sticky left-0 z-30 bg-white border-r border-gray-300 w-[40px]">
                        SR NO
                      </th>
                      <th rowSpan={3} className="px-3 py-2 text-left text-xs font-bold text-gray-600 sticky bg-white border-r border-gray-300 w-[80px]" style={{ left: '40px', zIndex: 29 }}>
                        SOP NO
                      </th>
                      <th rowSpan={3} className="px-3 py-2 text-left text-xs font-bold text-gray-600 sticky bg-white border-r border-gray-300 w-[160px]" style={{ left: '120px', zIndex: 28 }}>
                        SOP NAME
                      </th>

                      {/* DEPARTMENTS Section */}
                      <th colSpan={7} className="px-3 py-2 text-center text-xs font-bold text-gray-600 bg-white border-r border-gray-300">
                        DEPARTMENTS
                      </th>

                      {/* DEPARTMENT WITH DESIGNATION Section */}
                      <th colSpan={allDesigCols.length} className="px-3 py-2 text-center text-xs font-bold text-gray-600 bg-white border-r border-gray-300">
                        DEPARTMENT WITH DESIGNATION
                      </th>

                      {/* Monthly columns */}
                      {MONTH_SHORT.map(month => (
                        <th key={`mh-${month}`} rowSpan={3} className="px-2 py-2 text-center text-xs font-bold text-gray-600 bg-blue-50 border-r border-gray-300 w-10">
                          {month}
                        </th>
                      ))}

                      {/* TOTAL */}
                      <th rowSpan={3} className="px-3 py-2 text-center text-xs font-bold text-white bg-purple-600 border-l border-gray-300 w-12">
                        TOTAL
                      </th>
                    </tr>

                    {/* Row 2: Department Names */}
                    <tr className="border-b border-gray-300">
                      {/* DEPARTMENTS section: dept names with checkboxes */}
                      {viewData?.departments.map(dept => (
                        activeDepts.has(dept) && (
                          <th key={`dh-${dept}`} rowSpan={2} className="px-2 py-2 text-center border-r border-gray-300 bg-white" style={{ minWidth: '60px' }}>
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="checkbox"
                                checked={activeDepts.has(dept)}
                                onChange={() => toggleDept(dept)}
                                className="w-3 h-3 cursor-pointer"
                              />
                              <span className="text-xs font-bold" style={{ color: DEPT_COLORS[dept] }}>
                                {DEPT_ABBR[dept]}
                              </span>
                            </div>
                          </th>
                        )
                      ))}

                      {/* DEPT+DESIG section: dept headers spanning designations */}
                      {viewData?.departments.map(dept => {
                        if (!activeDepts.has(dept)) return null;
                        const desigCount = viewData.designationsByDept[dept]?.length || 0;
                        return desigCount > 0 ? (
                          <th
                            key={`ddh-${dept}`}
                            colSpan={desigCount}
                            className="px-3 py-2 text-center text-sm font-bold bg-white border-r border-gray-300"
                            style={{ color: DEPT_COLORS[dept], borderLeft: `4px solid ${DEPT_COLORS[dept]}`, minWidth: `${desigCount * 80}px` }}
                          >
                            {DEPT_ABBR[dept]}
                          </th>
                        ) : null;
                      })}
                    </tr>

                    {/* Row 3: Designation Names */}
                    <tr className="border-b border-gray-200">
                      {/* DEPT+DESIG section: individual designation headers */}
                      {allDesigCols.map((col, idx) => {
                        if (!activeDepts.has(col.dept)) return null;
                        const empCount = viewData?.employeeCountsByDeptDesig[col.dept]?.[col.desig] || 0;
                        const abbr = getDesignationAbbr(col.desig);
                        return (
                          <th
                            key={`dsh-${col.dept}-${col.desig}-${idx}`}
                            className="px-1.5 py-2 text-center border-r border-gray-300 bg-white"
                            style={{ minWidth: '80px', borderTop: `2px solid ${DEPT_COLORS[col.dept]}` }}
                          >
                            <div className="text-xs font-bold text-gray-900 leading-tight">
                              {abbr}
                            </div>
                            <div className="text-xs text-gray-600 leading-tight">
                              {col.desig}
                            </div>
                            <div className="text-xs text-gray-500 leading-tight">
                              {empCount} emp
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedSops.map((sop, rowIdx) => (
                      <tr key={sop.sopCode} className="border-b border-gray-200 hover:bg-gray-50">
                        {/* SR NO */}
                        <td className="px-3 py-2 text-xs text-gray-700 sticky left-0 z-10 bg-white border-r border-gray-300 font-medium w-[40px]">
                          {(page - 1) * rowsPerPage + rowIdx + 1}
                        </td>

                        {/* SOP NO */}
                        <td
                          className="px-3 py-2 text-xs font-bold sticky bg-white border-r border-gray-300 w-[80px]"
                          style={{ left: '40px', zIndex: 9, color: DEPT_COLORS.QA }}
                        >
                          {sop.sopCode}
                        </td>

                        {/* SOP NAME */}
                        <td
                          className="px-3 py-2 text-xs font-semibold text-gray-900 sticky bg-white border-r border-gray-300 w-[160px]"
                          style={{ left: '120px', zIndex: 8 }}
                        >
                          <div className="line-clamp-2">{sop.sopName}</div>
                        </td>

                        {/* DEPARTMENTS section: assignment indicators */}
                        {viewData?.departments.map(dept => {
                          if (!activeDepts.has(dept)) return null;
                          const deptStat = sop.deptStats.find(ds => ds.department === dept);
                          return (
                            <td
                              key={`db-${sop.sopCode}-${dept}`}
                              className="px-2 py-2 text-center border-r border-gray-300 bg-white"
                            >
                              <div
                                className="text-xs font-bold"
                                style={{ color: deptStat?.isAssigned ? DEPT_COLORS[dept] : '#999' }}
                              >
                                {deptStat?.isAssigned ? '✓' : '—'}
                              </div>
                            </td>
                          );
                        })}

                        {/* DEPT+DESIG section: per-designation training counts */}
                        {allDesigCols.map((col, idx) => {
                          if (!activeDepts.has(col.dept)) return null;
                          const deptStat = sop.deptStats.find(ds => ds.department === col.dept);
                          const desigStat = deptStat?.designations.find(d => d.designation === col.desig);
                          const count = desigStat?.count || 0;
                          const isAssigned = desigStat?.isAssigned ?? false;

                          return (
                            <td
                              key={`dd-${sop.sopCode}-${col.dept}-${col.desig}-${idx}`}
                              className="px-1.5 py-2 text-center border-r border-gray-300 bg-white"
                            >
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={isAssigned}
                                  disabled
                                  className="w-3 h-3 cursor-default"
                                />
                              </div>
                              <div
                                className="text-xs font-bold mt-0.5"
                                style={{ color: count > 0 && isAssigned ? DEPT_COLORS[col.dept] : '#999' }}
                              >
                                {count > 0 ? count : '—'}
                              </div>
                            </td>
                          );
                        })}

                        {/* Monthly columns */}
                        {MONTH_SHORT.map((month, monthIdx) => {
                          const monthTotal = viewData?.departments.reduce((sum, dept) => {
                            const ds = sop.deptStats.find(d => d.department === dept);
                            return sum + (ds?.monthlyCounts[monthIdx + 1] || 0);
                          }, 0) || 0;

                          return (
                            <td
                              key={`m-${sop.sopCode}-${month}`}
                              className="px-2 py-2 text-center border-r border-gray-300 bg-blue-50"
                            >
                              <span
                                className="text-xs font-bold"
                                style={{ color: monthTotal > 0 ? '#1e40af' : '#999' }}
                              >
                                {monthTotal > 0 ? monthTotal : '—'}
                              </span>
                            </td>
                          );
                        })}

                        {/* TOTAL */}
                        <td className="px-3 py-2 text-center bg-purple-50 border-l border-gray-300">
                          <span className="text-xs font-bold text-purple-700">
                            {sop.grandTotal > 0 ? sop.grandTotal : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
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
