import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingVideo from '@/models/TrainingVideo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Returns { byDepartment: { [dept]: number }, total: number } */
export async function GET() {
  await connectDB();
  const rows = await TrainingVideo.aggregate([
    { $match: { active: true } },
    { $group: { _id: '$department', count: { $sum: 1 } } },
  ]);
  const byDepartment: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const dept = (r._id || 'Unknown') as string;
    byDepartment[dept] = r.count;
    total += r.count;
  }
  return NextResponse.json({ byDepartment, total });
}
