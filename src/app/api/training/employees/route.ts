import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MatrixEntry from '@/models/MatrixEntry';

/**
 * GET /api/training/employees
 * Returns distinct employee names + their departments + designations from MatrixEntry.
 * Optional ?department= filter.
 */
export async function GET(request: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const deptFilter = searchParams.get('department');

    const match: Record<string, any> = {};
    if (deptFilter) match.department = deptFilter;

    const raw = await MatrixEntry.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$employeeName',
          departments: { $addToSet: '$department' },
          designations: { $addToSet: '$designation' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const employees = raw.map(r => ({
      employeeName: r._id,
      departments: r.departments.filter(Boolean).sort(),
      designations: r.designations.filter(Boolean).sort(),
    }));

    return NextResponse.json({ success: true, employees });
  } catch (err: any) {
    console.error('[API] /api/training/employees error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
