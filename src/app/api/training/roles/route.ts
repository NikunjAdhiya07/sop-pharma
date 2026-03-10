import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MatrixEntry from '@/models/MatrixEntry';

/**
 * GET /api/training/roles
 * Returns distinct designations for a given employeeName (+ optional department).
 */
export async function GET(request: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const employeeName = searchParams.get('employeeName');
    const department   = searchParams.get('department');

    if (!employeeName) {
      return NextResponse.json({ success: false, error: 'employeeName is required' }, { status: 400 });
    }

    const match: Record<string, any> = { employeeName };
    if (department) match.department = department;

    const roles = await MatrixEntry.distinct('designation', match);

    return NextResponse.json({
      success: true,
      roles: roles.filter(Boolean).sort() as string[],
    });
  } catch (err: any) {
    console.error('[API] /api/training/roles error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
