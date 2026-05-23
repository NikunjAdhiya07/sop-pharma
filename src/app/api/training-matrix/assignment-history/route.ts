import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MatrixSOPAssignment from '@/models/MatrixSOPAssignment';

export const dynamic = 'force-dynamic';

// GET /api/training-matrix/assignment-history?limit=50&department=QA
// Returns recent MatrixSOPAssignment records (manual assignments via Manage SOPs modal).
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const limit      = Math.min(Number(req.nextUrl.searchParams.get('limit') || '50'), 200);
    const department = req.nextUrl.searchParams.get('department');

    const filter: Record<string, unknown> = {};
    if (department) filter.department = department;

    const records = await MatrixSOPAssignment.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({
      assignments: records.map((r: any) => ({
        _id:           String(r._id),
        sopCode:       r.sopCode,
        sopName:       r.sopName,
        department:    r.department,
        effectiveMonth: r.effectiveMonth,
        effectiveYear:  r.effectiveYear,
        createdBy:     r.createdBy,
        isActive:      r.isActive,
        createdAt:     r.createdAt,
      })),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
