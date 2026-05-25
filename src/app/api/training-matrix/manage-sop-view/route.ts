import connectDB from '@/lib/mongodb';
import MatrixSOPAssignment from '@/models/MatrixSOPAssignment';
import TrainingMatrixRecord from '@/models/TrainingMatrixRecord';
import Employee from '@/models/Employee';
import SOP from '@/models/SOP';
import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_DEPARTMENTS = ['QA', 'QC', 'Microbiology', 'Production', 'Store', 'Engineering', 'Personnel'];
const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function stripVersion(code: string): string {
  return code.split('-').shift() || code;
}

export interface SOPViewDesignationStat {
  designation: string;
  isAssigned: boolean;
  count: number;
}

export interface SOPViewDeptStat {
  department: string;
  isAssigned: boolean;
  designations: SOPViewDesignationStat[];
  monthlyCounts: Record<number, number>;
  total: number;
}

export interface SOPViewRow {
  sopCode: string;
  sopName: string;
  deptStats: SOPViewDeptStat[];
  grandTotal: number;
}

export interface ManageSOPViewResponse {
  sops: SOPViewRow[];
  departments: string[];
  designationsByDept: Record<string, string[]>;
  employeeCountsByDeptDesig: Record<string, Record<string, number>>;
  stats: { total: number; assigned: number; unassigned: number };
  year: number;
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const year = parseInt(searchParams.get('year') || '') || new Date().getFullYear();
    const search = searchParams.get('search')?.toLowerCase() || '';

    // Parallel queries - fetch from training matrix data
    const [assignments, trainingRecords, trainingAgg, employees, allSOPs] = await Promise.all([
      MatrixSOPAssignment.find({ isActive: true })
        .select('sopCode sopName department designationApplicability')
        .lean(),
      TrainingMatrixRecord.find({ year })
        .select('sopCode sopName department designation month')
        .lean(),
      TrainingMatrixRecord.aggregate([
        { $match: { year } },
        {
          $group: {
            _id: { sopCode: '$sopCode', department: '$department', designation: '$designation', month: '$month' },
            count: { $sum: 1 }
          }
        }
      ]),
      Employee.find({ isActive: true })
        .select('department designation')
        .lean(),
      SOP.find().select('identifier name').lean()
    ]);

    // Build designation set per department AND count employees per dept per designation
    const designationsByDept = new Map<string, Set<string>>();
    const empCountMap = new Map<string, Map<string, number>>();
    for (const dept of DEFAULT_DEPARTMENTS) {
      designationsByDept.set(dept, new Set<string>());
      empCountMap.set(dept, new Map<string, number>());
    }
    for (const emp of employees as any[]) {
      if (!emp.department || !emp.designation) continue;
      const set = designationsByDept.get(emp.department);
      if (set) set.add(emp.designation as string);
      const deptMap = empCountMap.get(emp.department);
      if (deptMap) deptMap.set(emp.designation as string, (deptMap.get(emp.designation as string) ?? 0) + 1);
    }

    // Build training data map: sopCode → dept → designation → month → count
    const trainingMap = new Map<string, Map<string, Map<string, Map<number, number>>>>();
    for (const record of trainingAgg) {
      const id = record._id as any;
      const stripCode = stripVersion(id.sopCode || '');
      if (!trainingMap.has(stripCode)) {
        trainingMap.set(stripCode, new Map());
      }
      const deptMap = trainingMap.get(stripCode)!;
      if (!deptMap.has(id.department)) {
        deptMap.set(id.department, new Map());
      }
      const designationMap = deptMap.get(id.department)!;
      if (!designationMap.has(id.designation)) {
        designationMap.set(id.designation, new Map());
      }
      const monthMap = designationMap.get(id.designation)!;
      monthMap.set(id.month as number, (record.count as number) || 0);
    }

    // Build assignment map: sopCode → dept → { designationApplicability, isAssigned }
    const assignmentMap = new Map<string, Map<string, string[]>>();
    for (const assignment of assignments) {
      const stripCode = stripVersion(assignment.sopCode);
      if (!assignmentMap.has(stripCode)) {
        assignmentMap.set(stripCode, new Map());
      }
      const deptMap = assignmentMap.get(stripCode)!;
      deptMap.set(assignment.department, assignment.designationApplicability || []);
    }

    // Build SOP name map from SOP model
    const sopNameMap = new Map<string, string>();
    for (const sop of allSOPs as any[]) {
      if (sop.identifier && sop.name) {
        sopNameMap.set(stripVersion(sop.identifier).toUpperCase(), sop.name);
      }
    }

    // Collect all unique SOPs from training matrix records and assignments
    const sopSet = new Map<string, string>(); // sopCode → sopName

    // Helper to check if code/name is valid
    const isValidSopCode = (code: string): boolean => {
      if (!code || code.trim() === '') return false;
      const trimmed = code.trim();
      // Filter out placeholder/invalid entries (dashes, checkmarks, etc.)
      if (/^[-–—√✓✗×•·*]+$/.test(trimmed)) return false;
      return true;
    };

    const isValidSopName = (name: string): boolean => {
      if (!name || name.trim() === '') return false;
      const trimmed = name.trim();
      // Filter out placeholder/invalid entries
      if (/^[-–—√✓✗×•·*]+$/.test(trimmed)) return false;
      return true;
    };

    // Add SOPs from training records (actual matrix data)
    for (const record of trainingRecords) {
      const stripCode = stripVersion((record as any).sopCode || '');
      // Try to get name from SOP model first, then fall back to record, then code
      let sopName = sopNameMap.get(stripCode.toUpperCase()) ||
                    (record as any).sopName ||
                    stripCode;
      if (isValidSopCode(stripCode) && isValidSopName(sopName)) {
        sopSet.set(stripCode, sopName);
      }
    }

    // Add SOPs from assignments (in case they have no training records yet)
    for (const assignment of assignments) {
      const stripCode = stripVersion(assignment.sopCode);
      if (!sopSet.has(stripCode)) {
        // Try to get name from SOP model first, then fall back to assignment
        let sopName = sopNameMap.get(stripCode.toUpperCase()) ||
                      assignment.sopName ||
                      stripCode;
        if (isValidSopCode(stripCode) && isValidSopName(sopName)) {
          sopSet.set(stripCode, sopName);
        }
      }
    }

    // Apply search filter
    const filteredSOPs = Array.from(sopSet.entries()).filter(([code, name]) => {
      if (!search) return true;
      return code.toLowerCase().includes(search) || name.toLowerCase().includes(search);
    });

    // Build response rows
    const sops: SOPViewRow[] = filteredSOPs.map(([sopCode, sopName]) => {
      const deptStats: SOPViewDeptStat[] = DEFAULT_DEPARTMENTS.map(dept => {
        const deptAssignments = assignmentMap.get(sopCode)?.get(dept) || [];
        const isAssigned = deptAssignments.length > 0;

        const designationTraining = trainingMap.get(sopCode)?.get(dept) || new Map<string, Map<number, number>>();
        const designations: SOPViewDesignationStat[] = Array.from(designationsByDept.get(dept) || new Set<string>()).map(
          (designation: string): SOPViewDesignationStat => {
            const monthCounts = designationTraining.get(designation) || new Map<number, number>();
            const count: number = Array.from(monthCounts.values()).reduce((a: number, b: number) => a + b, 0);
            return {
              designation,
              isAssigned: deptAssignments.includes(designation),
              count
            };
          }
        );

        const monthlyCounts: Record<number, number> = {};
        for (let m = 1; m <= 12; m++) {
          let monthTotal = 0;
          for (const designationMap of designationTraining.values()) {
            monthTotal += designationMap.get(m) || 0;
          }
          monthlyCounts[m] = monthTotal;
        }

        const total = Object.values(monthlyCounts).reduce((a, b) => a + b, 0);

        return {
          department: dept,
          isAssigned,
          designations,
          monthlyCounts,
          total
        };
      });

      const grandTotal = deptStats.reduce((sum, ds) => sum + ds.total, 0);

      return {
        sopCode,
        sopName,
        deptStats,
        grandTotal
      };
    });

    // Calculate stats
    const assignedSOPs = new Set<string>();
    for (const assignment of assignments) {
      assignedSOPs.add(stripVersion(assignment.sopCode));
    }
    const totalSOPs = sopSet.size;
    // Unassigned = SOPs with no active assignments
    const unassignedSOPs = totalSOPs - assignedSOPs.size;
    const assignedCount = assignedSOPs.size;

    // Convert designationsByDept to plain object
    const designationsByDeptObj: Record<string, string[]> = {};
    for (const [dept, set] of designationsByDept) {
      designationsByDeptObj[dept] = Array.from(set).sort();
    }

    // Convert employeeCountsByDeptDesig to plain object
    const employeeCountsByDeptDesigObj: Record<string, Record<string, number>> = {};
    for (const [dept, dMap] of empCountMap) {
      employeeCountsByDeptDesigObj[dept] = Object.fromEntries(dMap);
    }

    const response: ManageSOPViewResponse = {
      sops: sops.sort((a: SOPViewRow, b: SOPViewRow) => a.sopCode.localeCompare(b.sopCode)),
      departments: DEFAULT_DEPARTMENTS,
      designationsByDept: designationsByDeptObj,
      employeeCountsByDeptDesig: employeeCountsByDeptDesigObj,
      stats: {
        total: totalSOPs,
        assigned: assignedCount,
        unassigned: unassignedSOPs
      },
      year
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error in /api/training-matrix/manage-sop-view:', error);
    return NextResponse.json({ error: 'Failed to fetch SOP view data' }, { status: 500 });
  }
}
