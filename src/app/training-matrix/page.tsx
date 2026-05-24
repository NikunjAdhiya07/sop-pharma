'use client';

import { Fragment, useEffect, useState, useMemo } from 'react';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { CheckCircle, Circle } from 'lucide-react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const DESIGNATIONS = ['Sr Executive', 'Executive', 'Officer', 'Chemist', 'Worker'];

// Department order: as specified by user
const DEPT_ORDER = ['QA', 'QC', 'Microbiology', 'Production', 'Store', 'Engineering', 'Personnel'] as const;

const DEPT_COLORS: Record<string, string> = {
  QA: '#6366f1',
  QC: '#3b82f6',
  Microbiology: '#10b981',
  Production: '#f59e0b',
  Store: '#f97316',
  Engineering: '#64748b',
  Personnel: '#ec4899',
};

interface SOP {
  _id: string;
  identifier: string;
  name: string;
  department: string;
}

interface TrainingRecord {
  sopCode: string;
  designation: string;
  department: string;
  month: number;
  status: string;
}

interface StructuredSOP {
  id: string;
  index: number;
  sopNo: string;
  sopName: string;
  department: string;
  assigned: boolean;
  designationMonthData: Record<string, Record<number, number>>;
  deptDesignations: Record<string, { hasTraining: boolean; count: number }>;
}

type FilterType = 'all' | 'assigned' | 'unassigned';

function normalizeDept(dept: string): string {
  const t = (dept || '').toLowerCase();
  if (/micro/.test(t)) return 'Microbiology';
  if (/engineer|maint/.test(t)) return 'Engineering';
  if (/person|hr/.test(t)) return 'Personnel';
  if (/qa|quality.assur/.test(t)) return 'QA';
  if (/qc|quality.cont/.test(t)) return 'QC';
  if (/store/.test(t)) return 'Store';
  if (/prod/.test(t)) return 'Production';
  return dept;
}

function stripVersion(code: string): string {
  return String(code || '').toUpperCase().replace(/-\d+$/, '').trim();
}

function cleanSopName(name: string, sopNo: string): string {
  let cleaned = String(name || '').trim();
  // Remove SOP number from the beginning of the name
  const sopNoPattern = new RegExp(`^${sopNo}\\s*[-_:.]?\\s*`, 'i');
  cleaned = cleaned.replace(sopNoPattern, '').trim();
  // Remove common prefixes if still present
  cleaned = cleaned.replace(/^(sop|standard operating procedure|procedure)[-_:\s.]*/i, '').trim();
  return cleaned || name;
}

export default function TrainingMatrixPage() {
  useAuthGuard();
  const [sops, setSops] = useState<SOP[]>([]);
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([]);
  const [overviewData, setOverviewData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        setLoading(true);

        // Fetch overview data
        const overviewRes = await fetch('/api/training-matrix/overview', { cache: 'no-store' });
        const overviewJson = await overviewRes.json();
        if (!overviewJson.success) throw new Error('Failed to fetch overview');
        setOverviewData(overviewJson);

        // Fetch all SOPs
        const sopRes = await fetch('/api/training-matrix/all-sops', { cache: 'no-store' });
        const sopData = await sopRes.json();
        if (sopData.success && sopData.sops) {
          setSops(sopData.sops);
          console.log(`Loaded ${sopData.totalCount} SOPs`);
        } else throw new Error('Failed to fetch SOPs');

        // Fetch all training records
        const trainingRes = await fetch('/api/training-matrix/flat-records?limit=50000', { cache: 'no-store' });
        const trainingData = await trainingRes.json();
        if (trainingData.success && trainingData.records) {
          setTrainingRecords(trainingData.records);
          console.log(`Loaded ${trainingData.records.length} training records`);
        }

        setError('');
      } catch (e) {
        console.error('Failed to load data', e);
        setError('Error loading data: ' + (e instanceof Error ? e.message : String(e)));
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, []);

  // Build structured SOP data with training data
  const structuredSOPs = useMemo(() => {
    if (sops.length === 0 || !overviewData || trainingRecords.length === 0) return [];

    const sopCodesByDept = overviewData.sopCodesByDept || {};
    const assignedSopCodes = new Set<string>();

    // Collect assigned SOP codes
    Object.values(sopCodesByDept).forEach((codes: any) => {
      if (Array.isArray(codes)) {
        codes.forEach((code: string) => {
          assignedSopCodes.add(stripVersion(code));
        });
      }
    });

    // Build training data map: sopCode -> dept -> designation -> month -> count
    const trainingMap = new Map<string, Map<string, Map<string, Map<number, number>>>>();
    trainingRecords.forEach((record) => {
      const sopKey = stripVersion(record.sopCode);
      const dept = normalizeDept(record.department);

      if (!trainingMap.has(sopKey)) {
        trainingMap.set(sopKey, new Map());
      }
      const deptMap = trainingMap.get(sopKey)!;

      if (!deptMap.has(dept)) {
        deptMap.set(dept, new Map());
      }
      const designationMap = deptMap.get(dept)!;

      if (!designationMap.has(record.designation)) {
        designationMap.set(record.designation, new Map());
      }
      const monthMap = designationMap.get(record.designation)!;
      const count = monthMap.get(record.month) || 0;
      monthMap.set(record.month, count + 1);
    });

    let filtered = sops.map((sop) => {
      const strippedCode = stripVersion(sop.identifier);
      const assigned = assignedSopCodes.has(strippedCode);
      const sopDeptMap = trainingMap.get(strippedCode) || new Map();
      const sopDept = normalizeDept(sop.department);
      const deptTraining = sopDeptMap.get(sopDept) || new Map();

      // Build designation-month data for this SOP's department
      const designationMonthData: Record<string, Record<number, number>> = {};
      DESIGNATIONS.forEach((desig) => {
        designationMonthData[desig] = {};
        MONTH_NUMBERS.forEach((month) => {
          const monthData = deptTraining.get(desig);
          designationMonthData[desig][month] = monthData?.get(month) || 0;
        });
      });

      // Build department-designation data with checkbox status
      const deptDesignations: Record<string, { hasTraining: boolean; count: number }> = {};
      DESIGNATIONS.forEach((desig) => {
        const monthCounts = designationMonthData[desig] || {};
        const count = Object.values(monthCounts).reduce((a, b) => a + b, 0);
        deptDesignations[desig] = {
          hasTraining: count > 0,
          count,
        };
      });

      return {
        id: sop._id,
        sopNo: sop.identifier,
        sopName: cleanSopName(sop.name, sop.identifier),
        department: sopDept,
        assigned,
        designationMonthData,
        deptDesignations,
        index: 0,
      };
    });

    // Apply filter
    if (filter === 'assigned') {
      filtered = filtered.filter((sop) => sop.assigned);
    } else if (filter === 'unassigned') {
      filtered = filtered.filter((sop) => !sop.assigned);
    }

    return filtered.map((sop, idx) => ({ ...sop, index: idx + 1 }));
  }, [sops, overviewData, trainingRecords, filter]);

  // Get unique departments in correct order
  const departments = useMemo(() => {
    const depts = new Set<string>();
    structuredSOPs.forEach((sop) => {
      if (DEPT_COLORS[sop.department]) {
        depts.add(sop.department);
      }
    });
    // Sort by DEPT_ORDER
    return Array.from(depts).sort((a, b) => {
      const aIdx = DEPT_ORDER.indexOf(a as any);
      const bIdx = DEPT_ORDER.indexOf(b as any);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
  }, [structuredSOPs]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalSops = sops.length;
    const assignedCount = structuredSOPs.filter((s) => s.assigned).length;
    const unassignedCount = totalSops - assignedCount;
    return { totalSops, assignedCount, unassignedCount };
  }, [sops, structuredSOPs]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600 mx-auto"></div>
          <p className="text-gray-600 font-medium">Loading Training Matrix...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-lg font-semibold text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto w-full">
        {/* Header */}
        <div className="mb-6 sticky top-0 bg-gray-50 z-30 py-4">
          <h1 className="text-3xl font-bold text-gray-900">Training Matrix</h1>
          <p className="mt-1 text-sm text-gray-600">
            {structuredSOPs.length} SOPs across {departments.length} departments
          </p>

          {/* Filter Tabs */}
          <div className="mt-4 flex gap-2 flex-wrap">
            <button
              onClick={() => setFilter('all')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                filter === 'all'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-blue-400'
              }`}
            >
              <Circle size={16} />
              All
              <span className="ml-1 px-2 py-0.5 rounded text-xs font-bold bg-gray-100 text-gray-900">
                {stats.totalSops}
              </span>
            </button>

            <button
              onClick={() => setFilter('assigned')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                filter === 'assigned'
                  ? 'bg-green-600 text-white shadow-lg'
                  : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-green-400'
              }`}
            >
              <CheckCircle size={16} />
              Assigned
              <span className="ml-1 px-2 py-0.5 rounded text-xs font-bold bg-gray-100 text-gray-900">
                {stats.assignedCount}
              </span>
            </button>

            <button
              onClick={() => setFilter('unassigned')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                filter === 'unassigned'
                  ? 'bg-orange-600 text-white shadow-lg'
                  : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-orange-400'
              }`}
            >
              <Circle size={16} />
              Unassigned
              <span className="ml-1 px-2 py-0.5 rounded text-xs font-bold bg-gray-100 text-gray-900">
                {stats.unassignedCount}
              </span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border border-gray-300 bg-white rounded-lg shadow-sm">
          <table className="w-full border-collapse text-xs">
            {/* Header */}
            <thead className="sticky top-0 z-20 bg-gray-100 border-b-2 border-gray-300">
              <tr>
                <th className="sticky left-0 z-20 w-8 px-2 py-2 text-left font-bold text-gray-900 bg-gray-100">SR</th>
                <th className="sticky left-8 z-20 w-8 px-2 py-2 text-center font-bold text-gray-900 bg-gray-100">✓</th>
                <th className="sticky left-16 z-20 w-20 px-2 py-2 text-left font-bold text-gray-900 bg-gray-100">SOP NO</th>
                <th className="sticky left-36 z-20 px-3 py-2 text-left font-bold text-gray-900 bg-gray-100 min-w-[200px]">SOP NAME</th>

                {/* Departments with Designations */}
                {departments.map((dept) => (
                  <th
                    key={`dept-${dept}`}
                    colSpan={DESIGNATIONS.length}
                    className="px-2 py-2 text-center font-bold text-white text-xs"
                    style={{ backgroundColor: DEPT_COLORS[dept] }}
                  >
                    {dept}
                  </th>
                ))}

                {/* Months */}
                {MONTHS.map((month) => (
                  <th
                    key={`month-${month}`}
                    className="px-1 py-2 text-center font-bold text-blue-900 bg-blue-100 min-w-[40px]"
                  >
                    {month}
                  </th>
                ))}
              </tr>

              {/* Designation Sub-Headers */}
              <tr className="border-t border-gray-200 bg-gray-50">
                <th colSpan={4} className="bg-gray-100"></th>
                {departments.map((dept) => (
                  <Fragment key={`desig-${dept}`}>
                    {DESIGNATIONS.map((desig) => (
                      <th
                        key={`${dept}-${desig}`}
                        className="px-1 py-1 text-center text-xs font-semibold text-gray-700 bg-gray-50 border-r border-gray-200"
                        title={desig}
                      >
                        {desig.substring(0, 2).toUpperCase()}
                      </th>
                    ))}
                  </Fragment>
                ))}
                <th colSpan={MONTHS.length} className="bg-blue-50"></th>
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {structuredSOPs.length === 0 ? (
                <tr>
                  <td
                    colSpan={4 + departments.length * DESIGNATIONS.length + MONTHS.length}
                    className="px-4 py-8 text-center text-gray-500 font-medium"
                  >
                    No SOP data available
                  </td>
                </tr>
              ) : (
                structuredSOPs.map((sop) => (
                  <tr
                    key={sop.id}
                    className={`border-b border-gray-200 text-xs ${
                      sop.assigned ? 'hover:bg-blue-50 bg-white' : 'hover:bg-orange-50 bg-orange-50'
                    }`}
                  >
                    {/* SR */}
                    <td className="sticky left-0 z-10 bg-inherit px-2 py-2 text-center font-semibold text-gray-900">
                      {sop.index}
                    </td>

                    {/* Status */}
                    <td className="sticky left-8 z-10 bg-inherit px-2 py-2 text-center">
                      {sop.assigned ? (
                        <CheckCircle size={14} className="text-green-600 mx-auto" />
                      ) : (
                        <Circle size={14} className="text-orange-600 mx-auto" />
                      )}
                    </td>

                    {/* SOP NO */}
                    <td className="sticky left-16 z-10 bg-inherit px-2 py-2 font-bold text-gray-900">
                      {sop.sopNo}
                    </td>

                    {/* SOP NAME */}
                    <td className="sticky left-36 z-10 bg-inherit px-3 py-2 text-gray-800 font-medium max-w-[300px] truncate" title={sop.sopName}>
                      {sop.sopName}
                    </td>

                    {/* Department Designation Cells */}
                    {departments.map((dept) => (
                      <Fragment key={`cells-${sop.id}-${dept}`}>
                        {DESIGNATIONS.map((desig) => {
                          const desigData = sop.deptDesignations[desig];
                          const hasTraining = desigData?.hasTraining ?? false;
                          const count = desigData?.count ?? 0;
                          return (
                            <td
                              key={`${sop.id}-${dept}-${desig}`}
                              className="border-r border-gray-200 bg-inherit px-1 py-2 text-center"
                            >
                              <div className="flex flex-col items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={hasTraining}
                                  disabled
                                  className="w-4 h-4"
                                  title={hasTraining ? `${count} trainings` : 'No training'}
                                />
                                {count > 0 && (
                                  <span className="inline-flex items-center justify-center text-xs font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                                    {count}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </Fragment>
                    ))}

                    {/* Monthly Data */}
                    {MONTHS.map((_, idx) => {
                      const monthNum = idx + 1;
                      const count = Object.values(sop.designationMonthData).reduce(
                        (sum, desigData) => sum + (desigData[monthNum] || 0),
                        0
                      );
                      return (
                        <td
                          key={`${sop.id}-month-${monthNum}`}
                          className={`px-1 py-2 text-center font-semibold min-w-[40px] ${
                            sop.assigned
                              ? 'bg-blue-50 text-gray-900 hover:bg-blue-100'
                              : 'bg-orange-100 text-gray-900 hover:bg-orange-200'
                          }`}
                        >
                          {count || '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="mt-6 grid gap-4 grid-cols-2 md:grid-cols-4">
          {departments.map((dept) => {
            const deptSops = structuredSOPs.filter((s) => s.department === dept);
            return (
              <div
                key={`summary-${dept}`}
                className="rounded-lg border-2 border-gray-200 bg-white p-3"
                style={{ borderTopColor: DEPT_COLORS[dept], borderTopWidth: '4px' }}
              >
                <h3 className="font-bold text-sm text-gray-900">{dept}</h3>
                <p className="text-xs text-gray-600 mt-1">
                  SOPs: <span className="font-bold text-lg text-gray-900">{deptSops.length}</span>
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
